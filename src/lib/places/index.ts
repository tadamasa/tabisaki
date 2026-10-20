import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { AreaPlaces } from "@/lib/types";
import { ATLAS_TAG, getAtlas, readBoundary } from "@/lib/atlas";
import { type VisitedShrine, findDeityKin, findEn, findLineage } from "./en";
import { type OsmElement, type Town, pairPrimer, rankPlaces } from "./rank";
import { fetchWikiShrines, isNear, titleCandidates } from "./wiki";

// OVERPASS_URL はカンマ区切りで複数指定でき、失敗したら次を試す
const DEFAULT_OVERPASS = "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter";

const query = ([w, s, e, n]: number[]) => {
  const bbox = `${s},${w},${n},${e}`;
  return `[out:json][timeout:60];
(
  nwr["amenity"="place_of_worship"]["religion"="shinto"]["name"](${bbox});
  nwr["tourism"~"^(museum|gallery)$"]["name"](${bbox});
  nwr["historic"="castle"]["name"](${bbox});
  nwr["tourism"="information"]["information"~"^(office|visitor_centre)$"]["name"](${bbox});
);
out center tags;`;
};

async function fetchOverpass(bbox: number[]): Promise<{ elements: OsmElement[]; source: string }> {
  const errors: string[] = [];
  for (const url of (process.env.OVERPASS_URL ?? DEFAULT_OVERPASS).split(",").map((s) => s.trim())) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "tabisaki/0.1 (personal trip planner)" },
        body: new URLSearchParams({ data: query(bbox) }),
        signal: AbortSignal.timeout(70_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { elements: OsmElement[] };
      return { elements: body.elements, source: new URL(url).host };
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw new Error(`OpenStreetMap の検索に失敗しました（${errors.join(" / ")}）`);
}

// 参拝済みの神社の祭神を Wikipedia の記事から読む。記事の座標が訪問地点に近いものだけ採る
async function getVisitedDeities(): Promise<VisitedShrine[]> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(ATLAS_TAG);

  const atlas = await getAtlas();
  const shrines = new Map<string, (typeof atlas.spots)[number]>();
  for (const s of atlas.spots) if (s.cat === "shrine") shrines.set(`${s.muni}:${s.name}`, s);
  const pages = await fetchWikiShrines([...shrines.values()].flatMap((s) => titleCandidates(s.name)));
  const result: VisitedShrine[] = [];
  for (const s of shrines.values()) {
    const page = titleCandidates(s.name).map((t) => pages.get(t)).find((p) => p && isNear(p, s.lat, s.lng));
    if (page) result.push({ name: s.name, ts: s.ts, muni: s.muni, deities: page.deities });
  }
  return result;
}

// Wikipedia に届かなくても候補は出す（祭神の縁だけが欠ける）
async function safely<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error("祭神を読めませんでした", e);
    return fallback;
  }
}

const wikiTitle = (url: string | null) =>
  url?.startsWith("https://ja.wikipedia.org/wiki/") ? decodeURIComponent(url.slice(30)).replaceAll("_", " ") : null;

// Overpass は公共の窓口なので、結果は全インスタンスで共有するキャッシュに置く
export async function getAreaPlaces(areaId: string): Promise<AreaPlaces | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(ATLAS_TAG);

  const atlas = await getAtlas();
  const area = atlas.areas.find((a) => a.id === areaId);
  if (!area) return null;

  // 町の判定は細かい境界で行う
  const ids = new Map(area.towns.map((t) => [t.id, t.name]));
  const detailed = await readBoundary("detailed");
  const towns: Town[] = [];
  for (const f of detailed.features) {
    const name = ids.get(f.properties.N03_007);
    if (name && f.geometry) towns.push({ id: f.properties.N03_007, name, geometry: f.geometry });
  }

  const { elements, source } = await fetchOverpass(area.bbox);
  const ranked = rankPlaces(elements, towns);

  const visitedShrines = atlas.spots.filter((s) => s.cat === "shrine");
  const townNames = new Map(atlas.municipalities.features.map((f) => [f.properties.id, f.properties.short]));
  const townOf = (muni: string | null) => (muni ? townNames.get(muni) ?? null : null);
  const anchorTitles = (a: (typeof ranked.anchors)[number]) => [wikiTitle(a.wikipedia), a.name].filter((t): t is string => !!t);
  const [visitedDeities, anchorPages] = await Promise.all([
    safely(getVisitedDeities(), []),
    safely(fetchWikiShrines(ranked.anchors.flatMap(anchorTitles)), new Map()),
  ]);
  const deitiesOf = (a: (typeof ranked.anchors)[number]) =>
    anchorTitles(a).map((t) => anchorPages.get(t)).find((p) => p && isNear(p, a.lat, a.lng))?.deities ?? [];

  return {
    areaId,
    anchors: ranked.anchors.map((a) => ({
      ...a,
      primer: pairPrimer(a, ranked.primers),
      en: findEn(
        findLineage(a, visitedShrines, ranked.anchors, townOf),
        findDeityKin(a.name, deitiesOf(a), visitedDeities, townOf),
      ),
    })),
    primers: ranked.primers,
    halls: ranked.halls,
    castles: ranked.castles,
    shrineCount: ranked.shrineCount,
    source: `OpenStreetMap（${source}）`,
  };
}
