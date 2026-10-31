import assert from "node:assert/strict";
import { test } from "node:test";
import type { Atlas, MuniProps } from "@/lib/types";
import { fromOrigin, matchTowns, townCenters } from "./origin";

const muni = (id: string, short: string, lng: number, lat: number, area: string | null, visited = false) => ({
  type: "Feature" as const,
  properties: { id, name: `奈良県${short}`, short, pref: "奈良県", visits: 0, visited, first: null, last: null, km: 0, area } as MuniProps,
  geometry: { type: "Polygon" as const, coordinates: [[[lng - 0.05, lat - 0.05], [lng + 0.05, lat - 0.05], [lng + 0.05, lat + 0.05], [lng - 0.05, lat - 0.05]]] },
});
const atlas = {
  areas: [
    { id: "a1", label: "北", pref: ["奈良県"], km: 10, center: [135.8, 34.7], bbox: [0, 0, 0, 0], towns: [{ id: "1", name: "北町", pref: "奈良県", km: 10 }] },
    { id: "a2", label: "南", pref: ["奈良県"], km: 50, center: [135.8, 34.2], bbox: [0, 0, 0, 0], towns: [{ id: "2", name: "南村", pref: "奈良県", km: 50 }] },
  ],
  municipalities: { type: "FeatureCollection", features: [muni("1", "北町", 135.8, 34.7, "a1"), muni("2", "南村", 135.8, 34.2, "a2"), muni("3", "吉野町", 135.85, 34.4, null, true)] },
} as unknown as Atlas;

test("出発地からの距離で地帯を並べ直す", () => {
  const centers = townCenters(atlas);
  const fromSouth = fromOrigin(atlas, centers, [135.8, 34.2]);
  assert.deepEqual(fromSouth.areas.map((a) => a.id), ["a2", "a1"]);
  assert.equal(fromSouth.areas[0].km, 0);
  assert.equal(fromSouth.towns[0].id, "2");
});

test("町の名前から出発地の候補を出す", () => {
  const hits = matchTowns(townCenters(atlas), "吉野");
  assert.equal(hits[0].label, "奈良県吉野町");
  assert.equal(matchTowns(townCenters(atlas), " ").length, 0);
});
