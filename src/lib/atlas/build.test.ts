import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAtlas, type VisitRow } from "./build";

// 経度 135.0〜135.1 が A町、135.1〜135.2 が B町
const town = (code: string, name: string, x0: number) => ({
  type: "Feature" as const,
  properties: { N03_001: "大阪府", N03_003: null, N03_004: name, N03_007: code },
  geometry: { type: "Polygon" as const, coordinates: [[[x0, 34.0], [x0 + 0.1, 34.0], [x0 + 0.1, 34.1], [x0, 34.1], [x0, 34.0]]] },
});
const boundary = { type: "FeatureCollection" as const, features: [town("27001", "A町", 135.0), town("27002", "B町", 135.1)] };
const visit = (ts: string, lng: number, place?: string, name = "中央図書館"): VisitRow => ({ ts, lat: 34.05, lng, name, place, note: null });

test("同じ場所の記録は1点にまとめ、位置は中央値、町はまとめた位置で数える", () => {
  const visits = [
    visit("2020-01-01T10:00:00+09:00", 135.05, "lib"),
    visit("2021-01-01T10:00:00+09:00", 135.051, "lib"),
    visit("2022-01-01T10:00:00+09:00", 135.15, "lib"), // B町からのチェックイン（外れ値）
    visit("2023-01-01T10:00:00+09:00", 135.15, undefined, "B神社"),
  ];
  const atlas = buildAtlas(visits, boundary, boundary, [135.05, 34.05], []);
  const lib = atlas.spots.find((s) => s.name === "中央図書館")!;
  assert.equal(atlas.spots.length, 2);
  assert.equal(lib.visits, 3);
  assert.equal(lib.lng, 135.051);
  assert.equal(lib.muni, "27001");
  assert.equal(lib.first, "2020-01-01T10:00:00+09:00");
  assert.equal(lib.ts, "2022-01-01T10:00:00+09:00");
  const visits_ = Object.fromEntries(atlas.municipalities.features.map((f) => [f.properties.short, f.properties.visits]));
  assert.deepEqual(visits_, { A町: 3, B町: 1 });
});
