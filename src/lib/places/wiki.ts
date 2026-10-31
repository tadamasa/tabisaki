import "server-only";
import * as turf from "@turf/turf";
import { parseDeities } from "./deity";
import { parseReisai } from "./festival";
import { parseShakaku } from "./shakaku";

// ja.wikipedia の記事から、座標と祭神・社格・例祭を一度に50件まで引く
const API = process.env.WIKIPEDIA_API ?? "https://ja.wikipedia.org/w/api.php";
const UA = "tabisaki/0.1 (personal trip planner)";

export type WikiShrine = { title: string; lat: number; lng: number; deities: string[]; shakaku: string[]; reisai: string | null };

type ApiPage = {
  title: string;
  missing?: boolean;
  pageprops?: { disambiguation?: string };
  coordinates?: { lat: number; lon: number }[];
  revisions?: { slots: { main: { content: string } } }[];
};
type ApiResponse = {
  query?: { pages?: ApiPage[]; redirects?: { from: string; to: string }[]; normalized?: { from: string; to: string }[] };
};

// 引いた名前 → 記事（曖昧さ回避や、祭神欄も社格欄も例祭欄もない記事は除く）
export async function fetchWikiShrines(titles: string[]): Promise<Map<string, WikiShrine>> {
  const unique = [...new Set(titles)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) batches.push(unique.slice(i, i + 50));
  // 50件ずつの問い合わせを、4本ずつ並べて投げる
  const found = new Map<string, WikiShrine>();
  for (let i = 0; i < batches.length; i += 4) {
    const results = await Promise.all(batches.slice(i, i + 4).map(fetchBatch));
    for (const r of results) for (const [k, v] of r) found.set(k, v);
  }
  return found;
}

async function fetchBatch(batch: string[]): Promise<Map<string, WikiShrine>> {
  const found = new Map<string, WikiShrine>();
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "revisions|coordinates|pageprops",
    rvprop: "content",
    rvslots: "main",
    rvsection: "0",
    ppprop: "disambiguation",
    titles: batch.join("|"),
  });
  const res = await fetch(`${API}?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse;
  const q = body.query ?? {};
  const byTitle = new Map<string, WikiShrine>();
  for (const p of q.pages ?? []) {
    if (p.missing || p.pageprops?.disambiguation !== undefined || !p.coordinates?.length) continue;
    const text = p.revisions?.[0]?.slots.main.content ?? "";
    const deities = parseDeities(text);
    const shakaku = parseShakaku(text);
    const reisai = parseReisai(text);
    if (deities.length === 0 && shakaku.length === 0 && !reisai) continue;
    byTitle.set(p.title, { title: p.title, lat: p.coordinates[0].lat, lng: p.coordinates[0].lon, deities, shakaku, reisai });
  }
  // 引いた名前から、正規化・転送をたどって記事に結ぶ
  const hop = new Map([...(q.normalized ?? []), ...(q.redirects ?? [])].map((r) => [r.from, r.to]));
  for (const t of batch) {
    let cur = t;
    for (let k = 0; k < 3 && hop.has(cur); k++) cur = hop.get(cur)!;
    const page = byTitle.get(cur);
    if (page) found.set(t, page);
  }
  return found;
}

// 記事の座標が実際の場所から近いときだけ、その社の記事とみなす（同名の別の社を避ける）
export const isNear = (page: WikiShrine, lat: number, lng: number, km = 1.5) =>
  turf.distance([page.lng, page.lat], [lng, lat]) <= km;

// 「上賀茂神社 (賀茂別雷神社)」のような記録名から、記事名の候補を出す
export function titleCandidates(name: string) {
  const inner = name.match(/[（(](.+?)[)）]/)?.[1];
  const outer = name.replace(/\s*[（(].*?[)）]\s*/g, "").trim();
  return [inner, outer].filter((t): t is string => !!t && /神社|大社|神宮|宮|社$/.test(t));
}
