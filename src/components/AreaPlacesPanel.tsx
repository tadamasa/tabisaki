"use client";

import type { AreaPlaces, Place } from "@/lib/types";

export type PlacesState = AreaPlaces | { error: string } | undefined;

const KIND_LABEL: Record<Place["kind"], string> = { shrine: "神社", museum: "資料館・博物館", info: "観光案内所" };

const mapsLink = (p: Place) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.town}`)}`;

function PlaceName({ place }: { place: Place }) {
  return (
    <a href={place.wikipedia ?? mapsLink(place)} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
      {place.name}
    </a>
  );
}

type Props = { state: PlacesState; onRetry: () => void; onFocus: (p: Place) => void };

export default function AreaPlacesPanel({ state, onRetry, onFocus }: Props) {
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

  const { anchors, primers, shrineCount, source } = state;
  return (
    <div className="mt-4 space-y-4">
      <section>
        <h3 className="text-xs font-semibold tracking-wide text-muted">
          本命の候補（地帯の神社 {shrineCount} 社から）
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
                {a.reasons.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {a.reasons.map((r) => (
                      <li key={r} className="rounded bg-shrine/10 px-1.5 text-[11px] text-shrine">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
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
        <h3 className="text-xs font-semibold tracking-wide text-muted">先に寄る資料館・案内所</h3>
        {primers.length === 0 ? (
          <p className="mt-1 text-sm text-muted">地帯の中には見つかりませんでした。隣の町の資料館を探すのがよさそうです。</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {primers.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-2">
                <span>
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-museum" />
                  <PlaceName place={p} />
                  <span className="ml-1.5 text-xs text-muted">
                    {KIND_LABEL[p.kind]} ・ {p.town}
                  </span>
                </span>
                <button type="button" onClick={() => onFocus(p)} className="shrink-0 text-xs text-museum underline">
                  地図
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11px] text-muted">出典: {source}。社格などは名前と登録情報からの推定です。</p>
    </div>
  );
}
