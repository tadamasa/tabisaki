import "server-only";
import { cacheLife } from "next/cache";
import { getAtlas } from "@/lib/atlas";
import { nearArea } from "@/lib/nearArea";
import { townArea } from "@/lib/townArea";
import { getAreaPlaces } from "@/lib/places";
import { type NewsItem, exhibitQuery, hallOf, newsQuery, parseNewsRss } from "./rss";

// 地帯の町で話題になっている催しのニュース見出し。Google ニュースの検索 RSS を使う（鍵は要らないが、見出しだけで日付の整ったデータではない）
const RSS = process.env.NEWS_RSS_URL ?? "https://news.google.com/rss/search";
const MAX_ITEMS = 8;

const MAX_HALLS = 10;

async function fetchNews(q: string): Promise<NewsItem[]> {
  "use cache: remote";
  cacheLife("hours");
  const params = new URLSearchParams({ q, hl: "ja", gl: "JP", ceid: "JP:ja" });
  const res = await fetch(`${RSS}?${params}`, {
    headers: { "User-Agent": "tabisaki/0.1 (personal trip planner)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ニュースを読めませんでした（HTTP ${res.status}）`);
  return parseNewsRss(await res.text()).slice(0, MAX_ITEMS);
}

export type AreaNews = { items: NewsItem[]; exhibits: (NewsItem & { hall: string | null })[] };

export async function getAreaNews(areaId: string): Promise<AreaNews | null> {
  const atlas = await getAtlas();
  const area = nearArea(atlas, areaId) ?? townArea(atlas, areaId) ?? atlas.areas.find((a) => a.id === areaId);
  if (!area) return null;
  // 「吉野」のような短い名前は別の意味でも出るので、「吉野町」のように市町村の名前で探す
  // まわりを探すときは町が多いので、近い8町に絞る
  const towns = area.towns.slice(0, 8).map((t) => (/[市区町村]$/.test(t.name) ? t.name : `${t.pref}${t.name}`));
  // 地帯の博物館・美術館の特別展・企画展。候補の館は地帯を開いたときに探してあるので、その覚えを使う
  const places = await getAreaPlaces(areaId).catch(() => null);
  const halls = (places?.halls ?? []).filter((h) => !h.outside).slice(0, MAX_HALLS).map((h) => h.name);
  const eq = exhibitQuery(halls);
  const [items, exhibits] = await Promise.all([fetchNews(newsQuery(towns)), eq ? fetchNews(eq).catch(() => []) : []]);
  return {
    items: items.filter((n) => !exhibits.some((e) => e.link === n.link)),
    exhibits: exhibits.map((n) => ({ ...n, hall: hallOf(n.title, halls) })),
  };
}
