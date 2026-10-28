import "server-only";
import { type GeocodeHit, type GsiRow, type NominatimRow, parseGsi, parseNominatim } from "./parse";

// 地名・駅名・住所から出発地を探す。駅や施設の名前に強い OpenStreetMap（Nominatim）と、住所に強い国土地理院の検索を合わせる
const NOMINATIM = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org/search";
const GSI = process.env.GSI_ADDRESS_URL ?? "https://msearch.gsi.go.jp/address-search/AddressSearch";
const UA = "tabisaki/0.1 (personal trip planner)";

async function get<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" }, signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T[]) : [];
  } catch {
    return [];
  }
}

export async function geocode(q: string, limit = 6): Promise<GeocodeHit[]> {
  const nq = new URLSearchParams({ q, format: "jsonv2", countrycodes: "jp", limit: String(limit) });
  const [osm, gsi] = await Promise.all([
    get<NominatimRow>(`${NOMINATIM}?${nq}`).then(parseNominatim),
    get<GsiRow>(`${GSI}?${new URLSearchParams({ q })}`).then(parseGsi),
  ]);
  // 同じ場所（500m 以内）は1つにする
  const hits: GeocodeHit[] = [];
  for (const h of [...osm, ...gsi.slice(0, limit)]) {
    if (!Number.isFinite(h.at[0]) || !Number.isFinite(h.at[1])) continue;
    if (hits.some((x) => Math.abs(x.at[0] - h.at[0]) < 0.005 && Math.abs(x.at[1] - h.at[1]) < 0.005)) continue;
    hits.push(h);
  }
  return hits.slice(0, limit);
}
