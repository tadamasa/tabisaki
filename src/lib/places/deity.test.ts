import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDeity, parseDeities } from "./deity";

test("基礎情報の主祭神欄から神名を取り出す", () => {
  const wt = `{{神社
|名称 = 丹生都比売神社
|主祭神 = [[丹生都比売大神]]<br />[[高野御子大神]]<br />大食都比売大神<ref>公式サイト</ref>
|社格 = [[式内社]]（名神大）
}}`;
  assert.deepEqual(parseDeities(wt), ["丹生都比売大神", "高野御子大神", "大食都比売大神"]);
  assert.deepEqual(parseDeities("|祭神 = [[誉田別命|応神天皇]]、[[神功皇后]]"), ["応神天皇", "神功皇后"]);
  assert.deepEqual(parseDeities("|社格 = 村社"), []);
  // 空の欄で次の行を拾わない
  assert.deepEqual(parseDeities("|主祭神 =\n|社格 = 村社"), []);
});

test("別名と語尾の違いをそろえる", () => {
  assert.equal(normalizeDeity("丹生都比売大神"), "丹生都比売");
  assert.equal(normalizeDeity("大己貴命"), "大国主");
  assert.equal(normalizeDeity("須佐之男命"), "素戔嗚");
  assert.equal(normalizeDeity("応神天皇"), "誉田別");
  assert.equal(normalizeDeity("誉田別命"), "誉田別");
  assert.equal(normalizeDeity("天照大御神"), "天照");
});
