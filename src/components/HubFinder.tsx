"use client";

import { useState } from "react";
import type { Hub, HubKind } from "@/lib/google/places";
import { kmBetween } from "@/lib/origin";
import type { Place } from "@/lib/types";

const LABEL: Record<HubKind, { find: string; pick: string; none: string }> = {
  rental: { find: "近くのレンタカーを探す", pick: "ここで借りる", none: "15km 以内にレンタカーの店が見つかりませんでした" },
  parking: { find: "🅿️ 近くに停めて歩く", pick: "ここに停める", none: "1km 以内に駐車場が見つかりませんでした" },
};

const toPlace = (h: Hub, kind: HubKind): Place => ({
  id: `g:${h.id}`,
  kind: kind === "rental" ? "rental" : "parking",
  name: h.name,
  lat: h.lat,
  lng: h.lng,
  town: h.address,
  score: 0,
  reasons: [],
  wikipedia: null,
  website: null,
});

// Google で、レンタカーの店（地帯のまん中から）や駐車場（地点から）を近い順に探して選ぶ
export default function HubFinder({ kind, near, onPick, compact }: { kind: HubKind; near: Place; onPick: (p: Place) => void; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | Hub[] | { error: string }>("idle");
  const find = async () => {
    setState("loading");
    try {
      const q = new URLSearchParams({ kind, lat: String(near.lat), lng: String(near.lng) });
      const res = await fetch(`/api/google/hubs?${q}`);
      const body = (await res.json()) as { hubs?: Hub[]; error?: string };
      setState(res.ok && body.hubs ? body.hubs : { error: body.error ?? `HTTP ${res.status}` });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  if (state === "idle")
    return (
      <button type="button" onClick={find} className={`text-museum underline ${compact ? "text-[11px]" : "text-xs"}`}>
        {LABEL[kind].find}
      </button>
    );
  if (state === "loading") return <span className="text-[11px] text-muted">Google で探しています…</span>;
  if ("error" in state)
    return (
      <span className="text-[11px] text-muted">
        探せませんでした（{state.error}）{" "}
        <button type="button" onClick={find} className="text-museum underline">
          もう一度
        </button>
      </span>
    );
  if (!state.length) return <span className="text-[11px] text-muted">{LABEL[kind].none}</span>;
  return (
    <ul className="mt-1 space-y-1 text-xs">
      {state.slice(0, kind === "rental" ? 6 : 4).map((h) => (
        <li key={h.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            {h.name}
            <span className="ml-1 text-muted">
              {Math.round(kmBetween([near.lng, near.lat], [h.lng, h.lat]) * 10) / 10}km{h.address ? ` ・ ${h.address}` : ""}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onPick(toPlace(h, kind))}
            className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-museum/40 px-2 text-museum"
          >
            {LABEL[kind].pick}
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={() => setState("idle")} className="text-[11px] text-muted underline">
          閉じる
        </button>
      </li>
    </ul>
  );
}
