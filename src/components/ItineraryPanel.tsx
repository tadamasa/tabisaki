"use client";

import { useEffect, useState } from "react";
import { MAPS_WAYPOINT_MAX, type Plan, type Role, type Stop, clock, googleMapsRoute } from "@/lib/plan/itinerary";
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

function Drive({ min }: { min: number }) {
  return <li className="py-0.5 pl-6 text-[11px] text-muted">車で約 {min} 分</li>;
}

export default function ItineraryPanel({ plan, home, onChange, onStart, onReset, onOptimize, onFocus }: Props) {
  const stops: Stop[] = plan.stops.map(({ place, role, fixed }) => ({ place, role, fixed }));
  const move = (i: number, d: -1 | 1) => {
    const next = [...stops];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(stops.filter((_, k) => k !== i));
  const toggleFixed = (i: number) => onChange(stops.map((s, k) => (k === i ? { ...s, fixed: !s.fixed } : s)));
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
                <Drive min={s.driveMin} />
                <li className={`flex items-start gap-2 rounded bg-surface px-2 py-1.5 ring-1 ${s.fixed ? "ring-area" : "ring-border"}`}>
                  <span className="w-[5.5rem] shrink-0 tabular-nums text-xs text-muted">
                    {clock(s.arrive)}–{clock(s.depart)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`mr-1.5 rounded px-1 text-[11px] ${ROLE_CLASS[s.role]}`}>{ROLE_LABEL[s.role]}</span>
                    <button type="button" onClick={() => onFocus(s.place)} className="text-left font-medium hover:underline">
                      {s.place.name}
                    </button>
                    <span className="ml-1 text-xs text-muted">{s.place.town}</span>
                  </span>
                  <span className="flex shrink-0 gap-0.5 text-muted">
                    <button
                      type="button"
                      aria-label={s.fixed ? "固定を外す" : "この順番に固定"}
                      aria-pressed={!!s.fixed}
                      title={s.fixed ? "固定を外す" : "この順番に固定（並べ直しても動かさない）"}
                      onClick={() => toggleFixed(i)}
                      className={`size-8 rounded hover:bg-background ${s.fixed ? "bg-area/20 text-area" : "opacity-40"}`}
                    >
                      📌
                    </button>
                    <button type="button" aria-label="前へ" disabled={i === 0} onClick={() => move(i, -1)} className="size-8 rounded hover:bg-background disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" aria-label="後ろへ" disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="size-8 rounded hover:bg-background disabled:opacity-30">
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
          <span className="text-muted">時刻は直線距離からの目安です。📌で順番を固定すると、並べ直しや追加のときもその番目に残ります。</span>
        </p>
      )}
    </section>
  );
}
