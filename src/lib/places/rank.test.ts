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

test("博物館・美術館は目的地の候補として、公立の館を上に出す。美術館は予習先に含めない", () => {
  const r = rankPlaces(
    [
      ...elements,
      node(9, 135.57, 34.37, { tourism: "museum", museum: "art", name: "かつらぎ町立美術館" }),
      node(10, 135.87, 34.37, { tourism: "museum", name: "奈良県立吉野博物館" }),
      node(11, 135.88, 34.38, { tourism: "gallery", name: "山のギャラリー" }),
    ],
    towns,
  );
  assert.deepEqual(r.halls.map((h) => [h.name, h.kind]), [
    ["奈良県立吉野博物館", "museum"],
    ["かつらぎ町立美術館", "art"],
    ["吉野歴史資料館", "museum"],
    ["山のギャラリー", "art"],
  ]);
  assert.deepEqual(r.halls[0].reasons, ["公立"]);
  assert.ok(!r.primers.some((p) => p.kind === "art"));
});

test("城・城跡を目的地の候補として、記事や史跡指定のある城を上に出す", () => {
  const r = rankPlaces(
    [
      ...elements,
      node(12, 135.87, 34.37, { historic: "castle", ruins: "yes", name: "吉野城跡" }),
      node(13, 135.57, 34.37, { historic: "castle", name: "かつらぎ城", wikipedia: "ja:かつらぎ城", heritage: "2" }),
    ],
    towns,
  );
  assert.deepEqual(r.castles.map((c) => [c.name, c.kind]), [
    ["かつらぎ城", "castle"],
    ["吉野城跡", "castle"],
  ]);
  assert.deepEqual(r.castles[1].reasons, ["城跡"]);
  assert.ok(!r.anchors.some((a) => a.kind === "castle"));
});

test("隣の行ったことのある町では、記録のない場所だけを後ろに出し、宿も拾う", () => {
  const withNeighbor: Town[] = [...towns, { id: "29442", name: "隣町", geometry: square(136.5, 34.45), outside: true }];
  const more = [
    ...elements,
    node(9, 136.52, 34.52, { amenity: "place_of_worship", religion: "shinto", name: "参拝済みの社", wikipedia: "ja:y" }),
    node(10, 136.53, 34.53, { tourism: "museum", name: "隣町郷土資料館", wikipedia: "ja:z" }),
    node(11, 135.84, 34.34, { tourism: "hotel", name: "吉野温泉 元湯" }),
    node(12, 136.54, 34.54, { tourism: "hotel", name: "駅前ホテル" }),
  ];
  const visited = (townId: string, name: string) => townId === "29442" && name === "参拝済みの社";
  const r = rankPlaces(more, withNeighbor, visited);
  // 地帯の外の神社（7）は隣町にあり記録もないので、隣町の社として最後に出る
  assert.equal(r.anchors.at(-1)?.name, "地帯の外の神社");
  assert.ok(r.anchors.at(-1)?.outside);
  assert.ok(r.anchors.at(-1)?.reasons.includes("行ったことのある町"));
  assert.ok(!r.anchors.some((a) => a.name === "参拝済みの社"));
  assert.equal(r.shrineCount, 3);
  assert.deepEqual(r.halls.map((h) => h.name), ["吉野歴史資料館", "隣町郷土資料館"]);
  assert.deepEqual(r.lodgings.map((l) => l.name), ["吉野温泉 元湯", "駅前ホテル"]);
  assert.ok(r.lodgings[0].reasons.includes("旅館・温泉宿"));
});

test("行ったことのある町を1つだけ開いたときも、記録のある場所は除き、ほかはふつうに並べる", () => {
  const one: Town[] = [{ ...towns[0], visited: true }];
  const visited = (_: string, name: string) => name === "吉野水分神社";
  const r = rankPlaces(elements, one, visited);
  assert.deepEqual(r.anchors.map((a) => a.name), ["八幡神社"]);
  assert.ok(!r.anchors[0].outside);
  assert.equal(r.shrineCount, 1);
});
