// 神社の社格を、Wikipedia の神社記事の基礎情報（社格）から読み、並び順の点数にする。
// 例: |社格 = [[式内社]]（[[名神大社|名神大]]）・[[紀伊国]][[一宮]]<br />[[官国幣社|旧官幣大社]]<br />[[別表神社]]

// 社格の言葉と点数。上から順に見て、同じ key は一度だけ数える
const RULES: { re: RegExp; key: string; pts: number; label?: string }[] = [
  { re: /一宮|一之宮|一の宮/, key: "一宮", pts: 4 },
  { re: /[二三]宮|[二三]之宮|[二三]の宮/, key: "二宮", pts: 2, label: "二宮・三宮" },
  { re: /総社|惣社/, key: "総社", pts: 2 },
  { re: /名神大/, key: "名神大", pts: 1, label: "名神大社" },
  { re: /式内/, key: "式内社", pts: 3 },
  { re: /官幣大社|国幣大社/, key: "官国幣社", pts: 3, label: "旧官国幣大社" },
  { re: /官幣中社|国幣中社/, key: "官国幣社", pts: 2, label: "旧官国幣中社" },
  { re: /官幣小社|国幣小社|別格官幣社/, key: "官国幣社", pts: 1, label: "旧官国幣小社" },
  { re: /勅祭社/, key: "勅祭社", pts: 2 },
  { re: /別表神社/, key: "別表神社", pts: 1 },
  { re: /府社|県社/, key: "府県社", pts: 1, label: "旧府県社" },
];

export type Basis = { key: string; label: string; pts: number };

// 基礎情報の「社格」欄を、表示用の短い言葉に分ける
export function parseShakaku(wikitext: string): string[] {
  // 欄が空のとき次の行を拾わないよう、改行はまたがない
  const m = wikitext.match(/^\|[ \t]*社格[ \t]*=[ \t]*(.+)$/m);
  if (!m) return [];
  const cleaned = m[1]
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "");
  const items = cleaned
    .split(/<br\s*\/?>|[・、，,／/]/)
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 24 && !/^(なし|無し|-|—)$/.test(s));
  return [...new Set(items)].slice(0, 8);
}

// 社格の言葉から点数の内訳を出す。すでに数えた key（名前から読んだ一宮など）は除く
export function shakakuBasis(shakaku: string[], counted: Set<string> = new Set()): Basis[] {
  const text = shakaku.join(" ");
  const seen = new Set(counted);
  const out: Basis[] = [];
  for (const r of RULES) {
    if (seen.has(r.key) || !r.re.test(text)) continue;
    seen.add(r.key);
    out.push({ key: r.key, label: r.label ?? r.key, pts: r.pts });
  }
  return out;
}
