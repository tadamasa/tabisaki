// 社どうしの「縁」を、同じ系統（同じ神を勧請した社の広がり）と、これまでの参拝記録から読み取る。
// 系統は社名から推定するので、名前に系統が表れない社には付かない。
import type { DeityKin, En, Lineage, Place, Spot } from "@/lib/types";
import { normalizeDeity } from "./deity";

type Family = { name: string; match: RegExp; honsha: string[] };

// honsha は系統の総本社・本源とされる社
const FAMILIES: Family[] = [
  { name: "八幡", match: /八幡/, honsha: ["宇佐神宮"] },
  { name: "稲荷", match: /稲荷|稻荷/, honsha: ["伏見稲荷大社"] },
  { name: "天神", match: /天満|天神|菅原|北野/, honsha: ["北野天満宮", "太宰府天満宮"] },
  { name: "神明（伊勢）", match: /神明|皇大神|大神宮/, honsha: ["皇大神宮", "伊勢神宮"] },
  { name: "祇園", match: /八坂|祇園|素盞|素戔|須佐/, honsha: ["八坂神社"] },
  { name: "えびす", match: /恵比|恵美須|戎|蛭子/, honsha: ["西宮神社"] },
  { name: "賀茂", match: /賀茂|加茂|鴨/, honsha: ["賀茂別雷神社", "賀茂御祖神社", "上賀茂神社", "下鴨神社"] },
  { name: "日吉", match: /日吉|日枝|山王/, honsha: ["日吉大社"] },
  { name: "諏訪", match: /諏訪|諏方/, honsha: ["諏訪大社"] },
  { name: "住吉", match: /住吉/, honsha: ["住吉大社"] },
  { name: "春日", match: /春日/, honsha: ["春日大社"] },
  { name: "熊野", match: /熊野/, honsha: ["熊野本宮大社", "熊野速玉大社", "熊野那智大社"] },
  { name: "浅間", match: /浅間/, honsha: ["富士山本宮浅間大社"] },
  { name: "金毘羅", match: /金刀比羅|琴平|金比羅|金毘羅/, honsha: ["金刀比羅宮"] },
  { name: "宗像・厳島", match: /宗像|厳島|嚴島|市杵島/, honsha: ["宗像大社", "厳島神社"] },
  { name: "吉備津", match: /吉備津/, honsha: ["吉備津神社", "吉備津彦神社"] },
  { name: "三島（大山祇）", match: /大山祇|三島|三嶋/, honsha: ["大山祇神社"] },
  { name: "香取", match: /香取/, honsha: ["香取神宮"] },
  { name: "鹿島", match: /鹿島/, honsha: ["鹿島神宮"] },
  { name: "白山", match: /白山/, honsha: ["白山比咩神社"] },
  { name: "愛宕", match: /愛宕/, honsha: ["愛宕神社"] },
  { name: "秋葉", match: /秋葉/, honsha: ["秋葉山本宮秋葉神社"] },
  { name: "貴船", match: /貴船|貴布禰/, honsha: ["貴船神社"] },
  { name: "丹生", match: /丹生/, honsha: ["丹生都比売神社", "丹生川上神社"] },
  { name: "三輪", match: /大神神社|三輪/, honsha: ["大神神社"] },
  { name: "熱田", match: /熱田/, honsha: ["熱田神宮"] },
  { name: "出雲", match: /出雲/, honsha: ["出雲大社"] },
  { name: "氷川", match: /氷川/, honsha: ["氷川神社"] },
  { name: "松尾", match: /松尾/, honsha: ["松尾大社"] },
  { name: "多賀", match: /多賀/, honsha: ["多賀大社"] },
  { name: "大鳥", match: /大鳥/, honsha: ["大鳥大社"] },
  { name: "気多", match: /気多|氣多/, honsha: ["気多大社"] },
];

export const familyOf = (name: string) => FAMILIES.find((f) => f.match.test(name)) ?? null;

const isHonsha = (f: Family, name: string) => f.honsha.some((h) => name.includes(h));

const formatDate = (ts: string) => ts.slice(0, 10).replaceAll("-", "/");

// 参拝済みの社のうち、祭神がわかったもの
export type VisitedShrine = { name: string; ts: string; muni: string | null; deities: string[] };

// 同じ社を何度も記録していることがあるので、町と名前ごとに最後の訪問だけ残す。
// 「八幡神社」のようなよくある名前は、町が違えば別の社として数える
function latestByShrine<T extends { name: string; ts: string; muni: string | null }>(items: T[], key: (s: T) => string) {
  const latest = new Map<string, T>();
  for (const s of items) {
    const k = key(s);
    const prev = latest.get(k);
    if (!prev || s.ts > prev.ts) latest.set(k, s);
  }
  return [...latest.values()].sort((a, b) => b.ts.localeCompare(a.ts));
}

const toVisit = (townOf: (muni: string | null) => string | null) => (s: { name: string; ts: string; muni: string | null }) => ({
  name: s.name,
  date: formatDate(s.ts),
  town: townOf(s.muni),
});

// visited は訪問済みの神社。townOf は市区町村コードから町名を引く
export function findLineage(
  anchor: Place,
  visited: Spot[],
  areaShrines: Place[],
  townOf: (muni: string | null) => string | null,
): Lineage | null {
  const family = familyOf(anchor.name);
  if (!family) return null;
  const kin = latestByShrine(
    visited.filter((s) => family.match.test(s.name)),
    (s) => `${s.muni ?? `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`}:${s.name}`,
  );
  return {
    family: family.name,
    honsha: family.honsha[0],
    isHonsha: isHonsha(family, anchor.name),
    honshaVisited: kin.find((s) => isHonsha(family, s.name))?.name ?? null,
    visitedCount: kin.length,
    recent: kin.slice(0, 3).map(toVisit(townOf)),
    alsoHere: areaShrines.filter((p) => p.id !== anchor.id && family.match.test(p.name)).map((p) => p.name),
  };
}

// 本命の祭神ごとに、同じ神を祀る参拝済みの社を集める。
// 同じ系統の社は系統の縁で数えているので除き、名前からはわからないつながりだけを残す
export function findDeityKin(
  anchorName: string,
  deities: string[],
  visited: VisitedShrine[],
  townOf: (muni: string | null) => string | null,
): DeityKin[] {
  const family = familyOf(anchorName);
  return deities.map((name) => {
    const key = normalizeDeity(name);
    const kin = latestByShrine(
      visited.filter((v) => !family?.match.test(v.name) && v.deities.some((d) => normalizeDeity(d) === key)),
      (s) => `${s.muni}:${s.name}`,
    );
    return { name, visitedCount: kin.length, recent: kin.slice(0, 2).map(toVisit(townOf)) };
  });
}

export function findEn(lineage: Lineage | null, deities: DeityKin[]): En | null {
  return lineage || deities.length > 0 ? { lineage, deities } : null;
}
