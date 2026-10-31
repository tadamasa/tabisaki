// 神社の例祭日を、Wikipedia の神社記事の基礎情報（例祭）から読み、旅の日と重なるかを見る。
// 例: |例祭 = [[10月17日]]<br />（[[秋祭り|秋季大祭]]）、|例祭 = 4月第2日曜日、|例祭 = 旧暦8月15日

// 基礎情報の「例祭」欄を、表示用の短い言葉にする
export function parseReisai(wikitext: string): string | null {
  const m = wikitext.match(/^\|[ \t]*例祭[ \t]*=[ \t]*(.+)$/m);
  if (!m) return null;
  const text = m[1]
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, "・")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/[・\s]+$/g, "")
    .replace(/^[・\s]+/g, "")
    .trim();
  return text || null;
}

const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
const WEEKDAY: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };

// その年の例祭の日（月日、または「第N○曜日」）。旧暦の日付は新暦では毎年ずれるので数えない
export function festivalDays(reisai: string, year: number): Date[] {
  const days: Date[] = [];
  // 「旧暦8月15日」「旧8月15日」の分は外す
  const text = reisai.replace(/旧(?:暦)?\s*\d{1,2}月[^・、,）)]*/g, "");
  for (const m of text.matchAll(/(\d{1,2})月(\d{1,2})日/g)) days.push(new Date(year, Number(m[1]) - 1, Number(m[2])));
  for (const m of text.matchAll(/(\d{1,2})月(?:の)?第([1-5一二三四五])([日月火水木金土])曜/g)) {
    const month = Number(m[1]) - 1;
    const nth = Number(m[2]) || KANJI_NUM[m[2]];
    const first = new Date(year, month, 1).getDay();
    const day = 1 + ((WEEKDAY[m[3]] - first + 7) % 7) + (nth - 1) * 7;
    if (new Date(year, month, day).getMonth() === month) days.push(new Date(year, month, day));
  }
  return days;
}

const DAY_MS = 86_400_000;

// 旅の日から見て、いちばん近い例祭まで何日か（前なら負）。日付の読めない例祭は null
export function daysToFestival(reisai: string | undefined | null, trip: Date): number | null {
  if (!reisai) return null;
  const base = Date.UTC(trip.getFullYear(), trip.getMonth(), trip.getDate());
  let best: number | null = null;
  for (const y of [trip.getFullYear() - 1, trip.getFullYear(), trip.getFullYear() + 1]) {
    for (const d of festivalDays(reisai, y)) {
      const diff = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - base) / DAY_MS);
      if (best === null || Math.abs(diff) < Math.abs(best)) best = diff;
    }
  }
  return best;
}

// 旅の日の前後これだけの日数に例祭があれば、印を付ける
export const FESTIVAL_WINDOW = 3;

export function festivalNote(reisai: string | undefined | null, trip: Date): string | null {
  const d = daysToFestival(reisai, trip);
  if (d === null || Math.abs(d) > FESTIVAL_WINDOW) return null;
  return d === 0 ? "旅の日が例祭" : d > 0 ? `例祭の${d}日前` : `例祭の${-d}日後`;
}
