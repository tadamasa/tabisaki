"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type LinkTarget, type TripLink, isDrive, linkKey } from "@/lib/links/types";
import type { Place } from "@/lib/types";

type Store = {
  byKey: Map<string, TripLink[]>;
  error: string | null;
  add: (target: LinkTarget, title: string, url: string) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
};

const LinksContext = createContext<Store | null>(null);

// 縁泉スプレッドシートの links シートに置いた資料のリンクを、開いたときに一度だけ読む
export function LinksProvider({ children }: { children: React.ReactNode }) {
  const [links, setLinks] = useState<TripLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/links")
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) setLinks(body.links);
        else setError(body.error ?? `HTTP ${res.status}`);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const add = useCallback(async (target: LinkTarget, title: string, url: string) => {
    const res = await fetch("/api/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, title, url }) });
    const body = await res.json();
    if (!res.ok) return body.error ?? `HTTP ${res.status}`;
    setLinks((prev) => [...prev, body.link]);
    return null;
  }, []);
  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/links?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setLinks((prev) => prev.filter((l) => l.link_id !== id));
  }, []);
  const byKey = useMemo(() => {
    const m = new Map<string, TripLink[]>();
    for (const l of links) m.set(linkKey(l), [...(m.get(linkKey(l)) ?? []), l]);
    return m;
  }, [links]);
  return <LinksContext.Provider value={{ byKey, error, add, remove }}>{children}</LinksContext.Provider>;
}

export const placeTarget = (p: Place, muniCode = ""): LinkTarget => ({
  target_type: "place",
  target_id: p.id,
  target_name: p.name,
  muni_code: muniCode,
  lat: String(p.lat),
  lng: String(p.lng),
});

export const townTarget = (code: string, name: string): LinkTarget => ({
  target_type: "town",
  target_id: code,
  target_name: name,
  muni_code: code,
  lat: "",
  lng: "",
});

const CHIP = "inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs";

// 登録した資料。editable なら、足したり外したりできる
export function LinkChips({ target, editable = true }: { target: LinkTarget; editable?: boolean }) {
  const store = useContext(LinksContext);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  if (!store) return null;
  // 資料を読めないとき（Apps Script が古いなど）は、足すボタンの横に理由を出す
  const loadError = store.error;
  const mine = store.byKey.get(linkKey(target)) ?? [];
  if (!editable && mine.length === 0) return null;
  const save = async () => {
    setStatus("保存しています…");
    const err = await store.add(target, title.trim(), url.trim());
    if (err) return setStatus(err);
    setTitle("");
    setUrl("");
    setStatus(null);
    setOpen(false);
  };
  return (
    <div className="mt-1.5">
      <ul className="flex flex-wrap items-center gap-1">
        {mine.map((l) => (
          <li key={l.link_id} className={`${CHIP} border-museum/40`}>
            <a href={l.url} target="_blank" rel="noreferrer" className="text-museum hover:underline">
              {isDrive(l.url) ? "📁" : "📎"} {l.title}
            </a>
            {editable && (
              <button
                type="button"
                aria-label={`${l.title}を外す`}
                onClick={() => confirm(`「${l.title}」のリンクを外しますか（資料そのものは消えません）`) && store.remove(l.link_id)}
                className="min-h-6 px-0.5 text-muted"
              >
                ×
              </button>
            )}
          </li>
        ))}
        {editable && (
          <li>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`${CHIP} border-border text-muted`}>
              ＋資料
            </button>
          </li>
        )}
        {editable && open && loadError && <li className="text-[11px] text-shrine">{loadError}</li>}
      </ul>
      {open && (
        <form
          className="mt-1.5 space-y-1.5 rounded-lg border border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            required
            placeholder="URL（Googleドライブの共有リンクなど）"
            aria-label="資料の URL"
            className="min-h-9 w-full rounded border border-border bg-surface px-2 text-sm text-foreground"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="名前（例: 観光パンフレット）"
            aria-label="資料の名前"
            className="min-h-9 w-full rounded border border-border bg-surface px-2 text-sm text-foreground"
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="min-h-8 rounded-full border border-museum px-3 text-xs text-museum">
              縁泉のシートに保存
            </button>
            {status && <span className="text-[11px] text-muted">{status}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
