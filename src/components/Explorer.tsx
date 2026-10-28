"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_START2, type Mode, type Role, type Stop, optimizeOrder, roleFor, schedule, suggestPlan } from "@/lib/plan/itinerary";
import { KIND } from "@/lib/kinds";
import { DISTANCES, type Origin, fromOrigin, townCenters } from "@/lib/origin";
import { townArea } from "@/lib/townArea";
import type { AreaPlaces, Atlas, Place } from "@/lib/types";
import AreaPlacesPanel, { type PlacesState } from "./AreaPlacesPanel";
import ItineraryPanel from "./ItineraryPanel";
import { LinksProvider } from "./Links";
import TownGuide from "./TownGuide";
import TripSettings from "./TripSettings";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-muted">地図を読み込み中…</div>,
});

const mapsLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// 編集した行程は、この端末のブラウザに地帯ごとに覚えておく
// 3つ目が 1 の地点は、すぐ次の地点とつないである。4つ目は、この地点より後に回る地点の id。start2 は2日目に宿を出る時刻
type SavedPlan = { stops: [string, Role, (0 | 1)?, string[]?][]; start: number; start2?: number };
const PLANS_KEY = "tabisaki:plans";
const DEFAULT_START = 8 * 60;

// 出発地（自宅以外にしたとき）と移動手段も、この端末に覚えておく
const ORIGIN_KEY = "tabisaki:origin";
const MODE_KEY = "tabisaki:mode";
const DATE_KEY = "tabisaki:date";

// 旅の日の既定は、次の土曜（今日が土曜なら今日）
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return ymd(d);
}
// 覚えていた日が過ぎていたら、既定に戻す
const initialDate = () => {
  const saved = readJson<string | null>(DATE_KEY, null);
  return saved && saved >= ymd(new Date()) ? saved : nextSaturday();
};

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境では、開いている間だけ覚える
  }
}

const readPlans = () => readJson<Record<string, SavedPlan>>(PLANS_KEY, {});
const writePlans = (plans: Record<string, SavedPlan>) => writeJson(PLANS_KEY, plans);

const AREA_PLACE = (ap: AreaPlaces) =>
  new Map<string, Place>(
    [...ap.anchors, ...ap.primers, ...(ap.halls ?? []), ...(ap.castles ?? []), ...(ap.lodgings ?? [])].map((p) => [p.id, p]),
  );

// 開きそうな地帯の候補を先に取っておく数。OpenStreetMap に一度にたくさん問い合わせないよう、1つずつ順に取る
const PREFETCH_COUNT = 3;
const NEAR_TOWNS = 8;

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

// 登録した資料のリンクは、地帯の画面・候補・行程のどこからでも使う
export default function Explorer() {
  return (
    <LinksProvider>
      <ExplorerView />
    </LinksProvider>
  );
}

