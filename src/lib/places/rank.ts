// 空白地帯の中で、本命になる社と、先に寄る資料館・案内所、目的地にもなる博物館・美術館の候補を選ぶ。
import * as turf from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import type { Place } from "@/lib/types";

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// outside: 空白地帯の外にある、隣の行ったことのある町。visited: 行ったことのある町（記録のある場所を除く）
export type Town = { id: string; name: string; geometry: Polygon | MultiPolygon; outside?: boolean; visited?: boolean };

// 行ったことのある町で、すでに記録のある場所かどうか
export type VisitedHere = (townId: string, name: string, lat: number, lng: number) => boolean;

// 名前や社格から読み取れる「由緒の深さ」の手がかり
const SHRINE_RANK: [RegExp, number, string][] = [
  [/一宮|一之宮|一の宮/, 4, "一宮"],
  [/大社$/, 3, "大社"],
  [/神宮$/, 3, "神宮"],
  [/総社|惣社/, 2, "総社"],
  [/八幡宮$|天満宮$/, 1, ""],
];

function wikipediaUrl(tag: string | undefined) {
  if (!tag) return null;
  const [lang, ...rest] = tag.split(":");
  const title = rest.join(":");
  if (!title) return null;
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

// 公立の館は展示の規模や常設の解説が期待できる
const HALL_RANK: [RegExp, number, string][] = [
  [/^国立|国立.*(博物館|美術館)/, 3, "国立"],
  [/^(県立|府立|都立|道立)|[都道府県]立/, 2, "公立"],
];

function kindOf(tags: Record<string, string>): Place["kind"] | null {
  if (tags.amenity === "place_of_worship" && tags.religion === "shinto") return "shrine";
  if (tags.tourism === "gallery" || (tags.tourism === "museum" && (tags.museum === "art" || /美術館/.test(tags.name ?? "")))) return "art";
  if (tags.tourism === "museum") return "museum";
  if (tags.historic === "castle") return "castle";
  if (tags.tourism === "information" && (tags.information === "office" || tags.information === "visitor_centre")) return "info";
  if (/^(hotel|guest_house|hostel|motel)$/.test(tags.tourism ?? "")) return "lodging";
  return null;
}

export function rankPlaces(elements: OsmElement[], towns: Town[], visitedHere: VisitedHere = () => false) {
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags["name:ja"] ?? tags.name;
    const kind = kindOf(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || !kind || lat == null || lng == null) continue;

    const pt = turf.point([lng, lat]);
    const town = towns.find((t) => turf.booleanPointInPolygon(pt, t.geometry));
    if (!town) continue;
    // 宿は泊まったことがあっても候補にしてよい
    if ((town.outside || town.visited) && kind !== "lodging" && visitedHere(town.id, name, lat, lng)) continue;
    const key = `${kind}:${name}:${town.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const reasons: string[] = [];
    let score = 0;
    if (kind === "shrine") {
      for (const [re, pts, label] of SHRINE_RANK) {
        if (re.test(name)) {
          score += pts;
          if (label) reasons.push(label);
          break;
        }
      }
      if (/式内/.test(tags.description ?? "") || tags["shrine:shikinai"]) {
        score += 3;
        reasons.push("式内社");
      }
    } else if (kind === "museum" || kind === "art") {
      for (const [re, pts, label] of HALL_RANK) {
        if (re.test(name)) {
          score += pts;
          reasons.push(label);
          break;
        }
      }
      if (/博物館|美術館|ミュージアム/.test(name)) score += 1;
    } else if (kind === "castle") {
      // 天守や石垣が残る城は史跡指定や記事があることが多い
      if (tags.ruins !== "yes" && tags.castle_type !== "earthwork") score += 1;
      if (/城跡|城址/.test(name) || tags.ruins === "yes") reasons.push("城跡");
    } else if (kind === "lodging") {
      if (/旅館|温泉|湯|荘|亭/.test(name) || tags.tourism === "guest_house") {
        score += 2;
        reasons.push("旅館・温泉宿");
      }
    }
    if (tags.wikipedia) {
      score += 3;
      reasons.push("Wikipediaに記事あり");
    } else if (tags.wikidata) {
      score += 1;
    }
    if (tags.heritage) {
      score += 1;
      reasons.push("文化財");
    }

    if (town.outside) reasons.push("行ったことのある町");
    places.push({
      id: `${el.type}/${el.id}`,
      kind,
      name,
      lat,
      lng,
      town: town.name,
      score,
      reasons,
      wikipedia: wikipediaUrl(tags.wikipedia),
      website: tags.website ?? tags["contact:website"] ?? null,
      ...(town.outside ? { outside: true } : {}),
    });
  }

  const byScore = (a: Place, b: Place) => b.score - a.score || a.name.localeCompare(b.name, "ja");
  // 地帯の中の場所を先に n 件、隣の行ったことのある町の場所を後ろに m 件
  const pick = (kinds: Place["kind"][], n: number, m: number) => {
    const list = places.filter((p) => kinds.includes(p.kind)).sort(byScore);
    return list.filter((p) => !p.outside).slice(0, n).concat(list.filter((p) => p.outside && p.score > 0).slice(0, m));
  };
  const shrines = places.filter((p) => p.kind === "shrine" && !p.outside).sort(byScore);
  return {
    // 由緒の手がかりがある社を優先し、なければ名前のある社を少しだけ出す。隣の町は手がかりのある社だけ
    anchors: shrines
      .filter((s) => s.score > 0)
      .slice(0, 12)
      .concat(shrines.filter((s) => s.score === 0).slice(0, 3))
      .concat(pick(["shrine"], 0, 5)),
    // 予習先は資料館・博物館と案内所。美術館は目的地として別に出す
    primers: places.filter((p) => p.kind === "museum" || p.kind === "info").sort(byScore).slice(0, 24),
    halls: pick(["museum", "art"], 12, 5),
    castles: pick(["castle"], 10, 4),
    lodgings: places.filter((p) => p.kind === "lodging").sort((a, b) => Number(!!a.outside) - Number(!!b.outside) || byScore(a, b)).slice(0, 15),
    shrineCount: shrines.length,
  };
}

// 本命の社ごとに、いちばん近い資料館・案内所を「先に寄る場所」として組む
export function pairPrimer(anchor: Place, primers: Place[]) {
  let best: { place: Place; km: number } | null = null;
  for (const p of primers) {
    const km = turf.distance([anchor.lng, anchor.lat], [p.lng, p.lat]);
    if (!best || km < best.km) best = { place: p, km };
  }
  return best && best.km <= 25 ? { ...best, km: Math.round(best.km * 10) / 10 } : null;
}
