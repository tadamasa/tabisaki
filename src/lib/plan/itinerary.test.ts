import assert from "node:assert/strict";
import { test } from "node:test";
import type { AreaPlaces, Place } from "@/lib/types";
import { DAY_END, INN_BY, blocksOf, legKey, driveMinutes, googleMapsLeg, googleMapsRoutes, nearPicks, nearPlan, travel, insertKin, optimizeOrder, roleFor, schedule, suggestPlan } from "./itinerary";

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
  castles: [],
  lodgings: [],
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
  const url = new URL(googleMapsRoutes([{ place: museum, role: "primer" }, { place: main, role: "anchor" }], home)[0].url);
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

test("つないだ2か所は、並べ直しても続けてこの順に回る", () => {
  const line = [1, 2, 3].map((k) => place(`社${k}`, "shrine", 135.87 + 0.03 * k, 34.37 - 0.03 * k));
  const stops = [
    { place: museum, role: "primer" as const },
    { place: main, role: "anchor" as const },
    // 遠い社3のすぐあとに社1へ戻る、とつなぐ
    { place: line[2], role: "kin" as const, linkNext: true },
    { place: line[0], role: "kin" as const },
    { place: line[1], role: "kin" as const },
  ];
  const ids = (o: { place: Place }[]) => o.map((s) => s.place.id);
  const ordered = optimizeOrder(stops, home);
  const at3 = ids(ordered).indexOf("社3");
  assert.equal(ids(ordered)[at3 + 1], "社1");
  assert.ok(ordered[at3].linkNext);
  // つながなければ社3のすぐあとに社1は来ない
  const free = ids(optimizeOrder(stops.map((s) => ({ ...s, linkNext: false })), home));
  assert.notEqual(free[free.indexOf("社3") + 1], "社1");
  // 足したときもつながりは残る
  const added = ids(optimizeOrder([...ordered, { place: kinNear, role: "kin" }], home));
  assert.equal(added[added.indexOf("社3") + 1], "社1");
});

test("かたまりの最後はどこにもつながない", () => {
  const blocks = blocksOf([
    { place: museum, role: "primer", linkNext: true },
    { place: main, role: "anchor", linkNext: true },
  ]);
  assert.equal(blocks.length, 1);
  assert.ok(!blocks[0][1].linkNext);
});

test("「A は B より前」は、あいだに別の地点が入っても守る", () => {
  const line = [1, 2, 3].map((k) => place(`社${k}`, "shrine", 135.87 + 0.03 * k, 34.37 - 0.03 * k));
  const stops = [
    { place: museum, role: "primer" as const },
    { place: main, role: "anchor" as const },
    { place: line[0], role: "kin" as const },
    { place: line[1], role: "kin" as const },
    // いちばん遠い社3を、社1より前に回る
    { place: line[2], role: "kin" as const, before: ["社1"] },
  ];
  const ids = optimizeOrder(stops, home).map((s) => s.place.id);
  assert.ok(ids.indexOf("社3") < ids.indexOf("社1"), ids.join(","));
  assert.ok(ids.indexOf("資料館") < ids.indexOf("本命"), ids.join(","));
  // 条件がなければ社1が先に来る
  const free = optimizeOrder(stops.map((s) => ({ ...s, before: [] })), home).map((s) => s.place.id);
  assert.ok(free.indexOf("社1") < free.indexOf("社3"), free.join(","));
});

const inn = place("宿", "lodging", 135.87, 34.36);

test("宿に泊まると、宿で1日目が終わり、翌朝の出発時刻から2日目を数える", () => {
  const stops = [
    { place: museum, role: "primer" as const },
    { place: inn, role: "stay" as const },
    { place: main, role: "anchor" as const },
  ];
  const plan = schedule(stops, home, 8 * 60, 9 * 60);
  assert.equal(plan.days, 2);
  assert.deepEqual(plan.stops.map((s) => s.day), [1, 1, 2]);
  assert.equal(plan.stops[1].depart, 9 * 60);
  assert.equal(plan.stops[2].arrive, 9 * 60 + plan.stops[2].driveMin);
  assert.equal(roleFor(inn, stops), "stay");
});

