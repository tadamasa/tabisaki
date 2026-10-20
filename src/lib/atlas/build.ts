// 縁泉の訪問記録と市区町村境界から、地図に出すデータ一式を作る。
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Atlas, BlankArea, MuniProps, Spot, Summary } from "@/lib/types";

// 空白地帯: 中心の町から半径 AREA_RADIUS_KM 以内でつながっている未訪問の町の集まり
const AREA_RADIUS_KM = 20;
const AREA_MIN_TOWNS = 3;

export type VisitRow = {
  ts: string;
  lat: number;
  lng: number;
  name: string;
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

const bbox4 = (fc: FeatureCollection) => turf.bbox(fc) as [number, number, number, number];

export function buildAtlas(
  visits: VisitRow[],
  detailed: Boundary,
  display: Boundary,
  home: [number, number],
): Atlas {
  const homePt = turf.point(home);

  const units = new Map<string, Unit>();
  for (const f of detailed.features) {
    if (!f.geometry) continue;
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

  const spots: Spot[] = [];
  let unmatched = 0;
  for (const v of visits) {
    if (/テスト|ZZTEST/.test(v.name)) continue;
    const u = findUnit(v.lng, v.lat);
    if (u) {
      u.visits++;
      if (!u.first || v.ts < u.first) u.first = v.ts;
      if (!u.last || v.ts > u.last) u.last = v.ts;
    } else {
      unmatched++;
    }
    spots.push({ name: v.name, lat: v.lat, lng: v.lng, ts: v.ts, cat: categoryOf(v.name), muni: u?.id ?? null, note: v.note });
  }

  const areas = groupBlankAreas(unitList.filter((u) => u.visits === 0));
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

// 近くの未訪問の町が多い町から順に中心を選び、重ならないようにまとめる
function groupBlankAreas(unvisited: Unit[]): BlankArea[] {
  const touches = (a: Unit, b: Unit) => {
    const [ax0, ay0, ax1, ay1] = a.bbox;
    const [bx0, by0, bx1, by1] = b.bbox;
    if (ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) return false;
    return a.polys.some((p) => b.polys.some((q) => turf.booleanIntersects(p, q)));
  };
  const neighbors = new Map<string, Unit[]>(unvisited.map((u) => [u.id, []]));
  for (let i = 0; i < unvisited.length; i++) {
    for (let j = i + 1; j < unvisited.length; j++) {
      const a = unvisited[i];
      const b = unvisited[j];
      if (turf.distance(a.center, b.center) > 2 * AREA_RADIUS_KM) continue;
      if (touches(a, b)) {
        neighbors.get(a.id)!.push(b);
        neighbors.get(b.id)!.push(a);
      }
    }
  }
  const used = new Set<string>();
  const grow = (seed: Unit) => {
    const members = [seed];
    const seen = new Set([seed.id]);
    for (let k = 0; k < members.length; k++) {
      for (const n of neighbors.get(members[k].id)!) {
        if (seen.has(n.id) || used.has(n.id)) continue;
        if (turf.distance(seed.center, n.center) > AREA_RADIUS_KM) continue;
        seen.add(n.id);
        members.push(n);
      }
    }
    return members;
  };

  const areas: BlankArea[] = [];
  for (;;) {
    let best: Unit[] | null = null;
    for (const u of unvisited) {
      if (used.has(u.id)) continue;
      const members = grow(u);
      if (!best || members.length > best.length || (members.length === best.length && u.km < best[0].km)) {
        best = members;
      }
    }
    if (!best || best.length < AREA_MIN_TOWNS) break;
    best.forEach((m) => used.add(m.id));
    const seed = best[0];
    areas.push({
      id: `area-${seed.id}`,
      label: `${seed.short}周辺`,
      pref: [...new Set(best.map((m) => m.pref))],
      km: Math.min(...best.map((m) => m.km)),
      center: seed.center,
      bbox: bbox4(turf.featureCollection(best.flatMap((m) => m.polys))),
      towns: best.map((m) => ({ id: m.id, name: m.short, pref: m.pref, km: m.km })),
    });
  }
  return areas.sort((a, b) => b.towns.length / (1 + b.km / 100) - a.towns.length / (1 + a.km / 100));
}
