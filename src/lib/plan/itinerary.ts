// 日帰りの行程を組む。資料館で予習 → 本命の社 → ゆかりの社、の順を基本にし、
// 自宅を出て帰るまでの時刻を見積もる。道路データは使わないので、時間は直線距離からの目安。
import type { AreaPlaces, Place } from "@/lib/types";

export type Role = "primer" | "anchor" | "kin";
export type Stop = { place: Place; role: Role };
export type TimedStop = Stop & { driveMin: number; arrive: number; depart: number; stayMin: number };
export type Plan = { start: number; stops: TimedStop[]; returnMin: number; home: number; overMin: number };

// 滞在の目安（分）
export const STAY_MIN: Record<Role, number> = { primer: 60, anchor: 60, kin: 30 };
// 行程の終わりの目安（自宅に着く時刻、分）
export const DAY_END = 19 * 60;
const MAX_KIN = 5;
const PRIMER_MAX_KM = 25;

const kmBetween = ([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

// 道のりは直線の1.3倍、遠いほど幹線道路や高速を使える分だけ速いとみなす
export function driveMinutes(from: [number, number], to: [number, number]) {
  const road = kmBetween(from, to) * 1.3;
  const kmh = road > 40 ? 60 : road > 15 ? 45 : 35;
  return Math.round((road / kmh) * 60);
}

const at = (p: Place): [number, number] => [p.lng, p.lat];

export function schedule(stops: Stop[], home: [number, number], start = 8 * 60): Plan {
  let t = start;
  let here = home;
  const timed: TimedStop[] = stops.map((s) => {
    const driveMin = driveMinutes(here, at(s.place));
    const arrive = t + driveMin;
    const stayMin = STAY_MIN[s.role];
    t = arrive + stayMin;
    here = at(s.place);
    return { ...s, driveMin, arrive, depart: t, stayMin };
  });
  const returnMin = driveMinutes(here, home);
  const homeAt = t + returnMin;
  return { start, stops: timed, returnMin, home: homeAt, overMin: Math.max(0, homeAt - DAY_END) };
}

// 本命と、系統か祭神で縁のある社を先に、次に由緒の手がかりが多い社を並べる
function kinCandidates(places: AreaPlaces, anchor: Place) {
  const main = places.anchors.find((a) => a.id === anchor.id);
  const family = main?.en?.lineage?.family;
  const deities = new Set(main?.en?.deities.map((d) => d.name));
  const tie = (a: (typeof places.anchors)[number]) =>
    (family && a.en?.lineage?.family === family ? 2 : 0) + (a.en?.deities.some((d) => deities.has(d.name)) ? 2 : 0);
  return places.anchors
    .filter((a) => a.id !== anchor.id)
    .sort((a, b) => tie(b) - tie(a) || b.score - a.score);
}

// 本命を決めて、予習先と、日が暮れるまでに回れるゆかりの社を足した行程を作る
export function suggestPlan(places: AreaPlaces, home: [number, number], anchorId?: string, start = 8 * 60): Stop[] {
  const anchor = places.anchors.find((a) => a.id === anchorId) ?? places.anchors[0];
  if (!anchor) return [];
  const stops: Stop[] = [];
  const primer =
    anchor.primer?.place ??
    places.primers
      .map((p) => ({ p, km: kmBetween(at(p), at(anchor)) }))
      .filter((x) => x.km <= PRIMER_MAX_KM)
      .sort((a, b) => a.km - b.km)[0]?.p;
  if (primer) stops.push({ place: primer, role: "primer" });
  stops.push({ place: anchor, role: "anchor" });

  let added = 0;
  for (const cand of kinCandidates(places, anchor)) {
    if (added >= MAX_KIN) break;
    const next = insertKin(stops, { place: cand, role: "kin" }, home, start);
    if (schedule(next, home, start).overMin > 0) continue;
    stops.splice(0, stops.length, ...next);
    added++;
  }
  return stops;
}

// ゆかりの社は本命より後ろの、帰りの時刻がいちばん早くなる位置に入れる
export function insertKin(stops: Stop[], kin: Stop, home: [number, number], start = 8 * 60): Stop[] {
  const anchorAt = stops.findIndex((s) => s.role === "anchor");
  let best: Stop[] | null = null;
  let bestHome = Infinity;
  for (let i = anchorAt + 1; i <= stops.length; i++) {
    const next = [...stops.slice(0, i), kin, ...stops.slice(i)];
    const h = schedule(next, home, start).home;
    if (h < bestHome) {
      bestHome = h;
      best = next;
    }
  }
  return best ?? [...stops, kin];
}

export const clock = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

// Google マップの経路（自宅発・自宅着、立ち寄りは9か所まで）
export const MAPS_WAYPOINT_MAX = 9;

export function googleMapsRoute(stops: Stop[], home: [number, number]) {
  const ll = ([lng, lat]: [number, number]) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const params = new URLSearchParams({
    api: "1",
    origin: ll(home),
    destination: ll(home),
    travelmode: "driving",
    waypoints: stops.slice(0, MAPS_WAYPOINT_MAX).map((s) => ll(at(s.place))).join("|"),
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
