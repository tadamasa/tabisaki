import assert from "node:assert/strict";
import { test } from "node:test";
import { daysToFestival, festivalDays, festivalNote, parseReisai } from "./festival";

test("基礎情報の例祭欄を短い言葉にする", () => {
  assert.equal(parseReisai("|社格 = 式内社\n|例祭 = [[10月17日]]<br />（[[秋祭り|秋季大祭]]）<ref>x</ref>\n|主な神事 = "), "10月17日・（秋季大祭）");
  assert.equal(parseReisai("|例祭 = \n|主な神事 = 御田植祭"), null);
  assert.equal(parseReisai("|社格 = 郷社"), null);
});

test("月日と「第N曜日」を読み、旧暦は数えない", () => {
  assert.deepEqual(festivalDays("10月17日", 2026).map((d) => d.getDate()), [17]);
  // 2026年4月の第2日曜は12日
  assert.deepEqual(festivalDays("4月第2日曜日", 2026).map((d) => [d.getMonth() + 1, d.getDate()]), [[4, 12]]);
  assert.deepEqual(festivalDays("10月第二土曜", 2026).map((d) => d.getDate()), [10]);
  assert.equal(festivalDays("旧暦8月15日", 2026).length, 0);
  assert.equal(festivalDays("旧暦8月15日・新暦9月15日", 2026).length, 1);
});

test("旅の日に近い例祭に印を付け、年をまたいでも数える", () => {
  const trip = new Date(2026, 9, 31);
  assert.equal(daysToFestival("11月1日", trip), 1);
  assert.equal(festivalNote("11月1日", trip), "例祭の1日前");
  assert.equal(festivalNote("10月31日", trip), "旅の日が例祭");
  assert.equal(festivalNote("4月1日", trip), null);
  assert.equal(daysToFestival("1月2日", new Date(2026, 11, 30)), 3);
  assert.equal(festivalNote("不定", trip), null);
});
