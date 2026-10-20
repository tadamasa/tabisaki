import assert from "node:assert/strict";
import { test } from "node:test";
import { pairPrimer, rankPlaces, type OsmElement, type Town } from "./rank";

const square = (x: number, y: number) => ({
  type: "Polygon" as const,
  coordinates: [[[x, y], [x + 0.1, y], [x + 0.1, y + 0.1], [x, y + 0.1], [x, y]]],
});
const towns: Town[] = [
  { id: "29441", name: "吉野町", geometry: square(135.8, 34.3) },
  { id: "30341", name: "かつらぎ町", geometry: square(135.5, 34.3) },
];

const node = (id: number, lon: number, lat: number, tags: Record<string, string>): OsmElement => ({ type: "node", id, lon, lat, tags });
const elements: OsmElement[] = [
  node(1, 135.55, 34.35, { amenity: "place_of_worship", religion: "shinto", name: "丹生都比売神社", wikipedia: "ja:丹生都比売神社", description: "式内社・紀伊国一宮" }),
  node(2, 135.85, 34.35, { amenity: "place_of_worship", religion: "shinto", name: "吉野水分神社", wikipedia: "ja:吉野水分神社" }),
  node(3, 135.86, 34.36, { amenity: "place_of_worship", religion: "shinto", name: "八幡神社" }),
  { type: "way", id: 4, center: { lat: 34.351, lon: 135.851 }, tags: { tourism: "museum", name: "吉野歴史資料館" } },
  node(5, 135.56, 34.36, { tourism: "information", information: "office", name: "かつらぎ町観光案内所" }),
  node(6, 135.56, 34.36, { tourism: "information", information: "board", name: "案内板" }),
  node(7, 136.5, 34.5, { amenity: "place_of_worship", religion: "shinto", name: "地帯の外の神社", wikipedia: "ja:x" }),
  node(8, 135.85, 34.35, { amenity: "place_of_worship", religion: "buddhist", name: "金峯山寺" }),
];

test("由緒の手がかりが多い社ほど上に来て、地帯の外や対象外は除かれる", () => {
  const r = rankPlaces(elements, towns);
  assert.deepEqual(r.anchors.map((a) => a.name), ["丹生都比売神社", "吉野水分神社", "八幡神社"]);
  assert.equal(r.shrineCount, 3);
  assert.deepEqual(r.anchors[0].reasons, ["式内社", "Wikipediaに記事あり"]);
  assert.equal(r.anchors[0].town, "かつらぎ町");
  assert.equal(r.anchors[0].wikipedia, "https://ja.wikipedia.org/wiki/%E4%B8%B9%E7%94%9F%E9%83%BD%E6%AF%94%E5%A3%B2%E7%A5%9E%E7%A4%BE");
  assert.deepEqual(r.primers.map((p) => p.name).sort(), ["かつらぎ町観光案内所", "吉野歴史資料館"]);
});

test("本命ごとにいちばん近い資料館・案内所を組み、遠すぎれば組まない", () => {
  const r = rankPlaces(elements, towns);
  const yoshino = r.anchors.find((a) => a.name === "吉野水分神社")!;
  assert.equal(pairPrimer(yoshino, r.primers)?.place.name, "吉野歴史資料館");
  assert.equal(pairPrimer({ ...yoshino, lng: 137.5 }, r.primers), null);
});
