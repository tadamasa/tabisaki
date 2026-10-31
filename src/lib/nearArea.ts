// 出発地のまわり（半径 km）を、ひとつの「地帯」として開く。id は near:<緯度>,<経度>,<km>。
// 行ったことのある町も含め、まだ記録のない場所を近い順に探す
import type { Atlas, BlankArea } from "@/lib/types";

export const NEAR_AREA_PREFIX = "near:";

// 半径の既定。歩き・自転車は狭く、車や電車は日帰りで寄り道できる程度
export const NEAR_KM = { walk: 2.5, bike: 8, train: 12, car: 20 } as const;

// 同じあたりで何度も問い合わせないよう、位置は約1km（小数2桁）に丸める
export const nearAreaId = ([lng, lat]: [number, number], km: number) => `${NEAR_AREA_PREFIX}${lat.toFixed(2)},${lng.toFixed(2)},${km}`;

export function parseNearId(areaId: string): { at: [number, number]; km: number } | null {
  if (!areaId.startsWith(NEAR_AREA_PREFIX)) return null;
  const [lat, lng, km] = areaId.slice(NEAR_AREA_PREFIX.length).split(",").map(Number);
  if (![lat, lng, km].every(Number.isFinite) || km <= 0 || km > 50) return null;
  return { at: [lng, lat], km };
}

// 半径 km の円を囲む枠 [西, 南, 東, 北]
export function circleBbox([lng, lat]: [number, number], km: number): [number, number, number, number] {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

const kmBetween = ([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

export function nearArea(atlas: Pick<Atlas, "municipalities">, areaId: string, label = "出発地"): BlankArea | null {
  const near = parseNearId(areaId);
  if (!near) return null;
  const [x0, y0, x1, y1] = circleBbox(near.at, near.km);
  const towns: BlankArea["towns"] = [];
  for (const f of atlas.municipalities.features) {
    const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    let [a0, b0, a1, b1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of rings.flat()) {
      a0 = Math.min(a0, x);
      b0 = Math.min(b0, y);
      a1 = Math.max(a1, x);
      b1 = Math.max(b1, y);
    }
    // 枠が円の枠と重なる町だけ（細かい判定は場所ごとの距離で行う）
    if (a1 < x0 || a0 > x1 || b1 < y0 || b0 > y1) continue;
    const p = f.properties;
    towns.push({ id: p.id, name: p.short, pref: p.pref, km: Math.round(kmBetween(near.at, [(a0 + a1) / 2, (b0 + b1) / 2])) });
  }
  towns.sort((a, b) => a.km - b.km);
  return {
    id: areaId,
    label: `${label}のまわり（${near.km}km）`,
    pref: [...new Set(towns.map((t) => t.pref))],
    km: 0,
    center: near.at,
    bbox: [x0, y0, x1, y1],
    towns,
  };
}

// 場所が出発地から何 km か
export const kmFrom = (areaId: string, lat: number, lng: number) => {
  const near = parseNearId(areaId);
  return near ? kmBetween(near.at, [lng, lat]) : null;
};
