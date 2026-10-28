import "server-only";
import { cacheLife } from "next/cache";

// 市町村の公式サイトを Wikidata から引く。全国地方公共団体コード（P429、6桁）の頭5桁が市町村コード、公式サイトは P856
const SPARQL = process.env.WIKIDATA_SPARQL ?? "https://query.wikidata.org/sparql";

export async function officialSites(codes: string[]): Promise<Record<string, string>> {
  "use cache: remote";
  cacheLife("weeks");
  const valid = [...new Set(codes.filter((c) => /^\d{5}$/.test(c)))].sort();
  if (!valid.length) return {};
  const query = `SELECT ?code ?site WHERE {
  VALUES ?c { ${valid.map((c) => `"${c}"`).join(" ")} }
  ?item wdt:P429 ?code ; wdt:P856 ?site .
  FILTER(STRSTARTS(?code, ?c))
}`;
  const res = await fetch(`${SPARQL}?${new URLSearchParams({ query, format: "json" })}`, {
    headers: { "User-Agent": "tabisaki/0.1 (personal trip planner)", Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const body = (await res.json()) as { results: { bindings: { code: { value: string }; site: { value: string } }[] } };
  const sites: Record<string, string> = {};
  for (const b of body.results.bindings) {
    const code = b.code.value.slice(0, 5);
    // 同じ町に複数あれば https のものを選ぶ
    if (!sites[code] || (!sites[code].startsWith("https") && b.site.value.startsWith("https"))) sites[code] = b.site.value;
  }
  return sites;
}
