import assert from "node:assert/strict";
import { test } from "node:test";
import type { Atlas, MuniProps } from "@/lib/types";
import { kmFrom, nearArea, nearAreaId, parseNearId } from "./nearArea";

const muni = (id: string, short: string, lng: number, lat: number) => ({
  type: "Feature" as const,
  properties: { id, name: short, short, pref: "奈良県", visits: 0, visited: id === "1", first: null, last: null, km: 0, area: null } as MuniProps,
  geometry: { type: "Polygon" as const, coordinates: [[[lng - 0.03, lat - 0.03], [lng + 0.03, lat - 0.03], [lng + 0.03, lat + 0.03], [lng - 0.03, lat - 0.03]]] },
});
const atlas = { municipalities: { type: "FeatureCollection", features: [muni("1", "吉野町", 135.86, 34.39), muni("2", "下市町", 135.79, 34.36), muni("3", "十津川村", 135.75, 34.0)] } } as unknown as Atlas;

test("出発地のまわりを、行ったことのある町も含めて1つの範囲として開く", () => {
  const id = nearAreaId([135.861, 34.388], 8);
  assert.equal(id, "near:34.39,135.86,8");
  assert.deepEqual(parseNearId(id), { at: [135.86, 34.39], km: 8 });
  const area = nearArea(atlas, id, "現在地");
  assert.deepEqual(area?.towns.map((t) => t.id), ["1", "2"]);
  assert.equal(area?.label, "現在地のまわり（8km）");
  assert.ok((kmFrom(id, 34.39, 135.86) ?? 1) < 0.1);
  assert.equal(parseNearId("near:x,1,2"), null);
  assert.equal(parseNearId("area-1"), null);
});
