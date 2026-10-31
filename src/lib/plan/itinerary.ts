// 日帰り、または宿に泊まる行程を組む。資料館で予習してから本命へ、を守り、ゆかりの社や立ち寄り先は
// 本命の前後どちらでも、移動がいちばん短くなる順に入れる。道路データや時刻表は使わないので、時間は直線距離からの目安。
// 出発地は自宅とは限らない（出張先の宿や今いる場所から出て、そこへ戻る）
import type { AreaPlaces, Place } from "@/lib/types";

// stay: 泊まる宿。宿に着いたら1日目が終わり、翌朝そこから2日目を始める
export type Role = "primer" | "anchor" | "kin" | "extra" | "stay";
// linkNext: すぐ次の地点とつなぐ。つないだ2か所は、並べ直しても続けてこの順に回る
// before: この地点より後に回る地点の id。あいだに別の地点が入ってもよい
export type Stop = { place: Place; role: Role; linkNext?: boolean; before?: string[] };
// 移動手段。電車は、近い地点のあいだを歩く
export type Mode = "car" | "train" | "bike" | "walk";
export const MODE_LABEL: Record<Mode, string> = { car: "車", train: "電車", bike: "自転車", walk: "徒歩" };
// driveMin: ひとつ前の地点からの移動の分、by: その区間の移動手段。day: 何日目に着くか。宿の depart は翌朝の出発時刻
export type TimedStop = Stop & { driveMin: number; by: Mode; arrive: number; depart: number; stayMin: number; day: number };
// overMin: 宿に18時、自宅に19時を過ぎる分の合計。lateMin: そのうち宿に遅れる分。earlyMin: 宿に15時より早く着く分
export type Plan = {
  start: number;
  start2: number;
  stops: TimedStop[];
  returnMin: number;
  returnBy: Mode;
  home: number;
  days: number;
  driveMin: number;
  overMin: number;
  lateMin: number;
  earlyMin: number;
};

// 滞在の目安（分）。博物館・美術館・城が本命のときは長めに見る
export const STAY_MIN: Record<Role, number> = { primer: 60, anchor: 60, kin: 30, extra: 45, stay: 0 };
const HALL_ANCHOR_MIN = 90;
export const stayOf = (s: Stop) => (s.role === "anchor" && s.place.kind !== "shrine" ? HALL_ANCHOR_MIN : STAY_MIN[s.role]);

// 足した場所の役目。社はゆかり、本命が社なら資料館・案内所は予習、ほかは立ち寄り
export function roleFor(p: Place, stops: Stop[]): Role {
  if (p.kind === "lodging") return "stay";
  if (p.kind === "shrine") return "kin";
  const anchor = stops.find((s) => s.role === "anchor");
  if (p.kind === "info" || (p.kind === "museum" && anchor?.place.kind === "shrine")) return "primer";
  return "extra";
}
// 行程の終わりの目安（自宅に着く時刻、分）
export const DAY_END = 19 * 60;
// 宿のチェックインと、宿に着きたい時刻、2日目に宿を出る時刻の既定
export const CHECK_IN = 15 * 60;
export const INN_BY = 18 * 60;
export const DEFAULT_START2 = 9 * 60;
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

// 歩き・自転車は道のりを直線の1.25倍とみる
const WALK_KMH = 4;
const BIKE_KMH = 14;
// 電車: 駅までの歩きと待ちに25分。近ければ各駅停車、遠ければ快速・特急（新幹線）の速さとみる。乗り換えや本数は考えない
const TRAIN_OVERHEAD_MIN = 25;

export function travel(from: [number, number], to: [number, number], mode: Mode = "car"): { min: number; by: Mode } {
  const km = kmBetween(from, to);
  const walk = Math.round(((km * 1.25) / WALK_KMH) * 60);
  if (mode === "walk") return { min: walk, by: "walk" };
  if (mode === "bike") return { min: Math.round(((km * 1.25) / BIKE_KMH) * 60), by: "bike" };
  if (mode === "car") return { min: driveMinutes(from, to), by: "car" };
  const rail = km * 1.2;
  const kmh = rail > 60 ? 80 : rail > 15 ? 40 : 25;
  const train = TRAIN_OVERHEAD_MIN + Math.round((rail / kmh) * 60);
  return walk <= train ? { min: walk, by: "walk" } : { min: train, by: "train" };
}

