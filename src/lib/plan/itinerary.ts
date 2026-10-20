// 日帰りの行程を組む。資料館で予習してから本命へ、を守り、ゆかりの社や立ち寄り先は
// 本命の前後どちらでも、いちばん早く帰れる順に入れる。道路データは使わないので、時間は直線距離からの目安。
import type { AreaPlaces, Place } from "@/lib/types";

export type Role = "primer" | "anchor" | "kin" | "extra";
// fixed: 並べ直しても、行程の中のこの位置（何番目か）から動かさない
export type Stop = { place: Place; role: Role; fixed?: boolean };
export type TimedStop = Stop & { driveMin: number; arrive: number; depart: number; stayMin: number };
export type Plan = { start: number; stops: TimedStop[]; returnMin: number; home: number; overMin: number };

// 滞在の目安（分）。博物館・美術館・城が本命のときは長めに見る
export const STAY_MIN: Record<Role, number> = { primer: 60, anchor: 60, kin: 30, extra: 45 };
const HALL_ANCHOR_MIN = 90;
export const stayOf = (s: Stop) => (s.role === "anchor" && s.place.kind !== "shrine" ? HALL_ANCHOR_MIN : STAY_MIN[s.role]);

// 足した場所の役目。社はゆかり、本命が社なら資料館・案内所は予習、ほかは立ち寄り
export function roleFor(p: Place, stops: Stop[]): Role {
  if (p.kind === "shrine") return "kin";
  const anchor = stops.find((s) => s.role === "anchor");
  if (p.kind === "info" || (p.kind === "museum" && anchor?.place.kind === "shrine")) return "primer";
  return "extra";
}
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
    const stayMin = stayOf(s);
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

// 本命を決めて、予習先と、日が暮れるまでに回れるゆかりの社を足した行程を作る。
// 本命は社のほか、博物館・美術館・城も選べる（社以外のときは予習先を付けない）
export function suggestPlan(places: AreaPlaces, home: [number, number], anchorId?: string, start = 8 * 60): Stop[] {
  const anchor =
    places.anchors.find((a) => a.id === anchorId) ?? [...(places.halls ?? []), ...(places.castles ?? [])].find((h) => h.id === anchorId) ?? places.anchors[0];
  if (!anchor) return [];
  const stops: Stop[] = [];
  const primer =
    anchor.kind !== "shrine"
      ? undefined
      : places.anchors.find((a) => a.id === anchor.id)?.primer?.place ??
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
  return optimizeOrder(stops, home, start);
}

// ゆかりの社は、帰りの時刻がいちばん早くなる位置に入れる（本命の前でもよい）
export function insertKin(stops: Stop[], kin: Stop, home: [number, number], start = 8 * 60): Stop[] {
  let best: Stop[] | null = null;
  let bestHome = Infinity;
  for (let i = 0; i <= stops.length; i++) {
    const next = [...stops.slice(0, i), kin, ...stops.slice(i)];
    const h = schedule(next, home, start).home;
    if (h < bestHome) {
      bestHome = h;
      best = next;
    }
  }
  return best ?? [...stops, kin];
}

// 予習先が本命より前にあることと、固定した地点の位置を守って、帰りがいちばん早くなる順に並べ直す。
// 動かせる地点が8か所までなら全部の順番を試し、それより多いときは区間を裏返す改善（2-opt）で縮める。
// 固定のせいで「予習が本命より前」を守れないときは、今の順のままにする
const EXACT_MAX = 8;

const primerFirst = (o: Stop[]) => {
  const anchorAt = o.findIndex((s) => s.role === "anchor");
  return anchorAt < 0 || o.every((s, i) => s.role !== "primer" || i < anchorAt);
};

function* permutations<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield xs;
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...rest];
  }
}

export function optimizeOrder(stops: Stop[], home: [number, number], start = 8 * 60): Stop[] {
  if (stops.length <= 1) return stops;
  // 固定した地点はその番目に置いたまま、残りの地点だけで空いた番目を埋める
  const slots = stops.flatMap((s, i) => (s.fixed ? [] : [i]));
  const free = stops.filter((s) => !s.fixed);
  if (free.length <= 1) return stops;
  const fill = (order: Stop[]) => {
    const out = [...stops];
    slots.forEach((slot, k) => (out[slot] = order[k]));
    return out;
  };
  const cost = (order: Stop[]) => {
    const o = fill(order);
    return primerFirst(o) ? schedule(o, home, start).home : Infinity;
  };
  // 今の順で同点なら動かさない
  let best = free;
  let bestCost = cost(best);
  if (free.length <= EXACT_MAX) {
    for (const o of permutations(free)) {
      const c = cost(o);
      if (c < bestCost) [best, bestCost] = [o, c];
    }
    return fill(best);
  }
  if (bestCost === Infinity) {
    const primersFirst = [...free.filter((s) => s.role === "primer"), ...free.filter((s) => s.role !== "primer")];
    if (cost(primersFirst) < Infinity) [best, bestCost] = [primersFirst, cost(primersFirst)];
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const next = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const c = cost(next);
        if (c < bestCost) [best, bestCost, changed] = [next, c, true];
      }
    }
  }
  return fill(best);
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
