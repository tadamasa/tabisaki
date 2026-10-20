"use client";

import { useEffect, useState } from "react";
import { MAPS_WAYPOINT_MAX, type Plan, blocksOf, type Role, type Stop, clock, googleMapsRoute } from "@/lib/plan/itinerary";
import type { Place } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = { primer: "予習", anchor: "本命", kin: "ゆかり", extra: "立ち寄り" };
const ROLE_CLASS: Record<Role, string> = {
  primer: "bg-museum/10 text-museum",
  anchor: "bg-shrine text-white",
  kin: "bg-shrine/10 text-shrine",
  extra: "bg-art/10 text-art",
};
const START_TIMES = [6, 7, 8, 9, 10].map((h) => h * 60);

type Props = {
  plan: Plan;
  home: [number, number];
  onChange: (stops: Stop[]) => void;
  onStart: (min: number) => void;
  onReset: () => void;
  // 並べ直して順番が変わったら true
  onOptimize: () => boolean;
  onFocus: (p: Place) => void;
};

// 地点のあいだの移動。地点どうしのあいだでは、2か所をつなぐボタンも出す
function Drive({ min, link }: { min: number; link?: { on: boolean; toggle: () => void } }) {
  return (
    <li className="flex items-center gap-2 py-0.5 pl-6 text-[11px] text-muted">
      <span className={link?.on ? "border-l-2 border-area pl-2" : ""}>車で約 {min} 分</span>
      {link && (
        <button
          type="button"
          onClick={link.toggle}
          aria-pressed={link.on}
          className={`min-h-7 rounded-full border px-2 ${link.on ? "border-area bg-area/15 text-area" : "border-border"}`}
        >
          {link.on ? "🔗 続けて回る（外す）" : "🔗 つなぐ"}
        </button>
      )}
    </li>
  );
}

