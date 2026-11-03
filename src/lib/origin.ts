// 出発地。ふだんは自宅だが、出張先などでは今いる場所や探した地名から周りの行き先を探し、行程もそこから出てそこへ戻る
import type { Mode } from "@/lib/plan/itinerary";
import type { Atlas, BlankArea, MuniProps } from "@/lib/types";

export type Origin = { kind: "home" | "here" | "place"; label: string; at: [number, number] };

export const kmBetween = ([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

// 絞り込みの距離。移動手段ごとに、日帰りで行き来できそうな幅にする
export const DISTANCES: Record<Mode, { km: number; label: string }[]> = {
  car: [100, 200, 300].map((km) => ({ km, label: `${km}km` })).concat({ km: 5000, label: "全国" }),
  train: [50, 100, 200].map((km) => ({ km, label: `${km}km` })).concat({ km: 5000, label: "全国" }),
  bike: [10, 20, 40].map((km) => ({ km, label: `${km}km` })),
  walk: [3, 5, 10].map((km) => ({ km, label: `${km}km` })),
  // 電車で行って現地で車を借りるので、遠くまで行ける
  rent: [100, 200, 400].map((km) => ({ km, label: `${km}km` })).concat({ km: 5000, label: "全国" }),
};

// 市町村ごとの代表点（枠の中心）
export function townCenters(atlas: Pick<Atlas, "municipalities">) {
  return atlas.municipalities.features.map((f) => {
    const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of rings.flat()) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { p: f.properties, at: [(x0 + x1) / 2, (y0 + y1) / 2] as [number, number] };
  });
}

export type NearTown = MuniProps & { at: [number, number] };

// 出発地からの距離を、地帯と町に付け直す。地帯の距離はいちばん近い町まで。近い順に並べる
export function fromOrigin(atlas: Atlas, centers: ReturnType<typeof townCenters>, origin: [number, number]) {
  const km = new Map(centers.map(({ p, at }) => [p.id, Math.round(kmBetween(origin, at))]));
  const areas: BlankArea[] = atlas.areas
    .map((a) => {
      const towns = a.towns.map((t) => ({ ...t, km: km.get(t.id) ?? t.km })).sort((x, y) => x.km - y.km);
      return { ...a, towns, km: Math.min(...towns.map((t) => t.km)) };
    })
    .sort((a, b) => a.km - b.km);
  const towns: NearTown[] = centers.map(({ p, at }) => ({ ...p, at, km: km.get(p.id)! })).sort((a, b) => a.km - b.km);
  return { areas, towns, km };
}

// 町の名前から出発地の候補を出す（その場で、通信なしで）。「金沢」で金沢市、「吉野」で吉野町・吉野川市など
export function matchTowns(centers: ReturnType<typeof townCenters>, q: string, limit = 5): Origin[] {
  const s = q.trim();
  if (!s) return [];
  return centers
    .filter(({ p }) => p.name.includes(s) || p.short.startsWith(s))
    .sort((a, b) => Number(!a.p.short.startsWith(s)) - Number(!b.p.short.startsWith(s)) || a.p.short.length - b.p.short.length)
    .slice(0, limit)
    .map(({ p, at }) => ({ kind: "place", label: p.name, at }));
}
