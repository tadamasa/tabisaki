// Google Places API（New）の営業時間（regularOpeningHours.periods）を、旅の日の言葉にする。
// day は 0 が日曜。close がない期間は24時間営業。日をまたぐ期間は閉まる時刻に 24時間を足す

export type Point = { day: number; hour: number; minute: number };
export type Period = { open: Point; close?: Point };

// 分（0時からの分）の範囲。end は 1440 を超えることがある（日をまたぐ）
export type Range = { start: number; end: number };

export type DayHours =
  | { kind: "unknown" }
  | { kind: "closed" }
  | { kind: "always" }
  | { kind: "open"; ranges: Range[] };

const min = (p: Point) => p.hour * 60 + p.minute;

export function dayHours(periods: Period[] | undefined, weekday: number): DayHours {
  if (!periods?.length) return { kind: "unknown" };
  // 24時間営業は「日曜0時に開き、閉まらない」1つの期間で表される
  if (periods.length === 1 && !periods[0].close && min(periods[0].open) === 0) return { kind: "always" };
  const span = (p: Period): Range => {
    const start = min(p.open);
    if (!p.close) return { start, end: 24 * 60 };
    const days = (p.close.day - p.open.day + 7) % 7;
    return { start, end: min(p.close) + days * 24 * 60 };
  };
  // 前の日の夜に開いて、この日の朝まで続く分も、この日の 0時からの範囲として入れる
  const prev = (weekday + 6) % 7;
  const carried = periods
    .filter((p) => p.open.day === prev)
    .map(span)
    .filter((r) => r.end > 24 * 60)
    .map((r) => ({ start: 0, end: r.end - 24 * 60 }));
  const ranges = [...carried, ...periods.filter((p) => p.open.day === weekday).map(span)].sort((a, b) => a.start - b.start);
  return ranges.length ? { kind: "open", ranges } : { kind: "closed" };
}

const hm = (m: number) => {
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}`;
};

export const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

export function hoursText(h: DayHours): string {
  switch (h.kind) {
    case "unknown":
      return "営業時間の登録なし";
    case "closed":
      return "休み";
    case "always":
      return "24時間";
    case "open":
      return h.ranges.map((r) => `${hm(r.start)}–${hm(r.end)}`).join("、");
  }
}

// 行程で着く時刻と出る時刻が、その日の営業時間に収まるかを見る。収まるか、わからないときは null
export function visitWarning(h: DayHours, arrive: number, depart: number): string | null {
  if (h.kind === "closed") return "この日は休みです";
  if (h.kind !== "open") return null;
  if (h.ranges.some((r) => arrive >= r.start && depart <= r.end)) return null;
  const inside = h.ranges.find((r) => arrive >= r.start && arrive < r.end);
  if (inside) return `${hm(inside.end)}に閉まります`;
  const next = h.ranges.find((r) => r.start > arrive);
  if (next) return `${hm(next.start)}に開きます`;
  return `${hm(h.ranges[h.ranges.length - 1].end)}に閉まっています`;
}
