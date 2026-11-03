"use client";

import { useState } from "react";
import { MODE_LABEL } from "@/lib/plan/itinerary";
import type { SavedTrip } from "@/lib/plans/types";

const day = (iso: string) => iso.slice(0, 10).replaceAll("-", "/");

// 保存した行程の一覧。開くと、その地帯・旅の日・移動手段・出発地に戻して行程を出す
export function SavedTripsList({ trips, error, onOpen, onDelete }: { trips: SavedTrip[]; error: string | null; onOpen: (t: SavedTrip) => void; onDelete: (t: SavedTrip) => void }) {
  if (!trips.length && !error) return null;
  return (
    <section className="border-b border-border px-4 pb-2 pt-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted">💾 保存した行程（{trips.length}）</h2>
      {error && <p className="mt-1 text-xs text-shrine">{error}</p>}
      <ul className="mt-1 divide-y divide-border/60">
        {trips.map((t) => (
          <li key={t.plan_id} className="flex items-center justify-between gap-2 py-1.5">
            <button type="button" onClick={() => onOpen(t)} className="min-h-9 min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="text-[11px] text-muted">
                {t.trip_date ? `${day(t.trip_date)} ・ ` : ""}
                {MODE_LABEL[t.mode] ?? t.mode} ・ {t.area_label} ・ {day(t.updated_at)} 保存
              </span>
            </button>
            <button
              type="button"
              onClick={() => confirm(`「${t.title}」を消しますか？`) && onDelete(t)}
              aria-label={`${t.title}を消す`}
              className="size-8 shrink-0 rounded text-muted hover:bg-background"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 行程の保存。開いている保存済みの行程があれば上書きもできる
export function SaveTrip({ current, suggested, onSave }: { current: SavedTrip | null; suggested: string; onSave: (title: string, asNew: boolean) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const save = async (asNew: boolean, name = title) => {
    setBusy(true);
    const problem = await onSave(name.trim() || suggested, asNew);
    setBusy(false);
    setNote(problem ?? "保存しました。地帯の一覧の「保存した行程」から、どの端末でも開けます");
    if (!problem) setEditing(false);
  };
  return (
    <div className="mt-1.5 text-xs">
      {editing ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={suggested}
            aria-label="行程の名前"
            className="min-h-8 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-sm text-foreground"
          />
          <button type="button" disabled={busy} onClick={() => save(true)} className="inline-flex min-h-8 items-center rounded-full border border-shrine/40 px-2.5 text-shrine disabled:opacity-50">
            {busy ? "保存しています…" : "保存"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-muted underline">
            やめる
          </button>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {current && (
            <button type="button" disabled={busy} onClick={() => save(false, current.title)} className="inline-flex min-h-8 items-center rounded-full border border-shrine/40 px-2.5 text-shrine disabled:opacity-50">
              💾 「{current.title}」に上書き保存
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTitle("");
              setEditing(true);
            }}
            className={current ? "text-museum underline" : "inline-flex min-h-8 items-center rounded-full border border-shrine/40 px-2.5 text-shrine"}
          >
            {current ? "別の名前で保存" : "💾 行程を保存"}
          </button>
          <button type="button" onClick={() => window.print()} className="text-museum underline">
            🖨️ 印刷・PDF
          </button>
        </span>
      )}
      {note && (
        <p role="status" className="mt-1 text-visited">
          {note}
        </p>
      )}
    </div>
  );
}
