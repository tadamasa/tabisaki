import assert from "node:assert/strict";
import { test } from "node:test";
import type { Place, Spot } from "@/lib/types";
import { familyOf, findEn } from "./en";

const place = (id: string, name: string): Place => ({
  id, kind: "shrine", name, lat: 34.3, lng: 135.5, town: "かつらぎ町", score: 3, reasons: [], wikipedia: null, website: null,
});
const spot = (name: string, ts: string, muni = "27100"): Spot => ({ name, ts, lat: 0, lng: 0, cat: "shrine", muni, note: null });
const townOf = (m: string | null) => (m === "27100" ? "大阪市" : null);

test("社名から系統を読む", () => {
  assert.equal(familyOf("上賀茂神社 (賀茂別雷神社)")?.name, "賀茂");
  assert.equal(familyOf("丹生都比売神社")?.name, "丹生");
  assert.equal(familyOf("吉野水分神社")?.name, undefined);
});

test("総本社かどうか、同じ系統の参拝歴、地帯内の同系統の社をまとめる", () => {
  const visited = [
    spot("住吉大社", "2021-01-02T10:00:00"),
    spot("住吉神社", "2023-05-01T10:00:00"),
    spot("住吉神社", "2019-01-01T10:00:00"),
    spot("住吉神社", "2018-01-01T10:00:00", "28100"),
    spot("春日大社", "2022-01-01T10:00:00"),
  ];
  const anchor = place("n/1", "住吉神社");
  const en = findEn(anchor, visited, [anchor, place("n/2", "住吉若宮神社"), place("n/3", "八幡神社")], townOf)!;
  assert.equal(en.family, "住吉");
  assert.equal(en.isHonsha, false);
  assert.equal(en.honshaVisited, "住吉大社");
  assert.equal(en.visitedCount, 3);
  assert.deepEqual(en.recent[0], { name: "住吉神社", date: "2023/05/01", town: "大阪市" });
  assert.deepEqual(en.alsoHere, ["住吉若宮神社"]);

  const niu = findEn(place("n/4", "丹生都比売神社"), [], [], townOf)!;
  assert.equal(niu.isHonsha, true);
  assert.equal(niu.visitedCount, 0);
});
