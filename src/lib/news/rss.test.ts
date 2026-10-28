import assert from "node:assert/strict";
import { test } from "node:test";
import { newsQuery, parseNewsRss } from "./rss";

test("ニュースの見出し・媒体・日付を読み、見出し末尾の媒体名を外す", () => {
  const xml = `<rss><channel><item><title>吉野町で秋の例大祭 - 奈良新聞</title><link>https://news.google.com/rss/articles/abc</link>
<pubDate>Sat, 24 Oct 2026 03:00:00 GMT</pubDate><source url="https://www.nara-np.co.jp">奈良新聞</source></item>
<item><title><![CDATA[蔵王堂 &amp; 特別公開]]></title><link>https://example.jp/x</link></item>
<item><title>リンクなし</title></item></channel></rss>`;
  assert.deepEqual(parseNewsRss(xml), [
    { title: "吉野町で秋の例大祭", link: "https://news.google.com/rss/articles/abc", source: "奈良新聞", date: "2026-10-24" },
    { title: "蔵王堂 & 特別公開", link: "https://example.jp/x", source: null, date: null },
  ]);
});

test("町の名前のどれかと催しの言葉を含む30日の記事を探す", () => {
  assert.equal(newsQuery(["吉野町", "下市町"]).startsWith('("吉野町" OR "下市町") (祭り'), true);
  assert.ok(newsQuery(["吉野町"]).endsWith("when:30d"));
});
