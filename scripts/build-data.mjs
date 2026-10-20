// 縁泉のエクスポート（xlsx）と市区町村境界から、地図用の静的データを作る。
//
//   node scripts/build-data.mjs --ensen path/to/ensen.xlsx [--home 34.7617,135.5157]
//
// 出力（public/data/、個人の訪問履歴を含むので git には入れない）:
//   municipalities.geojson  表示用の市町村ポリゴン（訪問状況つき）
//   spots.json              訪問したスポット
//   blank-areas.json        未訪問の町がまとまっている「空白地帯」
//   summary.json            集計値
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import * as turf from "@turf/turf";

const BOUNDARY_BASE =
  "https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson";
const BOUNDARY_FILE = "N03-21_210101_designated_city.json";
const RAW_DIR = "data/raw";
const OUT_DIR = "public/data";

// 空白地帯: 中心の町から半径 AREA_RADIUS_KM 以内でつながっている未訪問の町の集まり
const AREA_RADIUS_KM = 20;
const AREA_MIN_TOWNS = 3;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  return args;
}

async function loadBoundary(level) {
  const file = path.join(RAW_DIR, `${level}_${BOUNDARY_FILE}`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    const res = await fetch(`${BOUNDARY_BASE}/${level}/${BOUNDARY_FILE}`);
    if (!res.ok) throw new Error(`boundary download failed: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function unitOf(props) {
  const pref = props.N03_001;
  const name = pref + (props.N03_003 ?? "") + (props.N03_004 ?? "");
  const short = (props.N03_003 ?? "").endsWith("郡") || !props.N03_003
    ? props.N03_004 ?? props.N03_003
    : props.N03_003;
  return { id: props.N03_007, name, short, pref };
}

async function readSheet(file, sheetName) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(sheetName);
  const header = ws.getRow(1).values.slice(1);
  const rows = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const values = row.values.slice(1);
    rows.push(Object.fromEntries(header.map((h, j) => [h, values[j] ?? null])));
  });
  return rows;
}

const CATEGORIES = [
  ["shrine", /神社|大社|神宮|八幡宮|天満宮|稲荷|宮$/],
  ["temple", /寺$|寺 |院$|堂$|観音|不動/],
  ["museum", /博物館|資料館|歴史館|記念館|ミュージアム|郷土館|文化館|展示室|美術館|案内所|ビジターセンター/],
  ["history", /城|跡|古墳|陵/],
  ["nature", /公園|山|滝|峠|岬|湖|渓|浜|海岸|島/],
];
const categoryOf = (name) => CATEGORIES.find(([, re]) => re.test(name))?.[0] ?? "other";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ensen) throw new Error("--ensen <xlsx> is required");
  const [homeLat, homeLng] = (args.home ?? "34.7617,135.5157").split(",").map(Number);
  const home = turf.point([homeLng, homeLat]);

  // 判定は精度の高い 1% 簡素化、表示は軽い 0.1% 簡素化を使う
  const detailed = await loadBoundary("s0010");
  const display = await loadBoundary("s0001");

  const units = new Map();
  for (const f of detailed.features) {
    const u = unitOf(f.properties);
    if (!u.short) continue;
    const entry = units.get(u.id) ?? { ...u, polys: [] };
    entry.polys.push(f);
    units.set(u.id, entry);
  }
  for (const u of units.values()) {
    u.bbox = turf.bbox(turf.featureCollection(u.polys));
    u.center = turf.pointOnFeature(turf.featureCollection(u.polys)).geometry.coordinates;
    u.km = Math.round(turf.distance(home, turf.point(u.center)));
    u.visits = 0;
  }
  const unitList = [...units.values()];

  const findUnit = (lng, lat) => {
    const pt = turf.point([lng, lat]);
    for (const u of unitList) {
      const [x0, y0, x1, y1] = u.bbox;
      if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
      if (u.polys.some((p) => turf.booleanPointInPolygon(pt, p))) return u;
    }
    return null;
  };

  const events = await readSheet(args.ensen, "events");
  const spots = [];
  let unmatched = 0;
  for (const e of events) {
    if (e.actant_type !== "場所" || e.lat == null || e.lng == null) continue;
    const name = String(e.actant_name ?? "");
    if (/テスト|ZZTEST/.test(name)) continue;
    const u = findUnit(Number(e.lng), Number(e.lat));
    if (!u) unmatched++;
    const ts = String(e.ts);
    if (u) {
      u.visits++;
      if (!u.first || ts < u.first) u.first = ts;
      if (!u.last || ts > u.last) u.last = ts;
    }
    spots.push({
      name,
      lat: Number(e.lat),
      lng: Number(e.lng),
      ts,
      cat: categoryOf(name),
      muni: u?.id ?? null,
      note: e.note ?? null,
    });
  }

  // 空白地帯: 近くの未訪問の町が多い町から順に中心を選び、重ならないようにまとめる
  const unvisited = unitList.filter((u) => u.visits === 0);
  const touches = (a, b) => {
    const [ax0, ay0, ax1, ay1] = a.bbox;
    const [bx0, by0, bx1, by1] = b.bbox;
    if (ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) return false;
    return a.polys.some((p) => b.polys.some((q) => turf.booleanIntersects(p, q)));
  };
  const neighbors = new Map(unvisited.map((u) => [u.id, []]));
  for (let i = 0; i < unvisited.length; i++) {
    for (let j = i + 1; j < unvisited.length; j++) {
      const a = unvisited[i];
      const b = unvisited[j];
      if (turf.distance(a.center, b.center) > 2 * AREA_RADIUS_KM) continue;
      if (touches(a, b)) {
        neighbors.get(a.id).push(b);
        neighbors.get(b.id).push(a);
      }
    }
  }
  const used = new Set();
  const grow = (seed) => {
    const members = [seed];
    const seen = new Set([seed.id]);
    for (let k = 0; k < members.length; k++) {
      for (const n of neighbors.get(members[k].id)) {
        if (seen.has(n.id) || used.has(n.id)) continue;
        if (turf.distance(seed.center, n.center) > AREA_RADIUS_KM) continue;
        seen.add(n.id);
        members.push(n);
      }
    }
    return members;
  };
  const areas = [];
  while (true) {
    let best = null;
    for (const u of unvisited) {
      if (used.has(u.id)) continue;
      const members = grow(u);
      if (!best || members.length > best.length || (members.length === best.length && u.km < best[0].km)) {
        best = members;
      }
    }
    if (!best || best.length < AREA_MIN_TOWNS) break;
    best.forEach((m) => used.add(m.id));
    const seed = best[0];
    areas.push({
      id: `area-${seed.id}`,
      label: `${seed.short}周辺`,
      pref: [...new Set(best.map((m) => m.pref))],
      km: Math.round(Math.min(...best.map((m) => m.km))),
      center: seed.center,
      bbox: turf.bbox(turf.featureCollection(best.flatMap((m) => m.polys))),
      towns: best.map((m) => ({ id: m.id, name: m.short, pref: m.pref, km: m.km })),
    });
  }
  areas.sort((a, b) => b.towns.length / (1 + b.km / 100) - a.towns.length / (1 + a.km / 100));
  const areaOf = new Map(areas.flatMap((a) => a.towns.map((t) => [t.id, a.id])));

  const features = display.features
    .map((f) => {
      const u = units.get(f.properties.N03_007);
      if (!u) return null;
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          id: u.id,
          name: u.name,
          short: u.short,
          pref: u.pref,
          visits: u.visits,
          visited: u.visits > 0,
          first: u.first ?? null,
          last: u.last ?? null,
          km: u.km,
          area: areaOf.get(u.id) ?? null,
        },
      };
    })
    .filter(Boolean);

  const prefs = {};
  for (const u of unitList) {
    prefs[u.pref] ??= { pref: u.pref, visited: 0, total: 0, km: 0 };
    prefs[u.pref].total++;
    prefs[u.pref].km += u.km;
    if (u.visits > 0) prefs[u.pref].visited++;
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    home: [homeLng, homeLat],
    municipalities: unitList.length,
    visited: unitList.length - unvisited.length,
    spots: spots.length,
    unmatched,
    unvisitedByBand: [100, 200, 300].map((km) => ({
      km,
      count: unvisited.filter((u) => u.km < km).length,
    })),
    prefectures: Object.values(prefs)
      .map((p) => ({ ...p, km: Math.round(p.km / p.total) }))
      .sort((a, b) => a.km - b.km),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "municipalities.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
  fs.writeFileSync(path.join(OUT_DIR, "spots.json"), JSON.stringify(spots));
  fs.writeFileSync(path.join(OUT_DIR, "blank-areas.json"), JSON.stringify(areas));
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary));
  console.log(
    `municipalities ${summary.visited}/${summary.municipalities} visited, spots ${spots.length} (unmatched ${unmatched}), blank areas ${areas.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
