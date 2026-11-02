// 縁泉の訪問記録と市区町村境界から、地図に出すデータ一式を作る。
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Atlas, BlankArea, MuniProps, Spot, Summary } from "@/lib/types";

// 空白地帯: 中心の町から、隣の町へ渡り歩いて移動の手間が AREA_BUDGET_MIN 分以内に収まる未訪問の町の集まり。
// 町どうしの手間は scripts/terrain_edges.py が標高から見積もったもの（峠や尾根を越えるほど大きい）
// 平野では手間の小さい町が続くので、日帰りで回れる町数 AREA_MAX_TOWNS で打ち切る
const AREA_BUDGET_MIN = 30;
const AREA_MAX_TOWNS = 8;

// [町コード, 町コード, 分] 隣り合う町の組だけを持つ
export type TerrainEdge = [string, string, number];

export type VisitRow = {
  ts: string;
  lat: number;
  lng: number;
  name: string;
  // 縁泉の actant_id。同じ場所への記録をまとめるのに使う
  place?: string;
  note: string | null;
};

type BoundaryProps = {
  N03_001: string;
  N03_003: string | null;
  N03_004: string | null;
  N03_007: string;
};
type Boundary = FeatureCollection<Polygon | MultiPolygon, BoundaryProps>;
type PolyFeature = Feature<Polygon | MultiPolygon, BoundaryProps>;

type Unit = {
  id: string;
  name: string;
  short: string;
  pref: string;
  polys: PolyFeature[];
  bbox: [number, number, number, number];
  center: [number, number];
  km: number;
  visits: number;
  first?: string;
  last?: string;
};

const CATEGORIES: [Spot["cat"], RegExp][] = [
  ["shrine", /神社|大社|神宮|八幡宮|天満宮|稲荷|宮$/],
  ["temple", /寺$|寺 |院$|堂$|観音|不動/],
  ["museum", /博物館|資料館|歴史館|記念館|ミュージアム|郷土館|文化館|展示室|美術館|案内所|ビジターセンター/],
  ["history", /城|跡|古墳|陵/],
  ["nature", /公園|山|滝|峠|岬|湖|渓|浜|海岸|島/],
];
export const categoryOf = (name: string): Spot["cat"] =>
  CATEGORIES.find(([, re]) => re.test(name))?.[0] ?? "other";

function unitOf(p: BoundaryProps) {
  const name = p.N03_001 + (p.N03_003 ?? "") + (p.N03_004 ?? "");
  const short = !p.N03_003 || p.N03_003.endsWith("郡") ? p.N03_004 ?? p.N03_003 : p.N03_003;
  return { id: p.N03_007, name, short, pref: p.N03_001 };
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const bbox4 = (fc: FeatureCollection) => turf.bbox(fc) as [number, number, number, number];

export function buildAtlas(
  visits: VisitRow[],
  detailed: Boundary,
  display: Boundary,
  home: [number, number],
  edges: TerrainEdge[],
): Atlas {
  const homePt = turf.point(home);

  const units = new Map<string, Unit>();
  for (const f of detailed.features) {
    // 所属未定地などコードのない区域は町として扱わない
    if (!f.geometry || !f.properties.N03_007) continue;
    const u = unitOf(f.properties);
    if (!u.short) continue;
    const entry = units.get(u.id) ?? ({ ...u, short: u.short, polys: [] } as unknown as Unit);
    entry.polys.push(f);
    units.set(u.id, entry);
  }
  for (const u of units.values()) {
    const fc = turf.featureCollection(u.polys);
    u.bbox = bbox4(fc);
    u.center = turf.pointOnFeature(fc).geometry.coordinates as [number, number];
    u.km = Math.round(turf.distance(homePt, turf.point(u.center)));
    u.visits = 0;
  }
  const unitList = [...units.values()];

  const findUnit = (lng: number, lat: number) => {
    const pt = turf.point([lng, lat]);
    for (const u of unitList) {
      const [x0, y0, x1, y1] = u.bbox;
      if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
      if (u.polys.some((p) => turf.booleanPointInPolygon(pt, p))) return u;
    }
    return null;
  };

  // 同じ場所（actant）への記録は、地図では1点にまとめる。Swarm の記録はチェックインした端末の位置なので
  // 記録ごとに少しずつずれている。位置は記録の緯度・経度それぞれの中央値（外れた記録に引きずられない）。
  // 町の訪問も、記録ごとの位置ではなく、まとめた位置の町で数える
  const groups = new Map<string, VisitRow[]>();
  for (const v of visits) {
    if (/テスト|ZZTEST/.test(v.name)) continue;
    const key = v.place ? `aid:${v.place}` : `pt:${v.name}@${v.lat},${v.lng}`;
    const g = groups.get(key);
    if (g) g.push(v);
    else groups.set(key, [v]);
  }

  const spots: Spot[] = [];
  let unmatched = 0;
  for (const g of groups.values()) {
    const lat = median(g.map((v) => v.lat));
    const lng = median(g.map((v) => v.lng));
    const sorted = [...g].sort((a, b) => a.ts.localeCompare(b.ts));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const u = findUnit(lng, lat);
    if (u) {
      u.visits += g.length;
      if (!u.first || first.ts < u.first) u.first = first.ts;
      if (!u.last || last.ts > u.last) u.last = last.ts;
    } else {
      unmatched += g.length;
    }
    const note = [...sorted].reverse().find((v) => v.note)?.note ?? null;
    spots.push({
      name: last.name,
      lat,
      lng,
      ts: last.ts,
      cat: categoryOf(last.name),
      muni: u?.id ?? null,
      note,
      visits: g.length,
      first: first.ts,
    });
  }

  const areas = groupBlankAreas(unitList.filter((u) => u.visits === 0), edges);
  const areaOf = new Map(areas.flatMap((a) => a.towns.map((t) => [t.id, a.id] as const)));

  const municipalities: FeatureCollection<Polygon | MultiPolygon, MuniProps> = {
    type: "FeatureCollection",
    features: display.features.flatMap((f) => {
      const u = units.get(f.properties.N03_007);
      if (!u || !f.geometry) return [];
      return [
        {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            id: u.id,
            name: u.name,
            short: u.short,
            pref: u.pref,
            visits: u.visits,
            visited: u.visits > 0,
            first: u.first ?? null,
            last: u.last ?? null,
            km: u.km,
            area: areaOf.get(u.id) ?? null,
          },
        },
      ];
    }),
  };

  const prefs: Record<string, { pref: string; visited: number; total: number; km: number }> = {};
  for (const u of unitList) {
    prefs[u.pref] ??= { pref: u.pref, visited: 0, total: 0, km: 0 };
    prefs[u.pref].total++;
    prefs[u.pref].km += u.km;
    if (u.visits > 0) prefs[u.pref].visited++;
  }
  const unvisitedCount = unitList.filter((u) => u.visits === 0);
  const summary: Summary = {
    generatedAt: new Date().toISOString(),
    home,
    municipalities: unitList.length,
    visited: unitList.length - unvisitedCount.length,
    spots: spots.length,
    unmatched,
    unvisitedByBand: [100, 200, 300].map((km) => ({ km, count: unvisitedCount.filter((u) => u.km < km).length })),
    prefectures: Object.values(prefs)
      .map((p) => ({ ...p, km: Math.round(p.km / p.total) }))
      .sort((a, b) => a.km - b.km),
  };

  return { summary, areas, spots, municipalities };
}

