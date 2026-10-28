"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news/rss";

type State = { areaId: string; items: NewsItem[] } | { areaId: string; error: string } | null;

// 地帯の町で話題になっている催しのニュース見出し。開いたときに取りに行く
export default function AreaNews({ areaId }: { areaId: string }) {
  const [state, setState] = useState<State>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/areas/${encodeURIComponent(areaId)}/news`)
      .then(async (res) => {
        const body = await res.json();
        if (!cancelled) setState(res.ok ? { areaId, items: body.items } : { areaId, error: body.error ?? `HTTP ${res.status}` });
      })
      .catch((e) => !cancelled && setState({ areaId, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [areaId]);
  const current = state?.areaId === areaId ? state : null;

  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-muted">話題の催し（この30日のニュース見出し）</h3>
      {!current ? (
        <p className="mt-1 text-sm text-muted">探しています…</p>
      ) : "error" in current ? (
        <p className="mt-1 text-sm text-muted">ニュースを読めませんでした（{current.error}）</p>
      ) : current.items.length === 0 ? (
        <p className="mt-1 text-sm text-muted">この30日、町の名前と催しの言葉を含む記事は見つかりませんでした。</p>
      ) : (
        <ul className="mt-1 divide-y divide-border text-sm">
          {current.items.map((n) => (
            <li key={n.link} className="py-1.5">
              <a href={n.link} target="_blank" rel="noreferrer" className="hover:underline">
                {n.title}
              </a>
              <span className="ml-1.5 text-[11px] text-muted">
                {[n.source, n.date?.slice(5).replace("-", "/")].filter(Boolean).join(" ・ ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-muted">出典: Google ニュース。見出しを機械的に拾ったもので、日時や場所は記事で確かめてください。</p>
    </section>
  );
}
