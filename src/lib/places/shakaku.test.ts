import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShakaku, shakakuBasis } from "./shakaku";

const wt = `{{神社
|名称 = 丹生都比売神社
|社格 = [[式内社]]（[[名神大社|名神大]]）・[[紀伊国]][[一宮]]<ref>延喜式</ref><br />[[官国幣社|旧官幣大社]]<br />[[別表神社]]
}}`;

test("基礎情報の社格欄を短い言葉に分ける", () => {
  assert.deepEqual(parseShakaku(wt), ["式内社（名神大）", "紀伊国一宮", "旧官幣大社", "別表神社"]);
  assert.deepEqual(parseShakaku("|主祭神 = 誉田別命"), []);
  assert.deepEqual(parseShakaku("|社格 = 旧[[村社]]"), ["旧村社"]);
  assert.deepEqual(parseShakaku("|社格 =\n|創建 = 不詳"), []);
});

test("社格から点数の内訳を出し、名前ですでに数えたものは数えない", () => {
  const all = shakakuBasis(parseShakaku(wt));
  assert.deepEqual(all.map((b) => [b.label, b.pts]), [["一宮", 4], ["名神大社", 1], ["式内社", 3], ["旧官国幣大社", 3], ["別表神社", 1]]);
  const rest = shakakuBasis(parseShakaku(wt), new Set(["一宮", "式内社"]));
  assert.deepEqual(rest.map((b) => b.key), ["名神大", "官国幣社", "別表神社"]);
  assert.deepEqual(shakakuBasis(["旧村社"]), []);
});
