import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNominatim } from "./parse";

test("駅や施設の名前に、市町村を添える（町名や区と取り違えない）", () => {
  const hit = (display_name: string, name: string) => parseNominatim([{ lat: "1", lon: "2", name, display_name }])[0].label;
  assert.equal(hit("金沢駅, 木ノ新保町, 金沢市, 石川県, 920-0858, 日本", "金沢駅"), "金沢駅（金沢市）");
  assert.equal(hit("吉野山, 吉野町, 吉野郡, 奈良県, 日本", "吉野山"), "吉野山（吉野町）");
  assert.equal(hit("梅田駅, 北区, 大阪市, 大阪府, 日本", "梅田駅"), "梅田駅（大阪市）");
});
