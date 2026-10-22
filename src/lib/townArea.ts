// 行ったことのある町など、地帯に入っていない町を、その町だけの「地帯」として開く。id は town-<市町村コード>
import type { Atlas, BlankArea } from "@/lib/types";

export const TOWN_AREA_PREFIX = "town-";

export function townArea(atlas: Pick<Atlas, "municipalities">, areaId: string): BlankArea | null {
  if (!areaId.startsWith(TOWN_AREA_PREFIX)) return null;
  const id = areaId.slice(TOWN_AREA_PREFIX.length);
  const f = atlas.municipalities.features.find((m) => m.properties.id === id);
  if (!f) return null;
  const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of rings.flat()) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const p = f.properties;
  return {
    id: areaId,
    label: p.short,
    pref: [p.pref],
    km: p.km,
    center: [(x0 + x1) / 2, (y0 + y1) / 2],
    bbox: [x0, y0, x1, y1],
    towns: [{ id: p.id, name: p.short, pref: p.pref, km: p.km }],
  };
}