// 「〇〇より前に回る」の条件。守れていないときは赤で出す
function OrderRules({
  stop,
  at,
  others,
  nameOf,
  onChange,
}: {
  stop: Stop;
  at: number;
  others: Stop[];
  nameOf: Map<string, { name: string; at: number }>;
  onChange: (ids: string[]) => void;
}) {
  const before = (stop.before ?? []).filter((id) => nameOf.has(id));
  const choices = others.filter((o) => !before.includes(o.place.id));
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
      {before.map((id) => {
        const ok = at < nameOf.get(id)!.at;
        return (
          <span key={id} className={`inline-flex items-center rounded-full border px-1.5 ${ok ? "border-area/50 text-area" : "border-shrine text-shrine"}`}>
            {nameOf.get(id)!.name}より前{ok ? "" : "（今は守れていません）"}
            <button
              type="button"
              aria-label={`${nameOf.get(id)!.name}より前、の条件を外す`}
              onClick={() => onChange(before.filter((b) => b !== id))}
              className="ml-0.5 min-h-6 px-1"
            >
              ×
            </button>
          </span>
        );
      })}
      {choices.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onChange([...before, e.target.value])}
          aria-label="順番の条件を足す"
          className="max-w-[10rem] rounded border border-border bg-surface px-1 py-0.5 text-[11px] text-muted"
        >
          <option value="">＋より前に回る…</option>
          {choices.map((o) => (
            <option key={o.place.id} value={o.place.id}>
              {o.place.name}より前
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

export default function ItineraryPanel({ plan, home, onChange, onStart, onReset, onOptimize, onFocus }: Props) {
  const stops: Stop[] = plan.stops.map(({ place, role, linkNext, before }) => ({ place, role, linkNext, before }));
  const nameOf = new Map(stops.map((s, i) => [s.place.id, { name: s.place.name, at: i }]));
  // つないだ地点はかたまりごと動かす
  const blocks = blocksOf(stops);
  const blockAt = (i: number) => {
    let n = 0;
    return blocks.findIndex((b) => (n += b.length) > i);
  };
  const move = (i: number, d: -1 | 1) => {
    const b = blockAt(i);
    const next = [...blocks];
    [next[b], next[b + d]] = [next[b + d], next[b]];
    onChange(next.flat());
  };
  // 外した地点の前の地点は、どこにもつながないようにする
  const remove = (i: number) =>
    onChange(stops.flatMap((s, k) => (k === i ? [] : k === i - 1 ? [{ ...s, linkNext: false }] : [s])));
  const setBefore = (i: number, ids: string[]) => onChange(stops.map((s, k) => (k === i ? { ...s, before: ids } : s)));
  const toggleLink = (i: number) => onChange(stops.map((s, k) => (k === i ? { ...s, linkNext: !s.linkNext } : s)));
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  const optimize = () => setNotice(onOptimize() ? "いちばん早く帰れる順に並べ直しました" : "すでにいちばん早く帰れる順です");

  return (
    <section className="rounded-lg border border-shrine/30 bg-shrine/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">日帰りの行程（目安）</h3>
        <span className="flex gap-3 whitespace-nowrap text-xs">
          {stops.length > 1 && (
            <button type="button" onClick={optimize} className="text-museum underline">
              近い順に並べ直す
            </button>
          )}
          <button type="button" onClick={onReset} className="text-museum underline">
            おすすめに戻す
          </button>
        </span>
      </div>

      {notice && (
        <p role="status" className="mt-1 text-xs text-visited">
          {notice}
        </p>
      )}

      {stops.length === 0 ? (
        <p className="mt-2 text-sm text-muted">「候補」から「＋行程」で社や館を入れてください。地図の印からも入れられます。</p>
      ) : (
        <ol className="mt-2 text-sm">
          <li className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-muted">
              <select
                value={plan.start}
                onChange={(e) => onStart(Number(e.target.value))}
                className="rounded border border-border bg-surface px-1 py-0.5 text-sm text-foreground"
                aria-label="出発時刻"
              >
                {START_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {clock(t)}
                  </option>
                ))}
              </select>
              自宅を出る
            </label>
          </li>
          {plan.stops.map((s, i) => (
            <li key={s.place.id}>
              <ol>
                <Drive min={s.driveMin} link={i > 0 ? { on: !!stops[i - 1].linkNext, toggle: () => toggleLink(i - 1) } : undefined} />
                <li className="flex items-start gap-2 rounded bg-surface px-2 py-1.5 ring-1 ring-border">
                  <span className="w-[5.5rem] shrink-0 tabular-nums text-xs text-muted">
                    {clock(s.arrive)}–{clock(s.depart)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`mr-1.5 rounded px-1 text-[11px] ${ROLE_CLASS[s.role]}`}>{ROLE_LABEL[s.role]}</span>
                    <button type="button" onClick={() => onFocus(s.place)} className="text-left font-medium hover:underline">
                      {s.place.name}
                    </button>
                    <span className="ml-1 text-xs text-muted">{s.place.town}</span>
                    <OrderRules
                      stop={s}
                      at={i}
                      others={stops.filter((o) => o.place.id !== s.place.id)}
                      nameOf={nameOf}
                      onChange={(ids) => setBefore(i, ids)}
                    />
                  </span>
                  <span className="flex shrink-0 gap-0.5 text-muted">
                    <button type="button" aria-label="前へ" disabled={blockAt(i) === 0} onClick={() => move(i, -1)} className="size-8 rounded hover:bg-background disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" aria-label="後ろへ" disabled={blockAt(i) === blocks.length - 1} onClick={() => move(i, 1)} className="size-8 rounded hover:bg-background disabled:opacity-30">
                      ↓
                    </button>
                    <button type="button" aria-label="外す" onClick={() => remove(i)} className="size-8 rounded hover:bg-background">
                      ×
                    </button>
                  </span>
                </li>
              </ol>
            </li>
          ))}
          <Drive min={plan.returnMin} />
          <li className="text-sm">
            <span className="tabular-nums">{clock(plan.home)}</span> 自宅に着く
            {plan.overMin > 0 && <span className="ml-2 text-xs text-shrine">19時を {plan.overMin} 分過ぎます</span>}
          </li>
        </ol>
      )}

      {stops.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <a href={googleMapsRoute(stops, home)} target="_blank" rel="noreferrer" className="text-museum underline">
            Googleマップで経路を開く
          </a>
          {stops.length > MAPS_WAYPOINT_MAX && (
            <span className="text-shrine">Googleマップには最初の{MAPS_WAYPOINT_MAX}か所までしか渡せません。</span>
          )}
          <span className="text-muted">時刻は直線距離からの目安です。地点のあいだの「🔗 つなぐ」を押すと、その2か所は並べ直しても続けてこの順に回ります。「＋より前に回る」では、あいだに別の場所が入ってもよい前後だけを決められます。</span>
        </p>
      )}
    </section>
  );
}