function ExplorerView() {
  const [data, setData] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [maxKm, setMaxKm] = useState(() => {
    const m = typeof window === "undefined" ? "car" : readJson<Mode>(MODE_KEY, "car");
    return DISTANCES[m][m === "car" ? 0 : 1].km;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 地帯ごとの神社・資料館の候補。開いたときに一度だけ取りに行く
  const [places, setPlaces] = useState<Record<string, NonNullable<PlacesState>>>({});
  const [focus, setFocus] = useState<Place | null>(null);
  const [tab, setTab] = useState<"plan" | "places">("plan");
  const [plans, setPlans] = useState<Record<string, SavedPlan>>(() => (typeof window === "undefined" ? {} : readPlans()));
  // null なら自宅から出る
  const [away, setAway] = useState<Origin | null>(() => (typeof window === "undefined" ? null : readJson<Origin | null>(ORIGIN_KEY, null)));
  const [tripDate, setTripDate] = useState<string>(() => (typeof window === "undefined" ? "" : initialDate()));
  const chooseDate = (d: string) => {
    if (!d) return;
    setTripDate(d);
    writeJson(DATE_KEY, d);
  };
  // サーバーで組むときは今日がわからないので、日付は空のまま（その間は例祭の印を付けない）
  const trip = useMemo(() => {
    const [y, m, d] = (tripDate || "1970-01-01").split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [tripDate]);
  const [mode, setMode] = useState<Mode>(() => (typeof window === "undefined" ? "car" : readJson<Mode>(MODE_KEY, "car")));
  const chooseOrigin = (o: Origin | null) => {
    setAway(o);
    writeJson(ORIGIN_KEY, o);
  };
  // 移動手段を変えたら、距離の絞り込みもその手段の幅に合わせる
  const chooseMode = (m: Mode) => {
    setMode(m);
    writeJson(MODE_KEY, m);
    if (!DISTANCES[m].some((d) => d.km === maxKm)) setMaxKm(DISTANCES[m][1]?.km ?? DISTANCES[m][0].km);
  };

  const load = () => fetchAtlas().then(setData, (e: Error) => setError(e.message));

  useEffect(() => {
    fetchAtlas().then(setData, (e: Error) => setError(e.message));
  }, []);

  // 取りに行っている最中の地帯。先読みと、開いたときの読み込みが重ならないようにする
  const inflight = useRef(new Map<string, Promise<void>>());
  const loadPlaces = (areaId: string) => {
    const running = inflight.current.get(areaId);
    if (running) return running;
    const p = fetchPlaces(areaId)
      .then((r) => setPlaces((prev) => ({ ...prev, [areaId]: r })))
      .finally(() => inflight.current.delete(areaId));
    inflight.current.set(areaId, p);
    return p;
  };
  // 候補はその場で OpenStreetMap に問い合わせるので、はじめて開く地帯は待たされる。
  // 地図を出したら、近い地帯から順に裏で取っておく
  const home = useMemo(() => data?.summary.home ?? ([135.5157, 34.7617] as [number, number]), [data]);
  const origin = useMemo<Origin>(() => away ?? { kind: "home", label: "自宅", at: home }, [away, home]);
  const centers = useMemo(() => (data ? townCenters(data) : []), [data]);
  // 出発地からの距離で、地帯と町を近い順に並べ直す
  const near = useMemo(() => (data ? fromOrigin(data, centers, origin.at) : null), [data, centers, origin]);
  const areas = useMemo(() => (near?.areas ?? []).filter((a) => a.km < maxKm), [near, maxKm]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const a of areas.slice(0, PREFETCH_COUNT)) {
        if (cancelled) return;
        await loadPlaces(a.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [areas]);
  // 一覧で指を置いた・カーソルを乗せた地帯も先に取りに行く
  const warm = (areaId: string) => {
    if (!places[areaId]) loadPlaces(areaId);
  };
  const retryPlaces = (areaId: string) => {
    setPlaces((prev) => {
      const next = { ...prev };
      delete next[areaId];
      return next;
    });
    loadPlaces(areaId);
  };

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

  // 地図の町名から、地帯に入っていない町を1つだけ開くこともある
  const townHere = (id: string) => {
    const t = townArea(data!, id);
    if (!t || !near) return t;
    const km = near.km.get(t.towns[0].id) ?? t.km;
    return { ...t, km, towns: t.towns.map((x) => ({ ...x, km })) };
  };
  const selected = data && selectedId ? (near?.areas.find((a) => a.id === selectedId) ?? townHere(selectedId)) : null;
  const selectedPlaces = selectedId ? places[selectedId] : undefined;
  const from = origin.at;
  const loaded = selectedPlaces && !("error" in selectedPlaces) ? selectedPlaces : null;

  // 保存した行程があればそれを、なければ本命の候補の一番目から組んだ行程を出す
  const saved = loaded ? plans[loaded.areaId] : undefined;
  const start = saved?.start ?? DEFAULT_START;
  const start2 = saved?.start2 ?? DEFAULT_START2;
  const stops: Stop[] = !loaded
    ? []
    : saved
      ? saved.stops.flatMap(([id, role, link, before]) => {
          const place = AREA_PLACE(loaded).get(id);
          return place ? [{ place, role, linkNext: link === 1, before }] : [];
        })
      : suggestPlan(loaded, from, undefined, start, mode);
  const plan = loaded ? schedule(stops, from, start, start2, mode) : null;

  const savePlan = (next: Stop[] | null, nextStart = start, nextStart2 = start2) => {
    if (!loaded) return;
    setPlans((prev) => {
      const all = { ...prev };
      if (next) all[loaded.areaId] = { stops: next.map((s) => (s.before?.length
              ? [s.place.id, s.role, s.linkNext ? 1 : 0, s.before]
              : s.linkNext
                ? [s.place.id, s.role, 1]
                : [s.place.id, s.role])), start: nextStart, start2: nextStart2 };
      else delete all[loaded.areaId];
      writePlans(all);
      return all;
    });
  };
  // 外すときは、前の地点からのつながりも切る
  const without = (list: Stop[], drop: (s: Stop) => boolean) =>
    list.flatMap((s, k) => (drop(s) ? [] : k + 1 < list.length && drop(list[k + 1]) ? [{ ...s, linkNext: false }] : [s]));
  // 足したら、全体を運転がいちばん短くなる順に組み直す。行程にあれば外す。宿は1か所だけで、選び直すと入れ替わる
  const togglePlace = (p: Place) => {
    if (stops.some((s) => s.place.id === p.id)) return savePlan(without(stops, (s) => s.place.id === p.id));
    const role = roleFor(p, stops);
    const base = role === "stay" ? without(stops, (s) => s.role === "stay") : stops;
    savePlan(optimizeOrder([...base, { place: p, role }], from, start, start2, mode));
  };
  // 本命を選び直しても、決めてある宿はそのまま残す
  const makeAnchor = (p: Place) => {
    if (!loaded) return;
    const stay = stops.find((s) => s.role === "stay");
    const next = suggestPlan(loaded, from, p.id, start, mode);
    savePlan(stay ? optimizeOrder([...next, { place: stay.place, role: "stay" }], from, start, start2, mode) : next);
  };
  const reorder = () => {
    const next = optimizeOrder(stops, from, start, start2, mode);
    const changed = next.some((s, i) => s.place.id !== stops[i].place.id);
    savePlan(next);
    return changed;
  };
  const planIds = new Set(stops.map((s) => s.place.id));
  const anchorId = stops.find((s) => s.role === "anchor")?.place.id ?? null;
  const selectArea = (id: string | null) => {
    setSelectedId(id);
    setTab("plan");
  };

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
      {/* スマホでは、地帯を開いたら地図を少し縮めて行程と候補に場所を譲る */}
      <section className={`relative shrink-0 md:order-2 md:h-full md:flex-1 ${selected ? "h-[40dvh]" : "h-[55dvh]"}`}>
        {data ? (
          <MapView
            atlas={data}
            areaIds={areas.map((a) => a.id)}
            origin={origin}
            selected={selected}
            places={loaded}
            trip={trip}
            route={plan && plan.stops.length > 0 ? { home: from, stops: plan.stops } : null}
            focus={focus}
            onSelectArea={selectArea}
            planIds={planIds}
            anchorId={anchorId}
            onTogglePlace={togglePlace}
            onMakeAnchor={makeAnchor}
          />
        ) : (
          <div className="grid h-full place-items-center text-muted">読み込み中…</div>
        )}
      </section>

      <aside className="flex min-h-0 flex-1 flex-col border-border bg-surface md:order-1 md:w-[380px] md:flex-none md:border-r">
        {selected ? (
          // 地帯を選んだら、一覧の代わりにその地帯の画面を出す。行程と候補はタブで切り替える
          <>
            <header className="border-b border-border px-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectArea(null)}
                  className="min-h-10 shrink-0 rounded-full px-2 text-sm text-museum hover:bg-background"
                  aria-label="地帯の一覧へ戻る"
                >
                  ← 一覧
                </button>
                <h2 className="min-w-0 flex-1 truncate font-semibold">{selected.label}</h2>
                <span className="shrink-0 text-xs text-muted">
                  {selected.towns.length}町 ・ {selected.km}km〜
                </span>
              </div>
              <div className="mt-1 flex" role="tablist">
                {(
                  [
                    ["plan", `行程${stops.length ? `（${stops.length}）` : ""}`],
                    ["places", "候補"],
                  ] as const
                ).map(([key, text]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`min-h-10 flex-1 border-b-2 text-sm ${
                      tab === key ? "border-area font-semibold text-foreground" : "border-transparent text-muted"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
              {tab === "plan" ? (
                plan ? (
                  <ItineraryPanel
                    plan={plan}
                    home={from}
                    origin={origin}
                    mode={mode}
                    onMode={chooseMode}
                    tripDate={tripDate}
                    trip={trip}
                    onDate={chooseDate}
                    onChange={(next) => savePlan(next)}
                    onStart={(min) => savePlan(stops, min)}
                    onStart2={(min) => savePlan(stops, start, min)}
                    onReset={() => savePlan(null)}
                    onOptimize={reorder}
                    onFocus={setFocus}
                  />
                ) : (
                  <AreaPlacesPanel state={selectedPlaces} trip={trip} onRetry={() => retryPlaces(selected.id)} onFocus={setFocus} planIds={planIds} anchorId={anchorId} onToggle={togglePlace} onMakeAnchor={makeAnchor} />
                )
              ) : (
                <>
                  <AreaPlacesPanel
                    state={selectedPlaces}
                    trip={trip}
                    planIds={planIds}
                    anchorId={anchorId}
                    onToggle={togglePlace}
                    onMakeAnchor={makeAnchor}
                    onRetry={() => retryPlaces(selected.id)}
                    onFocus={setFocus}
                  />
                  <p className="mt-4 text-sm">
                    <a
                      className="text-museum underline"
                      href={mapsLink(`${selected.towns[0].pref}${selected.towns[0].name} 神社`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ほかの神社もGoogleマップで見る
                    </a>
                  </p>
                </>
              )}
              <TownGuide
                towns={selected.towns}
                title={near?.areas.some((a) => a.id === selected.id) ? "この地帯のまだ行っていない町" : "この町"}
              />
            </div>
          </>
        ) : (
          <>
            <header className="border-b border-border px-4 pb-3 pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h1 className="flex items-center gap-2 text-lg font-semibold">
                  {/* 朱印のような「旅」の印 */}
                  <span aria-hidden className="grid size-7 rotate-[-4deg] place-items-center rounded-[4px] border-2 border-shrine text-sm font-bold text-shrine">
                    旅
                  </span>
                  次はどこへ
                </h1>
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
                  {data.summary.municipalities.toLocaleString()} ・ {origin.kind === "home" ? "" : `${origin.label}から`}
                  {maxKm < 5000 ? `${maxKm}km圏` : "全国"}の未訪問{" "}
                  <strong className="text-foreground">{near?.towns.filter((t) => !t.visited && t.km < maxKm).length}</strong> 町
                </p>
              )}
              {/* 出発地・移動手段・旅の日はこの端末に覚えた値を使うので、地図のデータが届いて（ブラウザで）から出す */}
              {data && (
                <>
                  <TripSettings
                    origin={origin}
                    mode={mode}
                    tripDate={tripDate}
                    onDate={chooseDate}
                    centers={centers}
                    onOrigin={chooseOrigin}
                    onMode={chooseMode}
                  />
                  <div className="mt-3 flex gap-2" role="group" aria-label={`${origin.label}からの距離`}>
                    {DISTANCES[mode].map((d) => (
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
                </>
              )}
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                <li className="flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-sm bg-visited/60" />
                  行った町
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-sm bg-area/40" />
                  まだの町がまとまる地帯
                </li>
                {(["shrine", "museum", "art", "castle", "lodging"] as const).map((k) => (
                  <li key={k}>
                    {KIND[k].icon} {KIND[k].label}
                  </li>
                ))}
                <li>🏮 旅の日に例祭</li>
              </ul>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <h2 className="px-4 pb-1 pt-3 text-xs font-semibold tracking-wide text-muted">
                まだ行っていない町がまとまっている地帯（{areas.length}）
              </h2>
              <ol>
                {areas.map((a) => (
                  <li key={a.id} className="border-b border-border">
                    <button
                      type="button"
                      onClick={() => selectArea(a.id)}
                      onPointerEnter={() => warm(a.id)}
                      onTouchStart={() => warm(a.id)}
                      className="flex min-h-12 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-background"
                    >
                      <span>
                        <span className="font-medium">{a.label}</span>
                        <span className="ml-2 text-xs text-muted">{a.pref.join("・")}</span>
                        {plans[a.id] && <span className="ml-2 rounded bg-shrine/10 px-1 text-[11px] text-shrine">行程あり</span>}
                      </span>
                      <span className="shrink-0 text-sm text-muted">
                        {a.towns.length}町 ・ {a.km}km〜
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {/* 出先や、歩き・自転車では、行ったことのある町にもまだの場所があるので、近い町をそのまま開けるようにする */}
              {(origin.kind !== "home" || mode === "walk" || mode === "bike") && near && (
                <>
                  <h2 className="px-4 pb-1 pt-4 text-xs font-semibold tracking-wide text-muted">{origin.label}のまわりの町</h2>
                  <ul className="flex flex-wrap gap-1.5 px-4 pb-4">
                    {near.towns.slice(0, NEAR_TOWNS).map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => selectArea(t.area && t.area !== "null" ? t.area : `town-${t.id}`)}
                          className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm hover:bg-background ${t.visited ? "border-visited/50" : "border-area/60"}`}
                        >
                          {t.short}
                          <span className="ml-1 text-xs text-muted">
                            {t.km}km{t.visited ? " ・ 行った町" : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </main>
  );
}
