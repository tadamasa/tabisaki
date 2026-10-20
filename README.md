# 旅先 — 次はどこへ

縁泉（ライフログ）の訪問履歴から、まだ行っていない市町村を中心に次の旅先を探す Web アプリ。PC・スマホ両対応。

計画書と分析はプロジェクトの共有フォルダ（`travel-planner/plan.md`、`travel-planner/ensen-analysis.md`）にあります。

## いまできること（P0）

- 訪問した町（緑）と、まだ行っていない町がまとまっている「空白地帯」（橙）を地図に表示
- 自宅からの距離（100 / 200 / 300km / 全国）で空白地帯を絞り込み、町の一覧と詳細リンクを表示
- 訪問したスポットを点で表示（赤＝神社、青＝資料館）。タップで日付とメモ

## 使い方

```bash
npm install
# 縁泉のエクスポートから地図用データを作る（public/data/ に出力。個人データなのでコミットしない）
npm run build-data -- --ensen path/to/ensen.xlsx [--home 緯度,経度]
npm run dev
```

## データの出典

- 地図: [地理院タイル（淡色地図）](https://maps.gsi.go.jp/development/ichiran.html)
- 行政区域: 国土数値情報（行政区域データ、2021年1月1日）を [SmartNews メディア研究所](https://github.com/smartnews-smri/japan-topography) が簡素化したもの。政令指定都市は市単位
