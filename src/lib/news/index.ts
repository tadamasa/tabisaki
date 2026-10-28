import "server-only";
import { cacheLife } from "next/cache";
import { getAtlas } from "@/lib/atlas";
import { townArea } from "@/lib/townArea";
import { type NewsItem, newsQuery, parseNewsRss } from "./rss";

// 地帯の町で話題になっている催しのニュース見出し。Google ニュースの検索 RSS を使う（鍵は要らないが、見出しだけで日付の整ったデータではない）
const RSS = process.env.NEWS_RSS_URL ?? "https://news.google.com/rss/search";
const MAX_ITEMS = 8;

async function fetchNews(towns: string[]): Promise<NewsItem[]> {
  "use cache: remote";
  cacheLife("hours");
  const params = new URLSearchParams({ q: newsQuery(towns), hl: "ja", gl: "JP", ceid: "JP:ja" });
  const res = await fetch(`${RSS}?${params}`, {
    headers: { "User-Agent": "tabisaki/0.1 (personal trip planner)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ニュースを読めませんでした（HTTP ${res.status}）`);
  return parseNewsRss(await res.text()).slice(0, MAX_ITEMS);
}

export async function getAreaNews(areaId: string): Promise<{ items: NewsItem[]; query: string } | null> {
  const atlas = await getAtlas();
  const area = townArea(atlas, areaId) ?? atlas.areas.find((a) => a.id === areaId);
  if (!area) return null;
  // 「吉野」のような短い名前は別の意味でも出るので、「吉野町」のように市町村の名前で探す
  const towns = area.towns.map((t) => (/[市区町村]$/.test(t.name) ? t.name : `${t.pref}${t.name}`));
  return { items: await fetchNews(towns), query: newsQuery(towns) };
}
