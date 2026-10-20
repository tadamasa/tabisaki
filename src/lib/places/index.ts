import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { AreaPlaces } from "@/lib/types";
import { ATLAS_TAG, getAtlas, readBoundary } from "@/lib/atlas";
import { type OsmElement, type Town, pairPrimer, rankPlaces } from "./rank";

// OVERPASS_URL はカンマ区切りで複数指定でき、失敗したら次を試す
const DEFAULT_OVERPASS = "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter";

const query = ([w, s, e, n]: number[]) => {
  const bbox = `${s},${w},${n},${e}`;
  return `[out:json][timeout:60];
(
  nwr["amenity"="place_of_worship"]["religion"="shinto"]["name"](${bbox});
  nwr["tourism"="museum"]["name"](${bbox});
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

export async function getAreaPlaces(areaId: string): Promise<AreaPlaces | null> {
  "use cache";
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
  return {
    areaId,
    anchors: ranked.anchors.map((a) => ({ ...a, primer: pairPrimer(a, ranked.primers) })),
    primers: ranked.primers,
    shrineCount: ranked.shrineCount,
    source: `OpenStreetMap（${source}）`,
  };
}
