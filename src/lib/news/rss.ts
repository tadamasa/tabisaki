// Google ニュースの検索 RSS から見出しを取り出す（依存を増やさないよう、必要な項目だけを読む）
export type NewsItem = { title: string; link: string; source: string | null; date: string | null };

const decode = (s: string) =>
  s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const tag = (item: string, name: string) => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
};

export function parseNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = tag(m[1], "title");
    const link = tag(m[1], "link");
    if (!title || !link?.startsWith("https://")) continue;
    const source = tag(m[1], "source");
    const pub = tag(m[1], "pubDate");
    const date = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString().slice(0, 10) : null;
    // 見出しの末尾の「 - 媒体名」は媒体の欄に出すので外す
    items.push({ title: source && title.endsWith(` - ${source}`) ? title.slice(0, -source.length - 3) : title, link, source, date });
  }
  return items;
}

// 町の名前（どれか）と、催しの言葉（どれか）を含む、この30日の記事
export function newsQuery(towns: string[]) {
  const names = towns.map((t) => `"${t}"`).join(" OR ");
  return `(${names}) (祭り OR 祭礼 OR 例大祭 OR イベント OR 開催 OR 公開 OR 特別展) when:30d`;
}
