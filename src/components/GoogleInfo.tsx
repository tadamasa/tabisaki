"use client";

import { useEffect, useState } from "react";
import { WEEKDAY, dayHours, hoursText, visitWarning } from "@/lib/google/hours";
import type { GooglePlace } from "@/lib/google/places";
import type { Place } from "@/lib/types";

// Google Places API の情報は押されたときだけ読む（呼んだ数で料金がかかるため）。同じ場所は画面を開いているあいだ覚える
type Result = { place: GooglePlace | null } | { error: string };
const memo = new Map<string, Promise<Result>>();

let enabledOnce: Promise<boolean> | null = null;
function useGoogleEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    enabledOnce ??= fetch("/api/google/place")
      .then((r) => r.json())
      .then((b: { enabled?: boolean }) => !!b.enabled)
      .catch(() => false);
    let alive = true;
    enabledOnce.then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

function load(p: Place): Promise<Result> {
  const k = p.id;
  if (!memo.has(k)) {
    const q = new URLSearchParams({ name: p.name, town: p.town, lat: String(p.lat), lng: String(p.lng) });
    const job = fetch(`/api/google/place?${q}`)
      .then(async (r) => {
        const b = await r.json();
        return r.ok ? { place: b.place ?? null } : { error: b.error ?? `HTTP ${r.status}` };
      })
      .catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    // 失敗は覚えない（押し直せるように）
    job.then((r) => "error" in r && memo.delete(k));
    memo.set(k, job);
  }
  return memo.get(k)!;
}

function useGooglePlace(p: Place, active: boolean) {
  const [res, setRes] = useState<Result | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    load(p).then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [p, active]);
  return res;
}

const STATUS_NOTE: Record<string, string> = {
  CLOSED_TEMPORARILY: "臨時休業中と Google に登録されています",
  CLOSED_PERMANENTLY: "閉業と Google に登録されています",
};

function Stars({ g }: { g: GooglePlace }) {
  if (g.rating == null) return <span>評価なし</span>;
  return (
    <span>
      <span className="text-gold">★</span>
      {g.rating.toFixed(1)}
      <span className="text-muted">（{g.ratings}件）</span>
    </span>
  );
}

// 「Googleの評価・営業時間」を開くボタン。狭い行ではボタンだけを行に置き、中身（GooglePanel）は行の下に出す
export function GoogleToggle({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const enabled = useGoogleEnabled();
  if (!enabled || open) return null;
  return (
    <button type="button" onClick={onOpen} className="ml-1.5 text-xs text-museum underline">
      Googleの評価・営業時間
    </button>
  );
}

// 候補の一覧に添える「Google の評価・営業時間・写真」。ボタンと中身をひとつにしたもの
export function GoogleInfo({ place, trip }: { place: Place; trip: Date }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GoogleToggle open={open} onOpen={() => setOpen(true)} />
      {open && <GooglePanel place={place} trip={trip} onClose={() => setOpen(false)} />}
    </>
  );
}

export function GooglePanel({ place, trip, onClose }: { place: Place; trip: Date; onClose: () => void }) {
  const res = useGooglePlace(place, true);
  if (!res) return <p className="mt-1 text-xs text-muted">Google で探しています…</p>;
  if ("error" in res)
    return (
      <p className="mt-1 text-xs text-muted">
        Google の情報を読めませんでした（{res.error}）{" "}
        <button type="button" onClick={onClose} className="text-museum underline">
          閉じる
        </button>
      </p>
    );
  const g = res.place;
  if (!g) return <p className="mt-1 text-xs text-muted">Google マップでは、この位置の近くに同じ名前の場所が見つかりませんでした。</p>;
  const wd = trip.getDay();
  const today = dayHours(g.periods ?? undefined, wd);
  const status = g.status ? STATUS_NOTE[g.status] : undefined;
  return (
    <div className="mt-1.5 flex gap-2 rounded border border-border bg-background/60 p-1.5 text-xs">
      {g.photo && (
        <figure className="w-24 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- Google の写真は転送先の URL が毎回変わるので next/image を使わない */}
          <img
            src={`/api/google/photo?name=${encodeURIComponent(g.photo.name)}&w=400`}
            alt={`${g.name}の写真`}
            loading="lazy"
            className="h-20 w-24 rounded object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          {g.photo.authors.length > 0 && (
            <figcaption className="mt-0.5 truncate text-[10px] text-muted">
              写真:{" "}
              {g.photo.authors.map((a) =>
                a.uri ? (
                  <a key={a.name} href={a.uri} target="_blank" rel="noreferrer" className="underline">
                    {a.name}
                  </a>
                ) : (
                  <span key={a.name}>{a.name}</span>
                ),
              )}
            </figcaption>
          )}
        </figure>
      )}
      <div className="min-w-0 space-y-0.5">
        <p>
          <Stars g={g} />
          {g.name !== place.name && <span className="ml-1.5 text-muted">（Google では「{g.name}」）</span>}
        </p>
        {status && <p className="font-medium text-shrine">{status}</p>}
        <p>
          <span className="font-medium">
            旅の日（{WEEKDAY[wd]}）
          </span>{" "}
          <span className={today.kind === "closed" ? "font-medium text-shrine" : ""}>{hoursText(today)}</span>
        </p>
        {g.weekdayText.length > 0 && (
          <details>
            <summary className="cursor-pointer text-muted">曜日ごとの営業時間</summary>
            <ul className="text-muted">
              {g.weekdayText.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-muted">
          祝日や年末年始は変わることがあります。
          {g.mapsUri && (
            <a href={g.mapsUri} target="_blank" rel="noreferrer" className="ml-1 text-museum underline">
              Google マップで見る
            </a>
          )}
          {g.website && !place.website && (
            <a href={g.website} target="_blank" rel="noreferrer" className="ml-1.5 text-museum underline">
              公式サイト
            </a>
          )}
        </p>
      </div>
    </div>
  );
}

// 行程の地点に添える、着く時刻が営業時間に収まるかの確かめ。check が true のときだけ読む
export function GoogleHoursCheck({ place, date, arrive, depart, check }: { place: Place; date: Date; arrive: number; depart: number; check: boolean }) {
  const res = useGooglePlace(place, check);
  if (!check || !res) return null;
  if ("error" in res) return <span className="block text-[11px] text-muted">営業時間を確かめられませんでした</span>;
  const g = res.place;
  if (!g) return null;
  const h = dayHours(g.periods ?? undefined, date.getDay());
  const status = g.status ? STATUS_NOTE[g.status] : undefined;
  const warn = status ?? visitWarning(h, arrive, depart);
  // 社には営業時間の登録がないことが多いので、何もわからないときは黙っている
  if (h.kind === "unknown" && !warn) return null;
  return (
    <span className="block text-[11px]">
      <span className="text-muted">
        {WEEKDAY[date.getDay()]}曜 {hoursText(h)}
        {g.rating != null && ` ・ ★${g.rating.toFixed(1)}`}
      </span>
      {warn && <span className="ml-1 font-medium text-shrine">⚠ {warn}</span>}
    </span>
  );
}

export { useGoogleEnabled };
