"use client";

import type { AreaPlaces, En, Place, Visit } from "@/lib/types";

export type PlacesState = AreaPlaces | { error: string } | undefined;

const KIND_LABEL: Record<Place["kind"], string> = { shrine: "神社", museum: "資料館・博物館", art: "美術館", castle: "城・城跡", info: "観光案内所" };
const DOT: Record<Place["kind"], string> = { shrine: "bg-shrine", museum: "bg-museum", art: "bg-art", castle: "bg-castle", info: "bg-museum" };

const mapsLink = (p: Place) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.town}`)}`;

function PlaceName({ place }: { place: Place }) {
  return (
    <a href={place.wikipedia ?? mapsLink(place)} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
      {place.name}
    </a>
  );
}

// 系統・祭神と、これまでの参拝とのつながりを短い文にする
const visitText = (v: Visit) => `${v.name}${v.town ? `（${v.town}）` : ""} ${v.date}`;

function EnNote({ en }: { en: En }) {
  const lines: string[] = [];
  const l = en.lineage;
  if (l) {
    if (l.isHonsha) lines.push(`${l.family}系の総本社・本源とされる社`);
    else if (l.honshaVisited) lines.push(`${l.family}系。本源の${l.honshaVisited}には参拝済み`);
    else lines.push(`${l.family}系。本源は${l.honsha}（未訪問）`);
    if (l.visitedCount > 0) lines.push(`これまで同じ系統の社を${l.visitedCount}社訪問。最近は${visitText(l.recent[0])}`);
    if (l.alsoHere.length > 0) lines.push(`この地帯にも ${l.alsoHere.join("・")}`);
  }
  if (en.deities.length > 0) {
    lines.push(`祭神: ${en.deities.map((d) => d.name).join("・")}`);
    for (const d of en.deities.filter((d) => d.visitedCount > 0)) {
      lines.push(`${d.name}を祀る社に${d.visitedCount}社参拝済み（${d.recent.map(visitText).join("、")}${d.visitedCount > d.recent.length ? " など" : ""}）`);
    }
  }
  return (
    <div className="mt-1.5 border-l-2 border-shrine/40 pl-2 text-xs text-muted">
      <span className="font-medium text-foreground">縁</span>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

type Props = {
  state: PlacesState;
  onRetry: () => void;
  onFocus: (p: Place) => void;
  // 行程の編集
  planIds: Set<string>;
  anchorId: string | null;
  onToggle: (p: Place) => void;
  onMakeAnchor: (p: Place) => void;
};

type PlanProps = Pick<Props, "planIds" | "anchorId" | "onToggle" | "onMakeAnchor">;

// 指で押しやすいよう、ボタンは高さを取る
const BTN = "inline-flex min-h-8 items-center rounded-full border px-2.5";

function PlanButtons({ place, planIds, anchorId, onToggle, onMakeAnchor }: PlanProps & { place: Place }) {
  if (place.id === anchorId) return <span className="shrink-0 text-xs font-medium text-shrine">本命</span>;
  const inPlan = planIds.has(place.id);
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1.5 text-xs">
      {place.kind !== "info" && (
        <button type="button" onClick={() => onMakeAnchor(place)} className={`${BTN} border-shrine/40 text-shrine`}>
          本命にする
        </button>
      )}
      <button
        type="button"
        onClick={() => onToggle(place)}
        className={`${BTN} ${inPlan ? "border-border text-muted" : "border-museum/40 text-museum"}`}
      >
        {inPlan ? "行程から外す" : "＋行程"}
      </button>
    </span>
  );
}

function PlaceRow({ place, onFocus, ...plan }: PlanProps & { place: Place; onFocus: (p: Place) => void }) {
  return (
    <li className="flex items-start justify-between gap-2 py-1.5">
      <span className="min-w-0">
        <span className={`mr-1.5 inline-block size-2 rounded-full ${DOT[place.kind]}`} />
        <PlaceName place={place} />
        <span className="ml-1.5 text-xs text-muted">
          {KIND_LABEL[place.kind]} ・ {place.town}
        </span>{" "}
        <button type="button" onClick={() => onFocus(place)} className="text-xs text-museum underline">
          地図
        </button>
        {place.reasons.length > 0 && (
          <span className="ml-1.5 text-[11px] text-muted">{place.reasons.join("・")}</span>
        )}
      </span>
      <PlanButtons place={place} {...plan} />
    </li>
  );
}

export default function AreaPlacesPanel({ state, onRetry, onFocus, ...plan }: Props) {
  if (!state) return <p className="mt-3 text-sm text-muted">この地帯の神社と資料館を探しています…</p>;
  if ("error" in state) {
    return (
      <p className="mt-3 text-sm text-muted">
        候補を探せませんでした（{state.error}）{" "}
        <button type="button" onClick={onRetry} className="text-museum underline">
          もう一度
        </button>
      </p>
    );
  }

  const { anchors, primers, halls = [], castles = [], shrineCount, source } = state;
  const infos = primers.filter((p) => p.kind === "info");
  return (
    <div className="mt-4 space-y-4">
      <section>
        <h3 className="text-xs font-semibold tracking-wide text-muted">
          神社（地帯の {shrineCount} 社から）
        </h3>
        {anchors.length === 0 ? (
          <p className="mt-1 text-sm text-muted">名前のわかる神社が見つかりませんでした。</p>
        ) : (
          <ol className="mt-1 space-y-2">
            {anchors.map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="mr-1.5 inline-block size-2 rounded-full bg-shrine" />
                    <PlaceName place={a} />
                    <span className="ml-1.5 text-xs text-muted">{a.town}</span>
                  </span>
                  <button type="button" onClick={() => onFocus(a)} className="shrink-0 text-xs text-museum underline">
                    地図
                  </button>
                </div>
                <div className="mt-1 flex justify-end">
                  <PlanButtons place={a} {...plan} />
                </div>
                {a.reasons.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {a.reasons.map((r) => (
                      <li key={r} className="rounded bg-shrine/10 px-1.5 text-[11px] text-shrine">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
                {a.en && <EnNote en={a.en} />}
                {a.primer && (
                  <p className="mt-1.5 text-xs text-muted">
                    先に{" "}
                    <button type="button" onClick={() => onFocus(a.primer!.place)} className="text-museum underline">
                      {a.primer.place.name}
                    </button>{" "}
                    で予習 → 本命へ（約 {a.primer.km} km）
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold tracking-wide text-muted">博物館・美術館・資料館</h3>
        {halls.length === 0 ? (
          <p className="mt-1 text-sm text-muted">地帯の中には見つかりませんでした。隣の町を探すのがよさそうです。</p>
        ) : (
          <ul className="mt-1 divide-y divide-border text-sm">
            {halls.map((p) => (
              <PlaceRow key={p.id} place={p} onFocus={onFocus} {...plan} />
            ))}
          </ul>
        )}
      </section>

      {castles.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted">城・城跡</h3>
          <ul className="mt-1 divide-y divide-border text-sm">
            {castles.map((p) => (
              <PlaceRow key={p.id} place={p} onFocus={onFocus} {...plan} />
            ))}
          </ul>
        </section>
      )}

      {infos.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted">観光案内所</h3>
          <ul className="mt-1 divide-y divide-border text-sm">
            {infos.map((p) => (
              <PlaceRow key={p.id} place={p} onFocus={onFocus} {...plan} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-[11px] text-muted">出典: {source}。社格などは名前と登録情報からの推定です。</p>
    </div>
  );
}