export function schedule(stops: Stop[], home: [number, number], start = 8 * 60, start2 = DEFAULT_START2, mode: Mode = "car"): Plan {
  let t = start;
  let here = home;
  let day = 1;
  let drive = 0;
  let lateMin = 0;
  let earlyMin = 0;
  const timed: TimedStop[] = stops.map((s) => {
    const { min: driveMin, by } = travel(here, at(s.place), mode);
    drive += driveMin;
    const arrive = t + driveMin;
    const stayMin = stayOf(s);
    here = at(s.place);
    const thisDay = day;
    if (s.role === "stay") {
      lateMin += Math.max(0, arrive - INN_BY);
      earlyMin += Math.max(0, CHECK_IN - arrive);
      day++;
      t = start2;
    } else t = arrive + stayMin;
    return { ...s, driveMin, by, arrive, depart: t, stayMin, day: thisDay };
  });
  const { min: returnMin, by: returnBy } = travel(here, home, mode);
  const homeAt = t + returnMin;
  return {
    start,
    start2,
    stops: timed,
    returnMin,
    returnBy,
    home: homeAt,
    days: day,
    driveMin: drive + returnMin,
    overMin: lateMin + Math.max(0, homeAt - DAY_END),
    lateMin,
    earlyMin,
  };
}

// 並べ方の良し悪し。移動の合計に、宿や自宅に遅れる分を重く足す（日帰りなら早く帰れる順と同じ）。
// 宿に昼過ぎに着いてしまう並びも避ける（チェックインまでの待ちを、運転と同じ重さで数える）
const OVER_WEIGHT = 3;
export const costOf = (p: Plan) => p.driveMin + OVER_WEIGHT * p.overMin + p.earlyMin;

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
export function suggestPlan(places: AreaPlaces, home: [number, number], anchorId?: string, start = 8 * 60, mode: Mode = "car"): Stop[] {
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
    const next = insertKin(stops, { place: cand, role: "kin" }, home, start, DEFAULT_START2, mode);
    if (schedule(next, home, start, DEFAULT_START2, mode).overMin > 0) continue;
    stops.splice(0, stops.length, ...next);
    added++;
  }
  return optimizeOrder(stops, home, start, DEFAULT_START2, mode);
}

// ゆかりの社は、帰りの時刻がいちばん早くなる位置に入れる（本命の前でもよい）
export function insertKin(stops: Stop[], kin: Stop, home: [number, number], start = 8 * 60, start2 = DEFAULT_START2, mode: Mode = "car"): Stop[] {
  let best: Stop[] | null = null;
  let bestHome = Infinity;
  for (let i = 0; i <= stops.length; i++) {
    const next = [...stops.slice(0, i), kin, ...stops.slice(i)];
    const h = costOf(schedule(next, home, start, start2, mode));
    if (h < bestHome) {
      bestHome = h;
      best = next;
    }
  }
  return best ?? [...stops, kin];
}

// つないだ地点どうしを、ひとかたまりにまとめる。かたまりの最後はどこにもつながない
export function blocksOf(stops: Stop[]): Stop[][] {
  const blocks: Stop[][] = [];
  stops.forEach((s, i) => {
    if (i > 0 && stops[i - 1].linkNext) blocks[blocks.length - 1].push(s);
    else blocks.push([s]);
  });
  return blocks.map((b) => (b[b.length - 1].linkNext ? [...b.slice(0, -1), { ...b[b.length - 1], linkNext: false }] : b));
}

// 予習先が本命より前にあることと、つないだ地点の並びを守って、移動がいちばん短くなる順に並べ直す。
// 宿があれば、どこを1日目に、どこを2日目に回るかもあわせて決まる。
// かたまりが8つまでなら全部の順番を試し、それより多いときは区間を裏返す改善（2-opt）で縮める。
// 「A は B より前」の条件も守る。条件どうしがぶつかって守れないときは、今の順のままにする
const EXACT_MAX = 8;

const primerFirst = (o: Stop[]) => {
  const anchorAt = o.findIndex((s) => s.role === "anchor");
  return anchorAt < 0 || o.every((s, i) => s.role !== "primer" || i < anchorAt);
};

// 「A は B より前」の条件をすべて守れているか。行程にない地点の条件は無視する
export function keepsOrder(o: Stop[]) {
  const at = new Map(o.map((s, i) => [s.place.id, i]));
  return o.every((s, i) => (s.before ?? []).every((id) => !at.has(id) || i < at.get(id)!));
}