// 手間の範囲に入る未訪問の町が多い町から順に中心を選び、重ならないようにまとめる
function groupBlankAreas(unvisited: Unit[], edges: TerrainEdge[]): BlankArea[] {
  const byId = new Map(unvisited.map((u) => [u.id, u]));
  const neighbors = new Map<string, { unit: Unit; min: number }[]>(unvisited.map((u) => [u.id, []]));
  for (const [a, b, min] of edges) {
    const ua = byId.get(a);
    const ub = byId.get(b);
    if (!ua || !ub) continue;
    neighbors.get(a)!.push({ unit: ub, min });
    neighbors.get(b)!.push({ unit: ua, min });
  }

  const used = new Set<string>();
  // 中心から手間の少ない順に町を広げる（ダイクストラ法）
  const grow = (seed: Unit) => {
    const cost = new Map([[seed.id, 0]]);
    const done = new Set<string>();
    const members: Unit[] = [];
    for (;;) {
      let next: Unit | null = null;
      for (const [id, c] of cost) if (!done.has(id) && (!next || c < cost.get(next.id)!)) next = byId.get(id)!;
      if (!next || members.length >= AREA_MAX_TOWNS) break;
      done.add(next.id);
      members.push(next);
      for (const { unit, min } of neighbors.get(next.id)!) {
        if (used.has(unit.id) || done.has(unit.id)) continue;
        const c = cost.get(next.id)! + min;
        if (c <= AREA_BUDGET_MIN && c < (cost.get(unit.id) ?? Infinity)) cost.set(unit.id, c);
      }
    }
    // spread: 中心から各町への手間の合計。同じ町数なら、まとまりのよい地帯を先に採る
    const spread = members.reduce((sum, m) => sum + cost.get(m.id)!, 0);
    return { members, spread };
  };

  const areas: BlankArea[] = [];
  for (;;) {
    let bestGrow: ReturnType<typeof grow> | null = null;
    for (const u of unvisited) {
      if (used.has(u.id)) continue;
      const g = grow(u);
      const b = bestGrow;
      if (!b || g.members.length > b.members.length || (g.members.length === b.members.length && g.spread < b.spread)) {
        bestGrow = g;
      }
    }
    const best = bestGrow?.members;
    // 山あいでは一町だけで地帯になることもある（その町を旅の中心にする）
    if (!best) break;
    best.forEach((m) => used.add(m.id));
    const seed = best[0];
    areas.push({
      id: `area-${seed.id}`,
      label: best.length > 1 ? `${seed.short}周辺` : seed.short,
      pref: [...new Set(best.map((m) => m.pref))],
      km: Math.min(...best.map((m) => m.km)),
      center: seed.center,
      bbox: bbox4(turf.featureCollection(best.flatMap((m) => m.polys))),
      towns: best.map((m) => ({ id: m.id, name: m.short, pref: m.pref, km: m.km })),
    });
  }
  return areas.sort((a, b) => b.towns.length / (1 + b.km / 100) - a.towns.length / (1 + a.km / 100));
}
