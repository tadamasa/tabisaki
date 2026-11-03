# 旅先 — 次はどこへ

縁泉（ライフログ）の訪問履歴から、まだ行っていない市町村を中心に次の旅先を探す Web アプリ。PC・スマホ両対応。

計画書と分析はプロジェクトの共有フォルダ（`travel-planner/plan.md`、`travel-planner/ensen-analysis.md`）にあります。

## いまできること

- 縁泉スプレッドシートの「場所」の記録を読み、訪問した町（緑）と、まだ行っていない町がまとまっている「空白地帯」（橙）を地理院地図の上に表示
- 空白地帯は、隣の町へ渡り歩いて移動の手間が30分以内に収まる未訪問の町（最大8町）でまとめる。峠や尾根を越える町は別の地帯になり、山あいでは一町だけの地帯もある
- 自宅からの距離（100 / 200 / 300km / 全国）で空白地帯を絞り込み、町の一覧と詳細リンクを表示
- 訪問したスポットを点で表示（赤＝神社、青＝資料館）。縁泉の同じ場所（actant）への記録は1点にまとめ、位置は記録の中央値（Swarm のチェックイン位置のずれをならす）。町の訪問もこの位置で数える。拡大すると名前が出る。タップで回数・最初と最後の日付・メモと、地理院地図・Googleマップへのリンク
- 空白地帯を開くと、その中の神社から本命の候補（一宮・大社・式内社・Wikipedia 記事の有無などで順位付け）と、先に寄る資料館・観光案内所を OpenStreetMap から探し、「資料館で予習 → 本命」の組み合わせと距離を示す。地図にも印を出す
- 出発地を自宅・現在地（GPS）・地名（駅やホテル、住所、町の名前）から選べる。出張先などから、周りの地帯と町を近い順に出し、行程もそこから出てそこへ戻る
- 「✨ 近くのおすすめ」: 出発地のまわり（徒歩2.5km・自転車8km・電車12km・車20km）で、まだ行っていないおすすめを近い順に出し、いちばん近い所から行程を組む。地図に範囲の円を描く
- 移動手段を車（既定）・電車・自転車・徒歩から選べる。時間の目安、距離の絞り込みの幅、Googleマップの経路が切り替わる。電車は乗り換えや本数を考えない目安で、近い地点のあいだは歩きとみる。区間ごとに乗換案内を開ける
- 旅の日を決めると、前後3日に例祭がある社に🏮の印を付ける（Wikipedia の基礎情報の例祭欄から。旧暦の日付は数えない）
- 地帯の町で、この30日に話題になった祭り・催しのニュース見出しと、地帯の博物館・美術館の特別展・企画展の見出し（この60日）を出す（Google ニュースの検索 RSS）
- 地帯の町ごとに、公式サイト（Wikidata）・観光パンフレットの検索・Wikipedia へのリンクを出す。社や館は地図に登録された公式サイトも出す
- 町・社・館に、パンフレットや Google ドライブに保存した資料のリンクを「＋資料」で登録できる。縁泉スプレッドシートの links シートに保存し（[gas/ensen-api.gs](gas/ensen-api.gs)）、行程にも出す
- 社・館・宿の「Googleの評価・営業時間」で、Google マップの評価（★と件数）、旅の日の曜日の営業時間（休みは赤）、写真、臨時休業・閉業の登録を出す。行程の「営業時間を確かめる」で、着く時刻に開いているか、滞在中に閉まらないかを地点ごとに知らせる。押したときだけ問い合わせる（`GOOGLE_PLACES_API_KEY` を設定したときだけ出る）
- 移動手段「電車＋レンタカー」: 借りる所（Google で地帯の近くのレンタカーの店を探す）までを電車、そこから車で回り、最後に同じ所へ返して電車で帰る行程にする。Google の経路 API は日本の電車の経路を返さないので、電車の区間は直線距離からの目安と乗換案内のリンク
- 車で回るとき、地点ごとの「🅿️ 近くに停めて歩く」で駐車場（Google で1km以内を探す）を入れると、そこから「🔗 つないだ」地点は歩いて回り、つながりが切れたところで歩いて車に戻ってから次へ進む
- 行程の「実際の道で計算」で、車と歩きの区間を Google の Routes API（渋滞は考えない）で測り直す。区間ごとに覚えるので、並べ替えても測り直すのは新しい区間だけ
- 地図の印は種類ごとのアイコン（⛩️🏛️🎨🏯ℹ️♨️）。配色は日本の伝統色
- 「縁泉の最新の記録を読む」で、縁泉に追加した記録をすぐ反映（ふだんは1時間ごとに読み直す）。縁泉アプリで直したスポットの位置（spot_fixes）も重ねて読むので、位置を動かした場所は新しい位置の町で数え、「位置不明」にした場所は出さない

## 縁泉スプレッドシートとのつなぎ方

訪問履歴は個人データなので、スプレッドシートを公開せず、合言葉つきの Apps Script を経由して読みます。

1. [gas/ensen-api.gs](gas/ensen-api.gs) の冒頭の手順で Apps Script をウェブアプリとしてデプロイする
2. 表示された URL と合言葉を `ENSEN_GAS_URL` / `ENSEN_GAS_TOKEN` に設定する（[.env.example](.env.example)）

