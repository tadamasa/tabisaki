import "server-only";
import * as turf from "@turf/turf";
import { cacheLife, cacheTag } from "next/cache";
import type { AreaPlaces, Spot } from "@/lib/types";
import { ATLAS_TAG, getAtlas, readBoundary } from "@/lib/atlas";
import { townArea } from "@/lib/townArea";
import { type VisitedShrine, findDeityKin, findEn, findLineage } from "./en";
import { type OsmElement, type Town, pairPrimer, rankPlaces } from "./rank";
import { shakakuBasis } from "./shakaku";
import { fetchWikiShrines, isNear, titleCandidates } from "./wiki";

// OVERPASS_URL はカンマ区切りで複数指定できる。先頭から少しずつ時間をずらして問い合わせ、最初に返った結果を使う
const DEFAULT_OVERPASS =
  "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter";
const HEDGE_MS = 4000;

const query = ([w, s, e, n]: number[]) => {
  const bbox = `${s},${w},${n},${e}`;
  return `[out:json][timeout:60];
(
  nwr["amenity"="place_of_worship"]["religion"="shinto"]["name"](${bbox});
  nwr["tourism"~"^(museum|gallery)$"]["name"](${bbox});
  nwr["historic"="castle"]["name"](${bbox});
  nwr["tourism"="information"]["information"~"^(office|visitor_centre)$"]["name"](${bbox});
  nwr["tourism"~"^(hotel|guest_house|hostel|motel)$"]["name"](${bbox});
);
out center tags qt;`;
};

async function askOverpass(url: string, bbox: number[], signal: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "tabisaki/0.1 (personal trip planner)" },
    body: new URLSearchParams({ data: query(bbox) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(70_000)]),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { elements: OsmElement[] };
  return { elements: body.elements, source: new URL(url).host };
}

// 混んでいる窓口に待たされないよう、返事が遅ければ次の窓口にも問い合わせる（hedged request）
async function fetchOverpass(bbox: number[]): Promise<{ elements: OsmElement[]; source: string }> {
  const urls = (process.env.OVERPASS_URL ?? DEFAULT_OVERPASS).split(",").map((s) => s.trim());
  const stop = new AbortController();
  const errors: string[] = [];
  try {
    return await Promise.any(
      urls.map(async (url, i) => {
        if (i > 0) await new Promise((r) => setTimeout(r, i * HEDGE_MS));
        if (stop.signal.aborted) throw new Error("不要");
        try {
          return await askOverpass(url, bbox, stop.signal);
        } catch (e) {
          errors.push(`${url}: ${e instanceof Error ? e.message : e}`);
          throw e;
        }
      }),
    );
  } catch {
    throw new Error(`OpenStreetMap の検索に失敗しました（${errors.join(" / ")}）`);
  } finally {
    stop.abort();
  }
}

// OpenStreetMap の結果は訪問記録と関係ないので、記録を読み直しても捨てずに長く覚えておく
async function getOsm(bbox: number[]) {
  "use cache: remote";
  cacheLife("weeks");
  return fetchOverpass(bbox);
}

// 記事の祭神・社格も同じく、記録の読み直しでは捨てない。
// 記事から読む項目を増やしたら WIKI_VERSION を上げて、古い覚えを使わないようにする
const WIKI_VERSION = 2;
async function getWikiShrines(version: number, titles: string[]) {
  "use cache: remote";
  cacheLife("weeks");
  void version; // 覚えの鍵にだけ使う
  return [...(await fetchWikiShrines(titles)).entries()];
}

// 参拝済みの神社の祭神を Wikipedia の記事から読む。記事の座標が訪問地点に近いものだけ採る。
// 新しく参拝した社の祭神は、この覚えが切れたとき（数日）に反映される
async function getVisitedDeities(): Promise<VisitedShrine[]> {
  "use cache: remote";
  cacheLife("days");

  const atlas = await getAtlas();
  const shrines = new Map<string, (typeof atlas.spots)[number]>();
  for (const s of atlas.spots) if (s.cat === "shrine") shrines.set(`${s.muni}:${s.name}`, s);
  const pages = new Map(await getWikiShrines(WIKI_VERSION, [...shrines.values()].flatMap((s) => titleCandidates(s.name)).sort()));
  const result: VisitedShrine[] = [];
  for (const s of shrines.values()) {
    const page = titleCandidates(s.name).map((t) => pages.get(t)).find((p) => p && isNear(p, s.lat, s.lng));
    if (page) result.push({ name: s.name, ts: s.ts, muni: s.muni, deities: page.deities });
  }
  return result;
}

// Wikipedia が遅いときや届かないときも候補は出す（祭神の縁だけが欠ける）
async function safely<T>(p: Promise<T>, fallback: T, ms = 8000): Promise<T> {
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
  } catch (e) {
    console.error("祭神を読めませんでした", e);
    return fallback;
  }
}

const wikiTitle = (url: string | null) =>
  url?.startsWith("https://ja.wikipedia.org/wiki/") ? decodeURIComponent(url.slice(30)).replaceAll("_", " ") : null;

