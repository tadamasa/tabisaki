import assert from "node:assert/strict";
import { test } from "node:test";
import type { AreaPlaces, Place } from "@/lib/types";
import { DAY_END, driveMinutes, googleMapsRoute, insertKin, optimizeOrder, roleFor, schedule, suggestPlan } from "./itinerary";

const home: [number, number] = [135.5157, 34.7617];
const place = (id: string, kind: Place["kind"], lng: number, lat: number, score = 0): Place => ({
  id, kind, name: id, lat, lng, town: "吉野町", score, reasons: [], wikipedia: null, website: null,
});
const museum = place("資料館", "museum", 135.86, 34.39);
const main = place("本命", "shrine", 135.87, 34.37, 9);
const kinNear = place("近い社", "shrine", 135.88, 34.38, 1);
const kinSame = place("同系統の社", "shrine", 135.9, 34.36, 0);
const far = place("遠い社", "shrine", 137.5, 35.5, 5);
const areaPlaces: AreaPlaces = {
  areaId: "area-x",
  anchors: [
    { ...main, primer: { place: museum, km: 2.3 }, en: { lineage: { family: "丹生", honsha: "", isHonsha: false, honshaVisited: null, visitedCount: 0, recent: [], alsoHere: [] }, deities: [] } },
    { ...far, primer: null, en: null },
    { ...kinNear, primer: null, en: null },
    { ...kinSame, primer: null, en: { lineage: { family: "丹生", honsha: "", isHonsha: false, honshaVisited: null, visitedCount: 0, recent: [], alsoHere: [] }, deities: [] } },
  ],
  primers: [museum],
  halls: [museum],
  shrineCount: 4,
  source: "test",
};

test("移動時間は距離に応じて速くなる", () => {
  assert.equal(driveMinutes(home, home), 0);
  assert.ok(driveMinutes(home, [135.87, 34.37]) > 60);
});

test("予習は本命より前に置き、同じ系統の社を先に、日帰りで帰れる社だけを入れる", () => {
  const stops = suggestPlan(areaPlaces, home);
  const roleOf = (id: string) => stops.find((s) => s.place.id === id)?.role;
  assert.equal(roleOf("資料館"), "primer");
  assert.equal(roleOf("本命"), "anchor");
  assert.ok(stops.findIndex((s) => s.role === "primer") < stops.findIndex((s) => s.role === "anchor"));
  assert.ok(stops.filter((s) => !["資料館", "本命"].includes(s.place.id)).every((s) => s.role === "kin"));
  assert.ok(stops.some((s) => s.place.id === "同系統の社"));
  assert.ok(!stops.some((s) => s.place.id === "遠い社"));
  const plan = schedule(stops, home);
  assert.equal(plan.overMin, 0);
  assert.ok(plan.home <= DAY_END);
  assert.equal(plan.stops[0].arrive, plan.start + plan.stops[0].driveMin);
});

test("行きがけに近いゆかりの社は、本命や予習より前に入る", () => {
  const onTheWay = place("行きがけの社", "shrine", 135.7, 34.58);
  const stops = insertKin([{ place: museum, role: "primer" }, { place: main, role: "anchor" }], { place: onTheWay, role: "kin" }, home);
  assert.deepEqual(stops.map((s) => s.place.id), ["行きがけの社", "資料館", "本命"]);
});

test("博物館・美術館も本命にでき、そのときは予習先を付けず長めに滞在する", () => {
  const stops = suggestPlan(areaPlaces, home, "資料館");
  const anchor = stops.find((s) => s.role === "anchor");
  assert.equal(anchor?.place.id, "資料館");
  assert.ok(!stops.some((s) => s.role === "primer"));
  assert.equal(schedule(stops, home).stops.find((s) => s.role === "anchor")?.stayMin, 90);
});

test("足した場所の役目は、種類と本命から決める", () => {
  const shrinePlan = [{ place: main, role: "anchor" as const }];
  const hallPlan = [{ place: museum, role: "anchor" as const }];
  const art = place("美術館", "art", 135.86, 34.38);
  assert.equal(roleFor(kinNear, shrinePlan), "kin");
  assert.equal(roleFor(museum, shrinePlan), "primer");
  assert.equal(roleFor(art, shrinePlan), "extra");
  assert.equal(roleFor(place("別の資料館", "museum", 135.8, 34.4), hallPlan), "extra");
});

test("Google マップの経路は自宅発着で立ち寄りを順に並べる", () => {
  const url = new URL(googleMapsRoute([{ place: museum, role: "primer" }, { place: main, role: "anchor" }], home));
  assert.equal(url.searchParams.get("origin"), "34.76170,135.51570");
  assert.equal(url.searchParams.get("waypoints"), "34.39000,135.86000|34.37000,135.87000");
});

test("並べ直しは予習を本命より前に保ち、遠回りしない順にする", () => {
  // 自宅は北西。本命から南東へ一直線に並んだ社を、わざと逆順で渡す
  const line = [1, 2, 3, 4].map((k) => place(`社${k}`, "shrine", 135.87 + 0.03 * k, 34.37 - 0.03 * k));
  const messy = [
    { place: line[2], role: "kin" as const },
    { place: main, role: "anchor" as const },
    { place: line[0], role: "kin" as const },
    { place: museum, role: "primer" as const },
    { place: line[3], role: "kin" as const },
    { place: line[1], role: "kin" as const },
  ];
  const ordered = optimizeOrder(messy, home);
  const ids = ordered.map((s) => s.place.id);
  assert.ok(ids.indexOf("資料館") < ids.indexOf("本命"), ids.join(","));
  assert.ok(schedule(ordered, home).home < schedule(messy, home).home);
  // 一直線なので、社は端から順に回るはず
  const kinIds = ids.filter((id) => id.startsWith("社")).join(",");
  assert.ok(["社1,社2,社3,社4", "社4,社3,社2,社1"].includes(kinIds), kinIds);
  // もう最短なら、並べ直しても変わらない
  assert.deepEqual(optimizeOrder(ordered, home), ordered);
});
