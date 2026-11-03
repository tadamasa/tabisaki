"use client";

import { useEffect, useState } from "react";
import {
  CHECK_IN,
  DAY_END,
  INN_BY,
  MAPS_WAYPOINT_MAX,
  MODE_LABEL,
  type LegMode,
  type Mode,
  type Plan,
  blocksOf,
  type Role,
  type Stop,
  clock,
  googleMapsLeg,
  googleMapsRoutes,
} from "@/lib/plan/itinerary";
import type { Origin } from "@/lib/origin";
import { KIND } from "@/lib/kinds";
import { FestivalBadge } from "./AreaPlacesPanel";
import { GoogleHoursCheck, useGoogleEnabled } from "./GoogleInfo";
import HubFinder from "./HubFinder";
import { LinkChips, placeTarget } from "./Links";
import type { Place } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = { primer: "予習", anchor: "本命", kin: "ゆかり", extra: "立ち寄り", stay: "泊", rent: "借りる", park: "停める" };
const ROLE_CLASS: Record<Role, string> = {
  primer: "bg-museum/10 text-museum",
  anchor: "bg-shrine text-white",
  kin: "bg-shrine/10 text-shrine",
  extra: "bg-art/10 text-art",
  stay: "bg-inn text-white",
  rent: "bg-muted/15 text-foreground",
  park: "bg-muted/15 text-foreground",
};
const MODE_ICON: Record<Mode, string> = { car: "🚗", train: "🚃", bike: "🚲", walk: "🚶", rent: "🚃" };
// 出発時刻は時と分を自由に選べる（端末の時刻入力を使う）
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function TimeInput({ value, label, onChange }: { value: number; label: string; onChange: (min: number) => void }) {
  return (
    <input
      type="time"
      value={hhmm(value)}
      onChange={(e) => {
        const [h, m] = e.target.value.split(":").map(Number);
        // 消しかけの途中（空）は無視する
        if (Number.isFinite(h) && Number.isFinite(m)) onChange(h * 60 + m);
      }}
      className="min-h-8 rounded border border-border bg-surface px-1 py-0.5 text-sm tabular-nums text-foreground"
      aria-label={label}
    />
  );
}

type Props = {
  plan: Plan;
  home: [number, number];
  origin: Origin;
  mode: Mode;
  onMode: (m: Mode) => void;
  tripDate: string;
  trip: Date;
  onDate: (d: string) => void;
  onChange: (stops: Stop[]) => void;
  onStart: (min: number) => void;
  // 2日目に宿を出る時刻
  onStart2: (min: number) => void;
  onReset: () => void;
  // 並べ直して順番が変わったら true
  onOptimize: () => boolean;
  onFocus: (p: Place) => void;
  // レンタカーを借りる所・駐車場を行程に入れる（駐車場は beforeId の地点の前）
  onAddHub: (p: Place, beforeId?: string) => void;
  // 車・歩きの区間を実際の道で測る。困ったことがあれば文で返す
  onMeasure: () => Promise<string | null>;
  measured: boolean;
};

