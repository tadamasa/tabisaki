import assert from "node:assert/strict";
import { test } from "node:test";
import { type Period, dayHours, hoursText, visitWarning } from "./hours";

// 月曜休館、9:30–17:00 の博物館
const museum: Period[] = [0, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 9, minute: 30 }, close: { day, hour: 17, minute: 0 } }));

test("曜日ごとの営業時間と休みを読む", () => {
  assert.equal(hoursText(dayHours(museum, 1)), "休み");
  assert.equal(hoursText(dayHours(museum, 3)), "9:30–17:00");
  assert.equal(hoursText(dayHours(undefined, 3)), "営業時間の登録なし");
  assert.equal(hoursText(dayHours([{ open: { day: 0, hour: 0, minute: 0 } }], 4)), "24時間");
});

test("日をまたぐ営業は閉まる時刻に24時間を足す", () => {
  const bar: Period[] = [{ open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }];
  assert.deepEqual(dayHours(bar, 5), { kind: "open", ranges: [{ start: 18 * 60, end: 26 * 60 }] });
  assert.equal(hoursText(dayHours(bar, 5)), "18:00–26:00");
  // 翌日（土曜）の 1時は、金曜の夜からの続きで開いている
  assert.deepEqual(dayHours(bar, 6), { kind: "open", ranges: [{ start: 0, end: 2 * 60 }] });
  assert.equal(visitWarning(dayHours(bar, 6), 60, 90), null);
});

test("行程の時刻が営業時間に収まらないと知らせる", () => {
  const wed = dayHours(museum, 3);
  assert.equal(visitWarning(wed, 10 * 60, 11 * 60), null);
  assert.equal(visitWarning(wed, 9 * 60, 10 * 60), "9:30に開きます");
  assert.equal(visitWarning(wed, 16 * 60 + 30, 17 * 60 + 30), "17:00に閉まります");
  assert.equal(visitWarning(wed, 17 * 60 + 30, 18 * 60), "17:00に閉まっています");
  assert.equal(visitWarning(dayHours(museum, 1), 10 * 60, 11 * 60), "この日は休みです");
  assert.equal(visitWarning(dayHours(undefined, 1), 10 * 60, 11 * 60), null);
});