function* permutations<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield xs;
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...rest];
  }
}

export function optimizeOrder(stops: Stop[], home: [number, number], start = 8 * 60, start2 = DEFAULT_START2, mode: Mode = "car"): Stop[] {
  const blocks = blocksOf(stops);
  if (blocks.length <= 1) return blocks.flat();
  const cost = (order: Stop[][]) => {
    const o = order.flat();
    return primerFirst(o) && keepsOrder(o) ? costOf(schedule(o, home, start, start2, mode)) : Infinity;
  };
  // 今の順で同点なら動かさない
  let best = blocks;
  let bestCost = cost(best);
  if (blocks.length <= EXACT_MAX) {
    for (const o of permutations(blocks)) {
      const c = cost(o);
      if (c < bestCost) [best, bestCost] = [o, c];
    }
    return best.flat();
  }
  if (bestCost === Infinity) {
    const hasPrimer = (b: Stop[]) => b.some((s) => s.role === "primer");
    const primersFirst = [...blocks.filter(hasPrimer), ...blocks.filter((b) => !hasPrimer(b))];
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
  return best.flat();
}

export const clock = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

// Google マップの経路。宿があれば日ごとに分ける（出発地または宿から、宿または出発地まで。立ち寄りは9か所まで。
// スマホのブラウザでは3か所までしか通らないことがある）。
// 電車では経由地が使えないので、区間ごとに乗換案内を開く
export const MAPS_WAYPOINT_MAX = 9;
const TRAVELMODE: Record<Mode, string> = { car: "driving", train: "transit", bike: "bicycling", walk: "walking" };
const ll = ([lng, lat]: [number, number]) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export function googleMapsLeg(from: [number, number], to: [number, number], mode: Mode) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: ll(from), destination: ll(to), travelmode: TRAVELMODE[mode] })}`;
}

export function googleMapsRoutes(stops: Stop[], home: [number, number], mode: Mode = "car") {
  const legs: { from: [number, number]; to: [number, number]; via: Stop[] }[] = [];
  let from = home;
  let via: Stop[] = [];
  for (const s of stops) {
    if (s.role !== "stay") {
      via.push(s);
      continue;
    }
    legs.push({ from, to: at(s.place), via });
    from = at(s.place);
    via = [];
  }
  legs.push({ from, to: home, via });
  return legs.map((leg, i) => ({
    day: i + 1,
    dropped: Math.max(0, leg.via.length - MAPS_WAYPOINT_MAX),
    url: `https://www.google.com/maps/dir/?${new URLSearchParams({
      api: "1",
      origin: ll(leg.from),
      destination: ll(leg.to),
      travelmode: TRAVELMODE[mode],
      waypoints: leg.via.slice(0, MAPS_WAYPOINT_MAX).map((s) => ll(at(s.place))).join("|"),
    })}`,
  }));
}

// 出発地のまわりのおすすめ。由緒の手がかりがある社と、博物館・美術館・城を、出発地から近い順に並べる。
// 手がかりのある社がなければ、名前のわかる社も入れる
const NEAR_MAX = 8;
const NEAR_STOPS = 6;

export function nearPicks(places: AreaPlaces, home: [number, number], n = NEAR_MAX) {
  const shrines = places.anchors.filter((a) => a.score > 0);
  const pool: Place[] = [...(shrines.length ? shrines : places.anchors), ...(places.halls ?? []), ...(places.castles ?? [])];
  const seen = new Set<string>();
  return pool
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .map((place) => ({ place, km: Math.round(kmBetween(home, at(place)) * 10) / 10 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

// まわりのおすすめで行程を組む。いちばん近いおすすめを本命にし、近い順に、帰りが遅れない分だけ足す
export function nearPlan(places: AreaPlaces, home: [number, number], start = 8 * 60, mode: Mode = "car", start2 = DEFAULT_START2): Stop[] {
  const picks = nearPicks(places, home);
  if (!picks.length) return [];
  let stops: Stop[] = [{ place: picks[0].place, role: "anchor" }];
  for (const { place } of picks.slice(1)) {
    if (stops.length >= NEAR_STOPS) break;
    const next = insertKin(stops, { place, role: place.kind === "shrine" ? "kin" : "extra" }, home, start, start2, mode);
    if (schedule(next, home, start, start2, mode).overMin > 0) continue;
    stops = next;
  }
  return optimizeOrder(stops, home, start, start2, mode);
}
