"use client";

import maplibregl, { type FilterSpecification, type MapGeoJSONFeature } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { BlankArea, MuniProps, Spot } from "@/lib/types";

type Props = {
  home: [number, number];
  spots: Spot[];
  maxKm: number;
  selected: BlankArea | null;
  onSelectArea: (areaId: string | null) => void;
};

const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>' +
  ' ／ <a href="https://github.com/smartnews-smri/japan-topography" target="_blank" rel="noreferrer">国土数値情報（行政区域）を加工</a>';

const CATEGORY_LABEL: Record<Spot["cat"], string> = {
  shrine: "神社",
  temple: "寺院",
  museum: "資料館・博物館",
  history: "史跡",
  nature: "自然",
  other: "その他",
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const areaFilter = (maxKm: number): FilterSpecification => [
  "all",
  ["to-boolean", ["get", "area"]],
  ["<", ["get", "km"], maxKm],
];

const formatDate = (ts: string | null) => (ts ? ts.slice(0, 10).replaceAll("-", "/") : "—");

export default function MapView({ home, spots, maxKm, selected, onSelectArea }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelectArea);
  useEffect(() => {
    onSelectRef.current = onSelectArea;
  }, [onSelectArea]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: home,
      zoom: 7,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          gsi: {
            type: "raster",
            tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 18,
            attribution: GSI_ATTRIBUTION,
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#efece4" } },
          { id: "gsi", type: "raster", source: "gsi" },
        ],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "top-right");

    map.on("load", () => {
      map.addSource("munis", { type: "geojson", data: "/data/municipalities.geojson" });
      map.addLayer({
        id: "muni-visited",
        type: "fill",
        source: "munis",
        filter: ["==", ["get", "visited"], true],
        paint: { "fill-color": "#2f8f83", "fill-opacity": 0.42 },
      });
      map.addLayer({
        id: "muni-area",
        type: "fill",
        source: "munis",
        filter: areaFilter(maxKm),
        paint: { "fill-color": "#d9822b", "fill-opacity": 0.14 },
      });
      map.addLayer({
        id: "muni-selected",
        type: "fill",
        source: "munis",
        filter: ["==", ["get", "area"], "__none__"],
        paint: { "fill-color": "#d9822b", "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: "muni-line",
        type: "line",
        source: "munis",
        paint: { "line-color": "#6b665c", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.2, 10, 1] },
      });

      map.addSource("spots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: spots.map((s) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            properties: { name: s.name, ts: s.ts, cat: s.cat, note: s.note ?? "" },
          })),
        },
      });
      map.addLayer({
        id: "spots",
        type: "circle",
        source: "spots",
        minzoom: 7,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2, 12, 5],
          "circle-color": [
            "match",
            ["get", "cat"],
            "shrine",
            "#c2412d",
            "museum",
            "#3b6fb6",
            "#7a7466",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0.8,
        },
      });

      new maplibregl.Marker({ color: "#23211c" })
        .setLngLat(home)
        .setPopup(new maplibregl.Popup({ offset: 24 }).setText("自宅"))
        .addTo(map);
    });

    map.on("click", "spots", (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!f) return;
      const p = f.properties as { name: string; ts: string; cat: Spot["cat"]; note: string };
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${escapeHtml(p.name)}</strong><br>${CATEGORY_LABEL[p.cat]} ・ ${formatDate(p.ts)}` +
            (p.note ? `<br><span style="color:#6b665c">${escapeHtml(p.note)}</span>` : ""),
        )
        .addTo(map);
      e.preventDefault();
    });

    map.on("click", (e) => {
      if (e.defaultPrevented) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["muni-line", "muni-visited", "muni-area"] })[0];
      if (!f) return;
      const p = f.properties as unknown as MuniProps;
      const area = p.area && p.area !== "null" ? p.area : null;
      const status = p.visited
        ? `訪問 ${p.visits} 件 ・ 最後 ${formatDate(p.last)}`
        : "まだ記録がありません";
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${escapeHtml(p.name)}</strong><br>${status}<br>自宅から約 ${p.km} km`)
        .addTo(map);
      if (area) onSelectRef.current(area);
    });

    for (const layer of ["spots", "muni-visited", "muni-area"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    return () => map.remove();
    // 地図は一度だけ作る。以降の変化は下の effect で反映する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("muni-area")) return;
      map.setFilter("muni-area", areaFilter(maxKm));
    };
    if (map.getLayer("muni-area")) apply();
    else map.once("load", apply);
  }, [maxKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("muni-selected")) return;
      map.setFilter("muni-selected", ["==", ["get", "area"], selected?.id ?? "__none__"]);
      if (selected) {
        const [x0, y0, x1, y1] = selected.bbox;
        map.fitBounds(
          [
            [x0, y0],
            [x1, y1],
          ],
          { padding: 40, maxZoom: 11, duration: 800 },
        );
      }
    };
    if (map.getLayer("muni-selected")) apply();
    else map.once("load", apply);
  }, [selected]);

  return <div ref={containerRef} className="h-full w-full" />;
}