test("宿に遅れる分も遅れとして数える", () => {
  const plan = schedule([{ place: inn, role: "stay" }], home, 17 * 60 + 50);
  assert.ok(plan.lateMin > 0);
  assert.equal(plan.lateMin, plan.stops[0].arrive - INN_BY);
  assert.ok(plan.overMin >= plan.lateMin);
});

test("昼から出て1日で回りきれない行程は、宿をはさんで2日に分ける", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ place: place(`社${i}`, "shrine" as const, 135.85 + i * 0.01, 34.37), role: "kin" as const }));
  const stops = [{ place: inn, role: "stay" as const }, ...many];
  const best = optimizeOrder(stops, home, 14 * 60, 9 * 60);
  const plan = schedule(best, home, 14 * 60, 9 * 60);
  assert.equal(plan.overMin, 0);
  assert.ok(plan.stops.some((s) => s.day === 1 && s.role === "kin"));
  assert.ok(plan.stops.some((s) => s.day === 2));
});

test("宿があると Google マップの経路は日ごとに分かれる", () => {
  const routes = googleMapsRoutes([{ place: museum, role: "primer" }, { place: inn, role: "stay" }, { place: main, role: "anchor" }], home);
  assert.equal(routes.length, 2);
  const [d1, d2] = routes.map((r) => new URL(r.url).searchParams);
  assert.equal(d1.get("destination"), "34.36000,135.87000");
  assert.equal(d2.get("origin"), "34.36000,135.87000");
  assert.equal(d2.get("destination"), "34.76170,135.51570");
  assert.equal(d2.get("waypoints"), "34.37000,135.87000");
});

test("回る場所が少なければ、宿に昼過ぎに着くより1日目に多く回る", () => {
  const few = Array.from({ length: 4 }, (_, i) => ({ place: place(`社${i}`, "shrine" as const, 135.85 + i * 0.01, 34.37), role: "kin" as const }));
  const plan = schedule(optimizeOrder([...few, { place: inn, role: "stay" }], home, 8 * 60, 9 * 60), home, 8 * 60, 9 * 60);
  const atInn = plan.stops.findIndex((s) => s.role === "stay");
  const naive = schedule([few[0], { place: inn, role: "stay" }, ...few.slice(1)], home, 8 * 60, 9 * 60);
  assert.ok(plan.earlyMin < naive.earlyMin);
  assert.ok(atInn >= 1);
});

test("移動手段で時間が変わり、電車では近い地点のあいだを歩く", () => {
  const a: [number, number] = [135.5, 34.7];
  const near: [number, number] = [135.505, 34.7];
  const far: [number, number] = [135.9, 34.4];
  assert.ok(travel(a, far, "walk").min > travel(a, far, "bike").min);
  assert.ok(travel(a, far, "bike").min > travel(a, far, "car").min);
  assert.equal(travel(a, near, "train").by, "walk");
  assert.equal(travel(a, far, "train").by, "train");
  const nextDoor = place("隣の社", "shrine", 135.875, 34.372);
  const plan = schedule([{ place: main, role: "anchor" }, { place: nextDoor, role: "kin" }], home, 8 * 60, 9 * 60, "train");
  assert.equal(plan.stops[0].by, "train");
  assert.equal(plan.stops[1].by, "walk");
});

test("歩きでは遠いゆかりの社を入れず、Googleマップも歩きの経路で開く", () => {
  const here: [number, number] = [135.865, 34.385];
  const stops = suggestPlan(areaPlaces, here, undefined, 8 * 60, "walk");
  assert.equal(schedule(stops, here, 8 * 60, 9 * 60, "walk").overMin, 0);
  const url = new URL(googleMapsRoutes(stops, here, "walk")[0].url);
  assert.equal(url.searchParams.get("travelmode"), "walking");
  assert.equal(new URL(googleMapsLeg(here, [135.9, 34.4], "train")).searchParams.get("travelmode"), "transit");
});

