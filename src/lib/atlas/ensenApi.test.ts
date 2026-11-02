// gas/ensen-api.gs の doGet を、模擬のスプレッドシートの上で動かして確かめる。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(join(process.cwd(), "gas", "ensen-api.gs"), "utf8");
const EVENT_HEADER = ["event_id", "ts", "recorded_ts", "lat", "lng", "place_name", "actant_type", "actant_name", "actant_id", "verb", "note", "media_ref", "star", "source", "tags", "enrich"];
const FIX_HEADER = ["fix_id", "ts", "actant_id", "event_id", "lat", "lng", "status", "source"];

type Cell = string | number | Date;
type ApiEvent = { event_id: string; lat: string; lng: string; actant_id: string };

function sheet(values: Cell[][]) {
  return {
    getDataRange: () => ({
      getValues: () => values,
      getDisplayValues: () => values.map((row) => row.map((v) => String(v))),
    }),
    getLastRow: () => values.length,
  };
}

function event(id: string, aid: string, lat: number, lng: number, type = "場所"): Cell[] {
  return [id, "2026-10-01T10:00:00+09:00", "", lat, lng, "", type, `名前${id}`, aid, "", "", "", "", "swarm", "", ""];
}

function fix(ts: Cell, aid: string, status: string, lat: Cell = "", lng: Cell = ""): Cell[] {
  return [`f-${aid}-${String(ts)}`, ts, aid, "", lat, lng, status, "app"];
}

function doGet(sheets: Record<string, Cell[][]>): ApiEvent[] {
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => ({ TOKEN: "t", SHEET_ID: "s" })[k] ?? null }) },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (name: string) => (sheets[name] ? sheet(sheets[name]) : null) }),
    },
    Utilities: {
      // Asia/Tokyo（+09:00）だけを扱う簡易版
      formatDate: (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 19) + "+09:00",
    },
    ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: "json" } },
  };
  vm.createContext(context);
  vm.runInContext(`${SOURCE}\nthis.__doGet = doGet;`, context);
  // 日付は Apps Script 側の Date にしておく（instanceof Date が効くように）
  const InnerDate = vm.runInContext("Date", context) as DateConstructor;
  for (const values of Object.values(sheets)) {
    for (const row of values) row.forEach((v, i) => v instanceof Date && (row[i] = new InnerDate(v.getTime())));
  }
  const out = (context as unknown as { __doGet: (e: unknown) => string }).__doGet({ parameter: { token: "t" } });
  return JSON.parse(out).events;
}

const EVENTS = [
  EVENT_HEADER,
  event("e1", "a1", 34.1, 135.1),
  event("e2", "a1", 34.1, 135.1),
  event("e3", "a2", 34.2, 135.2),
  event("e4", "a3", 34.3, 135.3),
  event("e5", "", 34.4, 135.4),
  event("e6", "b1", 34.5, 135.5, "作品"),
];

test("spot_fixes がなければ events のまま返す", () => {
  const events = doGet({ events: EVENTS });
  assert.deepEqual(events.map((e) => e.event_id), ["e1", "e2", "e3", "e4", "e5"]);
  assert.equal(events[0].lat, "34.1");
  assert.equal(events[0].actant_id, "a1");
});

test("move は同じ actant の記録をすべて新しい位置にし、hide は返さない", () => {
  const events = doGet({
    events: EVENTS,
    spot_fixes: [FIX_HEADER, fix("2026-11-03T09:00:00+09:00", "a1", "move", 35.5, 136.5), fix("2026-11-03T09:00:00+09:00", "a2", "hide")],
  });
  assert.deepEqual(events.map((e) => e.event_id), ["e1", "e2", "e4", "e5"]);
  assert.deepEqual(events.slice(0, 2).map((e) => [e.lat, e.lng]), [["35.5", "136.5"], ["35.5", "136.5"]]);
  assert.deepEqual([events[2].lat, events[2].lng], ["34.3", "135.3"]);
});

test("同じ actant では ts がいちばん新しい1行だけが効く（行の順ではない）", () => {
  const events = doGet({
    events: EVENTS,
    spot_fixes: [
      FIX_HEADER,
      fix("2026-11-05T09:00:00+09:00", "a1", "move", 36, 137), // 新しい
      fix("2026-11-04T09:00:00+09:00", "a1", "move", 35, 136),
      fix("2026-11-04T09:00:00+09:00", "a2", "hide"),
      fix("2026-11-05T09:00:00+09:00", "a2", "ok"), // hide を取り消して元の座標
      fix("2026-11-04T09:00:00+09:00", "a3", "move", 35, 136),
      fix("2026-11-05T09:00:00+09:00", "a3", "undo"), // move を取り消して元の座標
    ],
  });
  const byId = Object.fromEntries(events.map((e) => [e.event_id, [e.lat, e.lng]]));
  assert.deepEqual(byId.e1, ["36", "137"]);
  assert.deepEqual(byId.e3, ["34.2", "135.2"]);
  assert.deepEqual(byId.e4, ["34.3", "135.3"]);
});

test("日付型の ts も文字列の ts と並べて比べられ、位置のない move と知らない status は無視する", () => {
  const events = doGet({
    events: EVENTS,
    spot_fixes: [
      FIX_HEADER,
      fix("2026-11-04T09:00:00+09:00", "a1", "move", 35, 136),
      fix(new Date("2026-11-04T10:00:00+09:00"), "a1", "move", 36, 137), // 日付型でより新しい
      fix(new Date("2026-11-04T08:00:00+09:00"), "a1", "hide"), // 日付型でより古い
      fix("2026-11-04T09:00:00+09:00", "a2", "move"), // 位置なし
      fix("2026-11-06T09:00:00+09:00", "a3", "moved", 1, 1), // 知らない status
    ],
  });
  const byId = Object.fromEntries(events.map((e) => [e.event_id, [e.lat, e.lng]]));
  assert.deepEqual(byId.e1, ["36", "137"]);
  assert.deepEqual(byId.e3, ["34.2", "135.2"]);
  assert.deepEqual(byId.e4, ["34.3", "135.3"]);
});

test("events に actant_id 列がない古いシートでも動く", () => {
  const header = EVENT_HEADER.filter((c) => c !== "actant_id");
  const rows = EVENTS.slice(1).map((r) => r.filter((_, i) => i !== 8));
  const events = doGet({ events: [header, ...rows], spot_fixes: [FIX_HEADER, fix("2026-11-03T09:00:00+09:00", "a1", "hide")] });
  assert.equal(events.length, 5);
});