const round = (bbox: number[]) => bbox.map((v, i) => (i < 2 ? Math.floor(v * 100) / 100 : Math.ceil(v * 100) / 100));

export async function getAreaPlaces(areaId: string): Promise<AreaPlaces | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(ATLAS_TAG);

  const atlas = await getAtlas();
  // 地帯のほか、地図の町名から開いた1つの町（town-<コード>）も扱う
  const single = townArea(atlas, areaId);
  const area = single ?? atlas.areas.find((a) => a.id === areaId);
  if (!area) return null;

  // 地帯の町に加えて、隣り合う「行ったことのある町」も探す（まだ行っていない場所だけを出す）。1つの町を開いたときは隣は探さない
  const inArea = new Set(area.towns.map((t) => t.id));
  const muni = new Map(atlas.municipalities.features.map((f) => [f.properties.id, f.properties]));
  const { edges } = single ? { edges: [] } : ((await readBoundary("edges")) as { edges: [string, string, number][] });
  const neighbors = new Set<string>();
  for (const [a, b] of edges) {
    if (inArea.has(a) && !inArea.has(b) && muni.get(b)?.visited) neighbors.add(b);
    if (inArea.has(b) && !inArea.has(a) && muni.get(a)?.visited) neighbors.add(a);
  }

  // 町の判定は細かい境界で行う
  const detailed = await readBoundary("detailed");
  const towns: Town[] = [];
  for (const f of detailed.features) {
    const id = f.properties.N03_007;
    if (!f.geometry || !(inArea.has(id) || neighbors.has(id))) continue;
    const name = area.towns.find((t) => t.id === id)?.name ?? muni.get(id)?.short ?? id;
    // 行ったことのある町では、記録のある場所を除く（開いた町そのものが行ったことのある町のときも）
    towns.push({ id, name, geometry: f.geometry, outside: neighbors.has(id), visited: !!muni.get(id)?.visited });
  }
  const bbox = round(turf.bbox(turf.featureCollection(towns.map((t) => turf.feature(t.geometry)))));

  // 行ったことのある町では、記録のある場所（近くにある、または同じ名前）を除く
  const spotsByMuni = new Map<string, Spot[]>();
  const visitedTowns = new Set(towns.filter((t) => t.visited).map((t) => t.id));
  for (const s of atlas.spots) if (s.muni && visitedTowns.has(s.muni)) spotsByMuni.set(s.muni, [...(spotsByMuni.get(s.muni) ?? []), s]);
  const bare = (n: string) => n.replace(/\s*[（(].*?[)）]\s*/g, "").trim();
  const visitedHere = (townId: string, name: string, lat: number, lng: number) =>
    (spotsByMuni.get(townId) ?? []).some(
      (s) => bare(s.name) === bare(name) || turf.distance([s.lng, s.lat], [lng, lat]) <= 0.2,
    );

  const { elements, source } = await getOsm(bbox);
  const ranked = rankPlaces(elements, towns, visitedHere);

  const visitedShrines = atlas.spots.filter((s) => s.cat === "shrine");
  const townOf = (id: string | null) => (id ? muni.get(id)?.short ?? null : null);
  const anchorTitles = (a: (typeof ranked.anchors)[number]) => [wikiTitle(a.wikipedia), a.name].filter((t): t is string => !!t);
  const [visitedDeities, anchorPages] = await Promise.all([
    safely(getVisitedDeities(), []),
    safely(getWikiShrines(WIKI_VERSION, ranked.anchors.flatMap(anchorTitles).sort()), []).then((e) => new Map(e)),
  ]);
  const pageOf = (a: (typeof ranked.anchors)[number]) =>
    anchorTitles(a).map((t) => anchorPages.get(t)).find((p) => p && isNear(p, a.lat, a.lng));
  const deitiesOf = (a: (typeof ranked.anchors)[number]) => pageOf(a)?.deities ?? [];

  // 記事の社格を点数に足して並べ直す（名前などですでに数えたものは重ねない）。隣の町の社は後ろのまま
  const anchors = ranked.anchors
    .map((a) => {
      const shakaku = pageOf(a)?.shakaku ?? [];
      const extra = shakakuBasis(shakaku, new Set(a.basis?.map((b) => b.key)));
      return {
        ...a,
        shakaku,
        basis: [...(a.basis ?? []), ...extra],
        score: a.score + extra.reduce((s, b) => s + b.pts, 0),
      };
    })
    .sort((a, b) => Number(!!a.outside) - Number(!!b.outside) || b.score - a.score);

  return {
    areaId,
    anchors: anchors.map((a) => ({
      ...a,
      primer: pairPrimer(a, ranked.primers),
      en: findEn(
        findLineage(a, visitedShrines, anchors, townOf),
        findDeityKin(a.name, deitiesOf(a), visitedDeities, townOf),
      ),
    })),
    primers: ranked.primers,
    halls: ranked.halls,
    castles: ranked.castles,
    lodgings: ranked.lodgings,
    shrineCount: ranked.shrineCount,
    source: `OpenStreetMap（${source}）`,
  };
}