test("まわりのおすすめは近い順に並べ、いちばん近いものを本命に、帰りが遅れない分だけ行程に入れる", () => {
  const here: [number, number] = [135.865, 34.385];
  const picks = nearPicks(areaPlaces, here);
  assert.ok(picks.every((p, i) => i === 0 || picks[i - 1].km <= p.km));
  assert.ok(!picks.some((p) => p.place.id === "同系統の社"), "手がかりのない社は、手がかりのある社があれば出さない");
  const stops = nearPlan(areaPlaces, here, 9 * 60, "walk");
  assert.equal(stops.find((s) => s.role === "anchor")?.place.id, picks[0].place.id);
  assert.equal(schedule(stops, here, 9 * 60, 9 * 60, "walk").overMin, 0);
  assert.ok(!stops.some((s) => s.place.id === "遠い社"));
});

test("電車＋レンタカー: 借りる所まで電車、あとは車で回り、同じ所へ返して電車で帰る", () => {
  const rental = place("駅前レンタカー", "rental", 135.8, 34.4);
  assert.equal(roleFor(rental, []), "rent");
  // 借りる所が後ろにあっても、先頭に回る
  const p = schedule([{ place: main, role: "anchor" }, { place: rental, role: "rent" }], home, 8 * 60, undefined, "rent");
  assert.deepEqual(p.stops.map((s) => [s.place.id, s.by]), [["駅前レンタカー", "train"], ["本命", "car"]]);
  assert.equal(p.dropOff?.place.id, "駅前レンタカー");
  assert.equal(p.returnBy, "train");
  assert.equal(p.home, p.dropOff!.depart + p.returnMin);
  // 並べ直しても借りる所は先頭のまま
  const o = optimizeOrder([{ place: main, role: "anchor" }, { place: museum, role: "primer" }, { place: rental, role: "rent" }], home, 8 * 60, undefined, "rent");
  assert.deepEqual(o.map((s) => s.place.id), ["駅前レンタカー", "資料館", "本命"]);
  // 借りる所が決まっていなければ電車として数え、車のときは借りる所を数えない
  assert.equal(schedule([{ place: main, role: "anchor" }], home, 8 * 60, undefined, "rent").stops[0].by, "train");
  assert.equal(schedule([{ place: rental, role: "rent" }, { place: main, role: "anchor" }], home, 8 * 60, undefined, "car").stops.length, 1);
});

test("駐車場からつないだ地点は歩いて回り、つながりが切れたら車に戻る", () => {
  const lot = place("駐車場", "parking", 135.865, 34.375);
  const p = schedule(
    [
      { place: lot, role: "park", linkNext: true },
      { place: main, role: "anchor", linkNext: true },
      { place: kinNear, role: "kin" },
      { place: kinSame, role: "kin" },
    ],
    home,
  );
  assert.deepEqual(p.stops.map((s) => s.by), ["car", "walk", "walk", "car"]);
  // 歩いて車に戻る分は、次の区間に足す
  const back = travel([kinNear.lng, kinNear.lat], [lot.lng, lot.lat], "walk").min;
  assert.equal(p.stops[3].backMin, back);
  assert.deepEqual(p.stops[3].from, [lot.lng, lot.lat]);
  // 最後まで歩いて回ったら、帰りの前に車に戻る
  const q = schedule([{ place: lot, role: "park", linkNext: true }, { place: main, role: "anchor" }], home);
  assert.equal(q.returnBackMin, travel([main.lng, main.lat], [lot.lng, lot.lat], "walk").min);
  // Google マップの車の経路には、歩いて回る地点を入れない
  const url = new URL(googleMapsRoutes([{ place: lot, role: "park", linkNext: true }, { place: main, role: "anchor" }, { place: kinSame, role: "kin" }], home)[0].url);
  assert.equal(url.searchParams.get("waypoints")!.split("|").length, 2);
});

test("実際の道で測った分があれば、目安の代わりに使う", () => {
  const from: [number, number] = [main.lng, main.lat];
  const to: [number, number] = [kinNear.lng, kinNear.lat];
  const legs = new Map([[legKey("car", from, to), 42]]);
  assert.equal(travel(from, to, "car", legs).min, 42);
  assert.notEqual(travel(from, to, "car").min, 42);
  // 電車は実際の道を使わない
  assert.equal(travel(from, to, "train", new Map([[legKey("train", from, to), 1]])).min, travel(from, to, "train").min);
});
