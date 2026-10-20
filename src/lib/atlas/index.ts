import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { cacheLife, cacheTag } from "next/cache";
import type { Atlas } from "@/lib/types";
import { buildAtlas } from "./build";
import { loadVisits } from "./source";

export const ATLAS_TAG = "atlas";

// 吹田市役所付近。HOME_LATLNG="緯度,経度" で変えられる
const DEFAULT_HOME = "34.7617,135.5157";

export async function readBoundary(name: string) {
  const file = path.join(process.cwd(), "data", "boundaries", `${name}.json`);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function getAtlas(): Promise<Atlas> {
  "use cache";
  cacheLife("hours");
  cacheTag(ATLAS_TAG);

  const [lat, lng] = (process.env.HOME_LATLNG ?? DEFAULT_HOME).split(",").map(Number);
  const [visits, detailed, display] = await Promise.all([
    loadVisits(),
    readBoundary("detailed"),
    readBoundary("display"),
  ]);
  return buildAtlas(visits, detailed, display, [lng, lat]);
}
