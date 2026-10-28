# 旅先 — 次はどこへ

縁泉（ライフログ）の訪問履歴から、まだ行っていない市町村を中心に次の旅先を探す Web アプリ。PC・スマホ両対応。

計画書と分析はプロジェクトの共有フォルダ（`travel-planner/plan.md`、`travel-planner/ensen-analysis.md`）にあります。

## いまできること

- 縁泉スプレッドシートの「場所」の記録を読み、訪問した町（緑）と、まだ行っていない町がまとまっている「空白地帯」（橙）を地理院地図の上に表示
- 空白地帯は、隣の町へ渡り歩いて移動の手間が30分以内に収まる未訪問の町（最大8町）でまとめる。峠や尾根を越える町は別の地帯になり、山あいでは一町だけの地帯もある
- 自宅からの距離（100 / 200 / 300km / 全国）で空白地帯を絞り込み、町の一覧と詳細リンクを表示
- 訪問したスポットを点で表示（赤＝神社、青＝資料館）。拡大すると名前が出る。タップで日付・メモと、地理院地図・Googleマップへのリンク
- 空白地帯を開くと、その中の神社から本命の候補（一宮・大社・式内社・Wikipedia 記事の有無などで順位付け）と、先に寄る資料館・観光案内所を OpenStreetMap から探し、「資料館で予習 → 本命」の組み合わせと距離を示す。地図にも印を出す
- 出発地を自宅・現在地（GPS）・地名（駅やホテル、住所、町の名前）から選べる。出張先などから、周りの地帯と町を近い順に出し、行程もそこから出てそこへ戻る
- 移動手段を車（既定）・電車・自転車・徒歩から選べる。時間の目安、距離の絞り込みの幅、Googleマップの経路が切り替わる。電車は乗り換えや本数を考えない目安で、近い地点のあいだは歩きとみる。区間ごとに乗換案内を開ける
- 旅の日を決めると、前後3日に例祭がある社に🏮の印を付ける（Wikipedia の基礎情報の例祭欄から。旧暦の日付は数えない）
- 地帯の町で、この30日に話題になった祭り・催しのニュース見出しを出す（Google ニュースの検索 RSS）
- 「縁泉の最新の記録を読む」で、縁泉に追加した記録をすぐ反映（ふだんは1時間ごとに読み直す）

## 縁泉スプレッドシートとのつなぎ方

訪問履歴は個人データなので、スプレッドシートを公開せず、合言葉つきの Apps Script を経由して読みます。

1. [gas/ensen-api.gs](gas/ensen-api.gs) の冒頭の手順で Apps Script をウェブアプリとしてデプロイする
2. 表示された URL と合言葉を `ENSEN_GAS_URL` / `ENSEN_GAS_TOKEN` に設定する（[.env.example](.env.example)）

## 開発

```bash
npm install
cp .env.example .env.local   # 値を埋める。手元では ENSEN_XLSX でエクスポートファイルを読んでもよい
npm run dev
```

## 公開（Vercel）

1. Vercel で「Add New → Project」から GitHub の `tadamasa/tabisaki` を選ぶ
2. Environment Variables に `ENSEN_GAS_URL`、`ENSEN_GAS_TOKEN`、`HOME_LATLNG`、`APP_PASSWORD` を設定してデプロイする
3. 開くと合言葉を聞かれる。ユーザー名は何でもよく、パスワード欄に `APP_PASSWORD` を入れる

## データの出典

- 地図: [地理院タイル（淡色地図）](https://maps.gsi.go.jp/development/ichiran.html)
- 行政区域（`data/boundaries/`）: 国土数値情報（行政区域データ、2021年1月1日）を [SmartNews メディア研究所](https://github.com/smartnews-smri/japan-topography) が簡素化したもの。政令指定都市は市単位
- 町どうしの移動の手間（`data/boundaries/edges.json`）: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) の標高（SRTM・GMTED ほか）から `scripts/terrain_edges.py` で計算。坂が急なほど手間がかかるとして隣り合う町の代表点を結ぶ最小コスト経路を求め、平地を時速40kmで走る分に換算した目安
- 神社・資料館・観光案内所: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors（ODbL）。Overpass API で検索し、地帯ごとに1日キャッシュ
- 出発地の検索: [Nominatim](https://nominatim.org/)（© OpenStreetMap contributors、[利用方針](https://operations.osmfoundation.org/policies/nominatim/)に沿って押したときだけ問い合わせる）と[国土地理院の住所検索](https://msearch.gsi.go.jp/address-search/AddressSearch)。町の名前は端末の中だけで候補に出す
- 話題の催し: [Google ニュース](https://news.google.com/)の検索 RSS。見出しを機械的に拾ったもので、日付の整ったイベント情報ではない。数時間キャッシュ
- 祭神・社格・例祭: [Wikipedia 日本語版](https://ja.wikipedia.org/)の神社記事の基礎情報（CC BY-SA 4.0）。記事の座標が実際の場所から 1.5km 以内のときだけ同じ社とみなす
