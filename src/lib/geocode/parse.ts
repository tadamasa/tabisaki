// 地名検索の返事を、出発地の候補にそろえる
export type GeocodeHit = { label: string; at: [number, number]; source: "osm" | "gsi" };

export type NominatimRow = { lat: string; lon: string; name?: string; display_name: string };
export type GsiRow = { geometry: { coordinates: [number, number] }; properties: { title: string } };

export function parseNominatim(rows: NominatimRow[]): GeocodeHit[] {
  return rows.map((r) => {
    // 「金沢駅, 木ノ新保町, 金沢市, 石川県, 920-0858, 日本」→「金沢駅（金沢市）」
    // 市町村は都道府県のすぐ前（郡があればその前）にある。町名の「〇〇町」と取り違えないよう、後ろから見る
    const parts = r.display_name.split(",").map((s) => s.trim());
    const pref = parts.findIndex((p) => /[都道府県]$/.test(p));
    const city = pref > 0 ? parts.slice(Math.max(0, pref - 2), pref).reverse().find((p) => /[市町村]$/.test(p) && p !== r.name) : undefined;
    const name = r.name || parts[0];
    return { label: city ? `${name}（${city}）` : name, at: [Number(r.lon), Number(r.lat)], source: "osm" };
  });
}

export const parseGsi = (rows: GsiRow[]): GeocodeHit[] =>
  rows.map((r) => ({ label: r.properties.title, at: r.geometry.coordinates, source: "gsi" }));
