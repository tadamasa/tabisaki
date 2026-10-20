"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { type Role, type Stop, optimizeOrder, schedule, suggestPlan } from "@/lib/plan/itinerary";
import type { AreaPlaces, Atlas, Place } from "@/lib/types";
import AreaPlacesPanel, { type PlacesState } from "./AreaPlacesPanel";
import ItineraryPanel from "./ItineraryPanel";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-muted">地図を読み込み中…</div>,
});

const DISTANCES = [
  { km: 100, label: "100km" },
  { km: 200, label: "200km" },
  { km: 300, label: "300km" },
  { km: 5000, label: "全国" },
];

const mapsLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const wikiLink = (q: string) => `https://ja.wikipedia.org/wiki/${encodeURIComponent(q)}`;

// 編集した行程は、この端末のブラウザに地帯ごとに覚えておく
type SavedPlan = { stops: [string, Role][]; start: number };
const PLANS_KEY = "tabisaki:plans";
const DEFAULT_START = 8 * 60;

function readPlans(): Record<string, SavedPlan> {
  try {
    return JSON.parse(localStorage.getItem(PLANS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writePlans(plans: Record<string, SavedPlan>) {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch {
    // 保存できない環境では、開いている間だけ覚える
  }
}

const AREA_PLACE = (ap: AreaPlaces) => new Map<string, Place>([...ap.anchors, ...ap.primers].map((p) => [p.id, p]));

async function fetchPlaces(areaId: string): Promise<NonNullable<PlacesState>> {
  try {
    const res = await fetch(`/api/areas/${encodeURIComponent(areaId)}/places`);
    const body = await res.json();
    return res.ok ? body : { error: body.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchAtlas(): Promise<Atlas> {
  const res = await fetch("/api/atlas", { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export default function Explorer() {
  const [data, setData] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [maxKm, setMaxKm] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 地帯ごとの神社・資料館の候補。開いたときに一度だけ取りに行く
  const [places, setPlaces] = useState<Record<string, NonNullable<PlacesState>>>({});
  const [focus, setFocus] = useState<Place | null>(null);
  const [plans, setPlans] = useState<Record<string, SavedPlan>>(() => (typeof window === "undefined" ? {} : readPlans()));

  const load = () => fetchAtlas().then(setData, (e: Error) => setError(e.message));

  useEffect(() => {
    fetchAtlas().then(setData, (e: Error) => setError(e.message));
  }, []);

  const loadPlaces = (areaId: string) =>
    fetchPlaces(areaId).then((r) => setPlaces((prev) => ({ ...prev, [areaId]: r })));

  useEffect(() => {
    if (selectedId && !places[selectedId]) loadPlaces(selectedId);
    // places の変化では取り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 縁泉に記録を足したあと、スプレッドシートを読み直す
  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/atlas/refresh", { method: "POST" });
      setData(null);
      setPlaces({});
      await load();
      // 開いたままの地帯は、その場で候補を取り直す
      if (selectedId) loadPlaces(selectedId);
    } finally {
      setRefreshing(false);
    }
  };

  const areas = useMemo(
    () => (data?.areas ?? []).filter((a) => a.km < maxKm),
    [data, maxKm],
  );
  const selected = data?.areas.find((a) => a.id === selectedId) ?? null;
  const selectedPlaces = selectedId ? places[selectedId] : undefined;
  const home = data?.summary.home ?? ([135.5157, 34.7617] as [number, number]);
  const loaded = selectedPlaces && !("error" in selectedPlaces) ? selectedPlaces : null;

  // 保存した行程があればそれを、なければ本命の候補の一番目から組んだ行程を出す
  const saved = loaded ? plans[loaded.areaId] : undefined;
  const start = saved?.start ?? DEFAULT_START;
  const stops: Stop[] = !loaded
    ? []
    : saved
      ? saved.stops.flatMap(([id, role]) => {
          const place = AREA_PLACE(loaded).get(id);
          return place ? [{ place, role }] : [];
        })
      : suggestPlan(loaded, home, undefined, start);
  const plan = loaded ? schedule(stops, home, start) : null;

  const savePlan = (next: Stop[] | null, nextStart = start) => {
    if (!loaded) return;
    setPlans((prev) => {
      const all = { ...prev };
      if (next) all[loaded.areaId] = { stops: next.map((s) => [s.place.id, s.role]), start: nextStart };
      else delete all[loaded.areaId];
      writePlans(all);
      return all;
    });
  };
  // 足したら、全体をいちばん早く帰れる順に組み直す。社はゆかり、資料館・案内所は予習として入れる
  const addToPlan = (p: Place) =>
    savePlan(optimizeOrder([...stops, { place: p, role: p.kind === "shrine" ? "kin" : "primer" }], home, start));

  if (error) {
    return (
      <main className="grid h-dvh place-items-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold">訪問データを読み込めませんでした</h1>
          <p className="text-muted">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              load();
            }}
            className="min-h-10 rounded-full border border-border px-4"
          >
            もう一度読み込む
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col md:flex-row">
      <section className="relative h-[55dvh] shrink-0 md:order-2 md:h-full md:flex-1">
        {data ? (
          <MapView
            atlas={data}
            maxKm={maxKm}
            selected={selected}
            places={loaded}
            route={plan && plan.stops.length > 0 ? { home, stops: plan.stops } : null}
            focus={focus}
            onSelectArea={setSelectedId}
          />
        ) : (
          <div className="grid h-full place-items-center text-muted">読み込み中…</div>
        )}
      </section>

      <aside className="flex min-h-0 flex-1 flex-col border-border bg-surface md:order-1 md:w-[380px] md:flex-none md:border-r">
        <header className="border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-lg font-semibold">次はどこへ</h1>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="text-xs text-museum underline disabled:text-muted disabled:no-underline"
            >
              {refreshing ? "読み込み中…" : "縁泉の最新の記録を読む"}
            </button>
          </div>
          {data && (
            <p className="mt-1 text-sm text-muted">
              記録のある町 <strong className="text-foreground">{data.summary.visited}</strong> /{" "}
              {data.summary.municipalities.toLocaleString()} ・ 100km圏の未訪問{" "}
              <strong className="text-foreground">{data.summary.unvisitedByBand[0].count}</strong> 町
            </p>
          )}
          <div className="mt-3 flex gap-2" role="group" aria-label="自宅からの距離">
            {DISTANCES.map((d) => (
              <button
                key={d.km}
                type="button"
                onClick={() => setMaxKm(d.km)}
                aria-pressed={maxKm === d.km}
                className={`min-h-9 rounded-full border px-3 text-sm ${
                  maxKm === d.km
                    ? "border-area bg-area text-white"
                    : "border-border text-foreground hover:bg-background"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-visited/60" />
              行った町
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-area/40" />
              まだの町がまとまる地帯
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-shrine" />
              神社
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-museum" />
              資料館
            </li>
          </ul>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <h2 className="px-4 pb-1 pt-3 text-xs font-semibold tracking-wide text-muted">
            まだ行っていない町がまとまっている地帯（{areas.length}）
          </h2>
          <ol>
            {areas.map((a) => {
              const isOpen = a.id === selectedId;
              return (
                <li key={a.id} className="border-b border-border">
                  <button
                    type="button"
                    onClick={() => setSelectedId(isOpen ? null : a.id)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left ${
                      isOpen ? "bg-area/10" : "hover:bg-background"
                    }`}
                  >
                    <span>
                      <span className="font-medium">{a.label}</span>
                      <span className="ml-2 text-xs text-muted">{a.pref.join("・")}</span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {a.towns.length}町 ・ {a.km}km〜
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <ul className="flex flex-wrap gap-1.5">
                        {a.towns.map((t) => (
                          <li key={t.id}>
                            <a
                              href={wikiLink(t.name.match(/[市区町村]$/) ? t.name : `${t.pref}${t.name}`)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-8 items-center rounded-full border border-border px-2.5 text-sm hover:border-area"
                            >
                              {t.name}
                              <span className="ml-1 text-xs text-muted">{t.km}km</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                      {plan && (
                        <ItineraryPanel
                          plan={plan}
                          home={home}
                          onChange={(next) => savePlan(next)}
                          onStart={(min) => savePlan(stops, min)}
                          onReset={() => savePlan(null)}
                          onOptimize={() => savePlan(optimizeOrder(stops, home, start))}
                          onFocus={setFocus}
                        />
                      )}
                      <AreaPlacesPanel
                        state={selectedPlaces}
                        planIds={new Set(stops.map((s) => s.place.id))}
                        anchorId={stops.find((s) => s.role === "anchor")?.place.id ?? null}
                        onAdd={addToPlan}
                        onMakeAnchor={(p) => loaded && savePlan(optimizeOrder(suggestPlan(loaded, home, p.id, start), home, start))}
                        onRetry={() => {
                          setPlaces((prev) => {
                            const next = { ...prev };
                            delete next[a.id];
                            return next;
                          });
                          loadPlaces(a.id);
                        }}
                        onFocus={setFocus}
                      />
                      <p className="mt-3 text-sm">
                        <a
                          className="text-museum underline"
                          href={mapsLink(`${a.towns[0].pref}${a.towns[0].name} 神社`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ほかの神社もGoogleマップで見る
                        </a>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    </main>
  );
}
