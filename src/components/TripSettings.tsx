"use client";

import { useState } from "react";
import { MODE_LABEL, type Mode } from "@/lib/plan/itinerary";
import { type Origin, kmBetween, matchTowns, type townCenters } from "@/lib/origin";

const MODES: { mode: Mode; icon: string }[] = [
  { mode: "car", icon: "🚗" },
  { mode: "train", icon: "🚃" },
  { mode: "bike", icon: "🚲" },
  { mode: "walk", icon: "🚶" },
];

type Props = {
  origin: Origin;
  mode: Mode;
  centers: ReturnType<typeof townCenters>;
  // null で自宅に戻す
  onOrigin: (o: Origin | null) => void;
  onMode: (m: Mode) => void;
};

const chip = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-sm ${on ? "border-foreground bg-foreground text-surface" : "border-border text-foreground hover:bg-background"}`;

// どこから出るか（自宅・今いる場所・探した地名）と、何で回るか
export default function TripSettings({ origin, mode, centers, onOrigin, onMode }: Props) {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Origin[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const nearestTown = (at: [number, number]) =>
    centers.reduce<{ name: string; km: number } | null>((best, c) => {
      const km = kmBetween(at, c.at);
      return !best || km < best.km ? { name: c.p.short, km } : best;
    }, null)?.name;

  const useHere = () => {
    if (!navigator.geolocation) return setStatus("この端末では現在地を使えません");
    setStatus("現在地を調べています…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const at: [number, number] = [coords.longitude, coords.latitude];
        const town = nearestTown(at);
        onOrigin({ kind: "here", label: town ? `現在地（${town}付近）` : "現在地", at });
        setStatus(null);
        setSearching(false);
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? "位置情報の利用が許可されていません" : "現在地を取得できませんでした"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  };

  // 町の名前はその場で候補に出し、駅や施設・住所は「探す」で問い合わせる
  const search = async () => {
    if (!q.trim()) return;
    setStatus("探しています…");
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
      const body = (await res.json()) as { hits: { label: string; at: [number, number] }[] };
      setHits(body.hits.map((h) => ({ kind: "place", label: h.label, at: h.at })));
      setStatus(body.hits.length ? null : "見つかりませんでした。町の名前でも探せます");
    } catch {
      setStatus("探せませんでした");
    }
  };
  const pick = (o: Origin) => {
    onOrigin(o);
    setSearching(false);
    setQ("");
    setHits(null);
    setStatus(null);
  };
  const suggestions = [...(hits ?? []), ...matchTowns(centers, q)].filter(
    (o, i, all) => all.findIndex((x) => x.label === o.label) === i,
  );

  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="出発地">
        <span className="mr-1 text-xs text-muted">出発</span>
        <button type="button" className={chip(origin.kind === "home")} aria-pressed={origin.kind === "home"} onClick={() => onOrigin(null)}>
          🏠 自宅
        </button>
        <button type="button" className={chip(origin.kind === "here")} aria-pressed={origin.kind === "here"} onClick={useHere}>
          📍 {origin.kind === "here" ? origin.label : "現在地"}
        </button>
        <button
          type="button"
          className={chip(origin.kind === "place" || searching)}
          aria-expanded={searching}
          onClick={() => setSearching((v) => !v)}
        >
          🔎 {origin.kind === "place" ? origin.label : "地名で"}
        </button>
      </div>
      {searching && (
        <div className="rounded-lg border border-border p-2">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHits(null);
              }}
              placeholder="出張先の駅・ホテル・町の名前"
              aria-label="出発地を探す"
              className="min-h-9 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-foreground"
              autoFocus
            />
            <button type="submit" className="min-h-9 shrink-0 rounded-full border border-museum px-3 text-museum">
              探す
            </button>
          </form>
          {suggestions.length > 0 && (
            <ul className="mt-1.5">
              {suggestions.map((o) => (
                <li key={`${o.label}@${o.at.join(",")}`}>
                  <button type="button" onClick={() => pick(o)} className="min-h-9 w-full rounded px-2 text-left hover:bg-background">
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {status && (
        <p role="status" className="text-xs text-muted">
          {status}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="移動手段">
        <span className="mr-1 text-xs text-muted">移動</span>
        {MODES.map((m) => (
          <button key={m.mode} type="button" className={chip(mode === m.mode)} aria-pressed={mode === m.mode} onClick={() => onMode(m.mode)}>
            {m.icon} {MODE_LABEL[m.mode]}
          </button>
        ))}
      </div>
    </div>
  );
}