// 地点のあいだの移動。地点どうしのあいだでは、2か所をつなぐボタンも出す。電車の区間には乗換案内を添える
function Drive({ min, by, back = 0, transit, link }: { min: number; by: LegMode; back?: number; transit?: string; link?: { on: boolean; toggle: () => void } }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 py-0.5 pl-6 text-[11px] text-muted">
      <span className={link?.on ? "border-l-2 border-area pl-2" : ""}>
        {back > 0 && `🚶 歩いて車に戻る 約 ${back} 分 ・ `}
        {MODE_ICON[by]} {MODE_LABEL[by]}で約 {min - back} 分
      </span>
      {transit && (
        <a href={transit} target="_blank" rel="noreferrer" className="text-museum underline">
          乗換を調べる
        </a>
      )}
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

export default function ItineraryPanel({ plan, home, origin, mode, onMode, tripDate, trip, onDate, onChange, onStart, onStart2, onReset, onOptimize, onFocus, onAddHub, onMeasure, measured }: Props) {
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
  // Google の営業時間で、着く時刻に開いているかを確かめる（押したときだけ読む）
  const google = useGoogleEnabled();
  const [checkHours, setCheckHours] = useState(false);
  // day は 1 日目が 1
  const dayDate = (day: number) => new Date(trip.getFullYear(), trip.getMonth(), trip.getDate() + day - 1);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  const optimize = () => setNotice(onOptimize() ? "移動がいちばん短くなる順に並べ直しました" : "すでに移動がいちばん短い順です");
  // 電車は経由地を渡せないので、区間ごとに乗換案内を開く
  const routes = mode === "train" ? [] : googleMapsRoutes(stops, home, mode);
  const transitLink = (i: number) => {
    const last = plan.dropOff?.place ?? stops[stops.length - 1]?.place;
    const from = i < stops.length ? plan.stops[i].from : last ? ([last.lng, last.lat] as [number, number]) : home;
    const to = i === stops.length ? home : ([stops[i].place.lng, stops[i].place.lat] as [number, number]);
    return googleMapsLeg(from, to, "train");
  };
  const legBy = (by: LegMode, i: number) => (by === "train" ? transitLink(i) : undefined);
  // 車で回るとき（車、または借りる所を決めた電車＋レンタカー）は、地点の近くに停めて歩ける
  const rent = stops.find((s) => s.role === "rent");
  const byCar = mode === "car" || (mode === "rent" && !!rent);
  const target = stops.find((s) => s.role === "anchor")?.place ?? stops.find((s) => s.role !== "rent")?.place;
  const [measuring, setMeasuring] = useState(false);
  const measure = async () => {
    setMeasuring(true);
    const problem = await onMeasure();
    setMeasuring(false);
    setNotice(problem ?? "車と歩きの区間を、Google の実際の道で計算しました");
  };
  const homeOver = Math.max(0, plan.home - DAY_END);

  return (
    <section className="rounded-lg border border-shrine/30 bg-shrine/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{plan.days > 1 ? `${plan.days - 1}泊${plan.days}日の行程（目安）` : "日帰りの行程（目安）"}</h3>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {google && stops.length > 0 && mode !== "train" && (
            <button type="button" onClick={measure} disabled={measuring} className="text-museum underline disabled:opacity-50">
              {measuring ? "計算しています…" : measured ? "実際の道で計算し直す" : "実際の道で計算"}
            </button>
          )}
          {google && stops.length > 0 && !checkHours && (
            <button type="button" onClick={() => setCheckHours(true)} className="text-museum underline">
              営業時間を確かめる
            </button>
          )}
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

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <label className="flex items-center gap-1">
          旅の日
          <input
            type="date"
            value={tripDate}
            onChange={(e) => onDate(e.target.value)}
            className="rounded border border-border bg-surface px-1 py-0.5 text-xs text-foreground"
          />
        </label>
        <label className="flex items-center gap-1">
          移動
          <select
            value={mode}
            onChange={(e) => onMode(e.target.value as Mode)}
            className="rounded border border-border bg-surface px-1 py-0.5 text-xs text-foreground"
          >
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === "rent" && (
        <div className="mt-2 rounded border border-border bg-surface p-2 text-xs">
          <p className="font-medium">🚃🚙 電車で行って、レンタカーで回る</p>
          {rent ? (
            <p className="mt-0.5 text-muted">
              {rent.place.name}で借りて、最後にここへ返します。
              {google && target && (
                <>
                  {" "}
                  <HubFinder kind="rental" near={target} onPick={(p) => onAddHub(p)} compact />
                </>
              )}
            </p>
          ) : google && target ? (
            <div className="mt-0.5 text-muted">
              <p>借りる所を決めると、そこまでを電車、あとを車で数えます（決めるまでは全部を電車で数えます）。</p>
              <HubFinder kind="rental" near={target} onPick={(p) => onAddHub(p)} />
            </div>
          ) : (
            <p className="mt-0.5 text-muted">借りる所を探すには Google の鍵（GOOGLE_PLACES_API_KEY）が要ります。決めるまでは全部を電車で数えます。</p>
          )}
        </div>
      )}

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
              {plan.days > 1 && <span className="mr-1 text-xs font-semibold text-foreground">1日目</span>}
              <TimeInput value={plan.start} label="出発時刻" onChange={onStart} />
              {origin.label}を出る
            </label>
          </li>
          {plan.stops.map((s, i) => (
            <li key={s.place.id}>
              <ol>
                <Drive min={s.driveMin} by={s.by} back={s.backMin} transit={legBy(s.by, i)} link={i > 0 ? { on: !!stops[i - 1].linkNext, toggle: () => toggleLink(i - 1) } : undefined} />
                <li className="flex items-start gap-2 rounded bg-surface px-2 py-1.5 ring-1 ring-border">
                  <span className="w-[5.5rem] shrink-0 tabular-nums text-xs text-muted">
                    {s.role === "stay" ? `${clock(s.arrive)} 着` : `${clock(s.arrive)}–${clock(s.depart)}`}
                    {s.role === "stay" && s.arrive > INN_BY && <span className="block text-shrine">18時を過ぎます</span>}
                    {s.role === "stay" && s.arrive < CHECK_IN && <span className="block">15時より前です</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`mr-1.5 rounded px-1 text-[11px] ${ROLE_CLASS[s.role]}`}>{ROLE_LABEL[s.role]}</span>
                    <button type="button" onClick={() => onFocus(s.place)} className="text-left font-medium hover:underline">
                      <span className="mr-0.5" aria-hidden>
                        {KIND[s.place.kind].icon}
                      </span>
                      {s.place.name}
                    </button>
                    <span className="ml-1 text-xs text-muted">{s.place.town}</span>
                    <FestivalBadge place={s.place} trip={trip} />
                    {google && byCar && s.by === "car" && !["rent", "park", "stay"].includes(s.role) && (
                      <span className="block">
                        <HubFinder kind="parking" near={s.place} onPick={(p) => onAddHub(p, s.place.id)} compact />
                      </span>
                    )}
                    {s.role !== "stay" && <GoogleHoursCheck place={s.place} date={dayDate(s.day)} arrive={s.arrive} depart={s.depart} check={checkHours} />}
                    <LinkChips target={placeTarget(s.place)} editable={false} />
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
                {s.role === "stay" && (
                  <li className="mt-2 flex items-center gap-1 text-muted">
                    <span className="mr-1 text-xs font-semibold text-foreground">{s.day + 1}日目</span>
                    <TimeInput value={plan.start2} label="2日目に宿を出る時刻" onChange={onStart2} />
                    宿を出る
                  </li>
                )}
              </ol>
            </li>
          ))}
          {plan.dropOff && (
            <>
              <Drive min={plan.dropOff.driveMin} by="car" back={plan.dropOff.backMin} />
              <li className="flex items-start gap-2 rounded bg-surface px-2 py-1.5 ring-1 ring-border">
                <span className="w-[5.5rem] shrink-0 tabular-nums text-xs text-muted">
                  {clock(plan.dropOff.arrive)}–{clock(plan.dropOff.depart)}
                </span>
                <span className="text-sm">
                  <span className={`mr-1.5 rounded px-1 text-[11px] ${ROLE_CLASS.rent}`}>返す</span>
                  🚙 {plan.dropOff.place.name}
                </span>
              </li>
            </>
          )}
          <Drive min={plan.returnMin} by={plan.returnBy} back={plan.returnBackMin} transit={legBy(plan.returnBy, stops.length)} />
          <li className="text-sm">
            <span className="tabular-nums">{clock(plan.home)}</span> {origin.label}に着く
            {homeOver > 0 && <span className="ml-2 text-xs text-shrine">19時を {homeOver} 分過ぎます</span>}
            <span className="ml-2 text-xs text-muted">移動 計{Math.floor(plan.driveMin / 60)}時間{plan.driveMin % 60}分</span>
          </li>
        </ol>
      )}

      {stops.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {routes.map((r) => (
            <a key={r.day} href={r.url} target="_blank" rel="noreferrer" className="text-museum underline">
              {routes.length > 1 ? `${r.day}日目の経路をGoogleマップで開く` : "Googleマップで経路を開く"}
            </a>
          ))}
          {routes.some((r) => r.dropped > 0) && (
            <span className="text-shrine">Googleマップには1日あたり最初の{MAPS_WAYPOINT_MAX}か所までしか渡せません。</span>
          )}
          <span className="text-muted">
            {measured ? "車と歩きの区間は Google の実際の道（渋滞は考えない）、ほかは直線距離からの目安です。" : "時刻は直線距離からの目安です。"}
            {byCar && google && "「🅿️ 近くに停めて歩く」で駐車場を入れると、そこから「🔗 つないだ」地点は歩いて回り、つながりが切れたところで車に戻ります。"}
            {mode === "train" && "電車は乗り換えや本数を考えていません（近い地点のあいだは歩きとみます）。各区間の「乗換を調べる」で確かめてください。"}
            地点のあいだの「🔗 つなぐ」を押すと、その2か所は並べ直しても続けてこの順に回ります。「＋より前に回る」では、あいだに別の場所が入ってもよい前後だけを決められます。
          </span>
        </p>
      )}
    </section>
  );
}