[gas/ensen-api.gs](gas/ensen-api.gs) を差し替えたときは、Apps Script のエディタに新しい中身を貼って保存し、「デプロイ → デプロイを管理 → ✏️（編集）→ バージョン: 新バージョン → デプロイ」で更新する。URL は変わらないので、Vercel の設定はそのままでよい。

### 他アプリとの約束

旅先と縁泉の関係は「計画するときに、行ったことがあるかを縁泉で見る」だけにとどめる。旅先から縁泉へ書き戻すのは資料の links シートだけで、それ以上の連携は増やさない。

旅先の Apps Script が読む縁泉シートの列（ここを変えるときは旅先にも響く）:

- `events`: `event_id, ts, lat, lng, actant_type, actant_name, actant_id, note, tags`（見出しの名前で引く。`actant_type` が「場所」の行だけ使う）
- `spot_fixes`: `ts, actant_id, lat, lng, status`。縁泉アプリ（ensen-home）でスポットの位置を直すと追記される。旅先は events を返す前にこれを重ねる。規則は縁泉アプリの `latestSpotFixes` / `applySpotFixes`（ensen-home/js/ensen.js）と同じで、同じ `actant_id` では `ts` がいちばん新しい1行だけが効き（同じ秒なら後に追記された行）、`move` は位置を置き換え、`hide` は返さず（位置不明）、`ok` / `undo` は events の座標のまま。シートがなければ何もしない。読むだけで書かない。`ts` は縁泉ハブが `yyyy-MM-dd'T'HH:mm:ss+09:00`（東京時間・秒まで）にそろえて書く約束なので、旅先は文字列のまま比べる（ensen-home/hub/README.md の「spot_fixes を読む相手（旅先）との約束」）
- `links`: 旅先が書く。列は [gas/ensen-api.gs](gas/ensen-api.gs) の冒頭

縁泉アプリが規則を変えたら、`gas/ensen-api.gs` の `latestSpotFixes_` と、その確かめ（`src/lib/atlas/ensenApi.test.ts`）も合わせて直す。

## 開発

```bash
npm install
cp .env.example .env.local   # 値を埋める。手元では ENSEN_XLSX でエクスポートファイルを読んでもよい
npm run dev
```

## 公開（Vercel）

1. Vercel で「Add New → Project」から GitHub の `tadamasa/tabisaki` を選ぶ
2. Environment Variables に `ENSEN_GAS_URL`、`ENSEN_GAS_TOKEN`、`HOME_LATLNG`、`APP_PASSWORD` を設定してデプロイする。Google の評価・営業時間を使うときは `GOOGLE_PLACES_API_KEY` も（Google Cloud で「Places API (New)」と「Routes API」を有効にし、鍵の「API の制限」をこの2つだけにする。サーバーから呼ぶので「アプリケーションの制限」は「なし」のまま）
3. 開くと合言葉を聞かれる。ユーザー名は何でもよく、パスワード欄に `APP_PASSWORD` を入れる

## データの出典

- 地図: [地理院タイル（淡色地図）](https://maps.gsi.go.jp/development/ichiran.html)
- 行政区域（`data/boundaries/`）: 国土数値情報（行政区域データ、2021年1月1日）を [SmartNews メディア研究所](https://github.com/smartnews-smri/japan-topography) が簡素化したもの。政令指定都市は市単位
- 町どうしの移動の手間（`data/boundaries/edges.json`）: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) の標高（SRTM・GMTED ほか）から `scripts/terrain_edges.py` で計算。坂が急なほど手間がかかるとして隣り合う町の代表点を結ぶ最小コスト経路を求め、平地を時速40kmで走る分に換算した目安
- 神社・資料館・観光案内所: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors（ODbL）。Overpass API で検索し、地帯ごとに1日キャッシュ
- 市町村の公式サイト: [Wikidata](https://www.wikidata.org/)（CC0）の全国地方公共団体コード（P429）と公式サイト（P856）
- 出発地の検索: [Nominatim](https://nominatim.org/)（© OpenStreetMap contributors、[利用方針](https://operations.osmfoundation.org/policies/nominatim/)に沿って押したときだけ問い合わせる）と[国土地理院の住所検索](https://msearch.gsi.go.jp/address-search/AddressSearch)。町の名前は端末の中だけで候補に出す
- 話題の催し: [Google ニュース](https://news.google.com/)の検索 RSS。見出しを機械的に拾ったもので、日付の整ったイベント情報ではない。数時間キャッシュ
- 評価・営業時間・写真、レンタカーの店・駐車場、車と歩きの道のり: [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service/op-overview)（Text Search・Nearby Search・Place Photos）と [Routes API](https://developers.google.com/maps/documentation/routes)。押したときだけ問い合わせ、結果は数日覚える。写真には撮影者の名前を添える
- 祭神・社格・例祭: [Wikipedia 日本語版](https://ja.wikipedia.org/)の神社記事の基礎情報（CC BY-SA 4.0）。記事の座標が実際の場所から 1.5km 以内のときだけ同じ社とみなす
