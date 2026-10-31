"use client";

import { useEffect, useState } from "react";
import type { Town } from "@/lib/types";
import { LinkChips, townTarget } from "./Links";

const wikiLink = (t: Town) => `https://ja.wikipedia.org/wiki/${encodeURIComponent(t.name.match(/[市区町村]$/) ? t.name : `${t.pref}${t.name}`)}`;
// 観光パンフレットは町や観光協会のサイトに PDF で置かれることが多いので、検索で探す
const pamphletLink = (t: Town) => `https://www.google.com/search?q=${encodeURIComponent(`${t.pref}${t.name} 観光パンフレット`)}`;

const LINK = "text-museum underline";

// 地帯の町ごとに、公式サイト・観光パンフレット・Wikipedia と、登録した資料を並べる
export default function TownGuide({ towns, title }: { towns: Town[]; title: string }) {
  const codes = towns.map((t) => t.id).join(",");
  const [sites, setSites] = useState<{ codes: string; sites: Record<string, string> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/towns/sites?codes=${codes}`)
      .then((res) => res.json())
      .then((body) => !cancelled && setSites({ codes, sites: body.sites ?? {} }))
      .catch(() => !cancelled && setSites({ codes, sites: {} }));
    return () => {
      cancelled = true;
    };
  }, [codes]);
  const site = (id: string) => (sites?.codes === codes ? sites.sites[id] : undefined);

  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold tracking-wide text-muted">{title}</h3>
      <ul className="mt-1 divide-y divide-border">
        {towns.map((t) => (
          <li key={t.id} className="py-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">
                {t.name}
                <span className="ml-1 text-xs font-normal text-muted">{t.km}km</span>
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs">
                {site(t.id) && (
                  <a href={site(t.id)} target="_blank" rel="noreferrer" className={LINK}>
                    🏢 公式サイト
                  </a>
                )}
                <a href={pamphletLink(t)} target="_blank" rel="noreferrer" className={LINK}>
                  📄 観光パンフレットを探す
                </a>
                <a href={wikiLink(t)} target="_blank" rel="noreferrer" className={LINK}>
                  Wikipedia
                </a>
              </span>
            </div>
            <LinkChips target={townTarget(t.id, `${t.pref}${t.name}`)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
