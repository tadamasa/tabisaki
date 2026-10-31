// 町や場所に結びつけた資料（パンフレット、もらってきて Google ドライブに保存した資料など）のリンク。
// 縁泉スプレッドシートの links シートの1行と同じ形（gas/ensen-api.gs）
export type LinkTarget = {
  target_type: "town" | "place";
  // town なら市町村コード、place なら OpenStreetMap の id（node/123 など）
  target_id: string;
  target_name: string;
  muni_code: string;
  lat: string;
  lng: string;
};

export type TripLink = LinkTarget & { link_id: string; created_at: string; title: string; url: string; note: string };

export const linkKey = (t: Pick<LinkTarget, "target_type" | "target_id">) => `${t.target_type}:${t.target_id}`;

// Google ドライブのリンクなら、そうとわかる印を付ける
export const isDrive = (url: string) => /^https:\/\/(drive|docs)\.google\.com\//.test(url);
