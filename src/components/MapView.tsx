"use client";

import maplibregl, { type FilterSpecification, type MapGeoJSONFeature } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { TimedStop } from "@/lib/plan/itinerary";
import type { AreaPlaces, Atlas, BlankArea, MuniProps, Place, Spot } from "@/lib/types";

type Props = {
  atlas: Atlas;
  maxKm: number;
  selected: BlankArea | null;
  places: AreaPlaces | null;
  route: { home: [number, number]; stops: TimedStop[] } | null;
  focus: Place | null;
  onSelectArea: (areaId: string | null) => void;
  // 吹き出しから行程を編集する
  planIds: Set<string>;
  anchorId: string | null;
  onTogglePlace: (p: Place) => void;
  onMakeAnchor: (p: Place) => void;
};

const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>' +
  ' ／ <a href="https://github.com/smartnews-smri/japan-topography" target="_blank" rel="noreferrer">国土数値情報（行政区域）を加工</a>' +
  ' ／ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

const CATEGORY_LABEL: Record<Spot["cat"], string> = {
  shrine: "神社",
  temple: "寺院",
  museum: "資料館・博物館",
  history: "史跡",
  nature: "自然",
  other: "その他",
};

const PLACE_LABEL: Record<Place["kind"], string> = { shrine: "神社", museum: "資料館・博物館", art: "美術館", info: "観光案内所" };
const PLACE_BG: Record<Place["kind"], string> = { shrine: "bg-shrine", museum: "bg-museum", art: "bg-art", info: "bg-museum" };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const areaFilter = (maxKm: number): FilterSpecification => [
  "all",
  ["to-boolean", ["get", "area"]],
  ["<", ["get", "km"], maxKm],
];

const TOWN_LABEL_MAX_ZOOM = 11.5;
const SPOT_LABEL_ZOOM = 12;

const mapLinks = (lng: number, lat: number, query: string) =>
  `<br><a href="https://maps.gsi.go.jp/#15/${lat.toFixed(5)}/${lng.toFixed(5)}/" target="_blank" rel="noreferrer">地理院地図</a>` +
  ` ・ <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}" target="_blank" rel="noreferrer">Googleマップ</a>`;

function label(text: string, kind: "town" | "spot") {
  const el = document.createElement("div");
  el.className =
    kind === "town"
      ? "pointer-events-none rounded bg-surface px-1.5 text-xs font-medium text-foreground shadow ring-1 ring-border"
      : "pointer-events-none whitespace-nowrap rounded bg-surface/90 px-1 text-[11px] text-foreground ring-1 ring-border";
  el.textContent = text;
  return el;
}

function bboxOf(g: import("geojson").Polygon | import("geojson").MultiPolygon) {
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of rings.flat()) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

const formatDate = (ts: string | null) => (ts ? ts.slice(0, 10).replaceAll("-", "/") : "—");

const ROUTE_COLOR: Record<TimedStop["role"], string> = { primer: "#3b6fb6", anchor: "#c2412d", kin: "#e07a5f", extra: "#7b4fa0" };

type PlanEdit = Pick<Props, "planIds" | "anchorId" | "onTogglePlace" | "onMakeAnchor">;

// 吹き出しの下に並べる「本命にする」「＋行程／行程から外す」
function renderActions(box: HTMLElement, place: Place, plan: PlanEdit) {
  box.replaceChildren();
  const button = (text: string, color: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText = `min-height:32px;padding:0 12px;border-radius:999px;border:1px solid ${color};color:${color};background:#fff;font-size:13px;cursor:pointer`;
    b.addEventListener("click", onClick);
    box.append(b);
  };
  if (place.id === plan.anchorId) {
    const s = document.createElement("span");
    s.textContent = "行程の本命です";
    s.style.cssText = "color:#c2412d;font-size:13px;font-weight:600";
    box.append(s);
    return;
  }
  if (place.kind !== "info") button("本命にする", "#c2412d", () => plan.onMakeAnchor(place));
  const inPlan = plan.planIds.has(place.id);
  button(inPlan ? "行程から外す" : "＋行程", inPlan ? "#6b665c" : "#3b6fb6", () => plan.onTogglePlace(place));
}

const routeData = (route: Props["route"]): import("geojson").FeatureCollection => ({
  type: "FeatureCollection",
  features: route
    ? [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [route.home, ...route.stops.map((s) => [s.place.lng, s.place.lat]), route.home],
          },
        },
      ]
    : [],
});

export default function MapView({ atlas, maxKm, selected, places, route, focus, onSelectArea, ...plan }: Props) {
  const { home } = atlas.summary;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const townLabelsRef = useRef<maplibregl.Marker[]>([]);
  const placeMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const actionBoxesRef = useRef<Map<string, { box: HTMLElement; place: Place; popup: maplibregl.Popup }>>(new Map());
  const planRef = useRef<PlanEdit>(plan);
  useEffect(() => {
    planRef.current = plan;
    // 開いている吹き出しのボタンを、行程の今の状態に合わせる
    for (const { box, place, popup } of actionBoxesRef.current.values()) {
      if (popup.isOpen()) renderActions(box, place, plan);
    }
  });
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
      map.addSource("munis", { type: "geojson", data: atlas.municipalities });
      map.addLayer({
        id: "muni-visited",
        type: "fill",
        source: "munis",
        filter: ["==", ["get", "visited"], true],
        paint: { "fill-color": "#2f8f83", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.42, 12, 0.18] },
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
          features: atlas.spots.map((s) => ({
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
      updateSpotLabels();
      // 狭い画面では出典の表示が地図を覆うので、ⓘを押したときだけ開く
      if (map.getContainer().clientWidth < 640) {
        map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      }
    });

    // 拡大したときだけ、画面内の訪問スポットに名前を出す
    let spotLabels: maplibregl.Marker[] = [];
    const updateSpotLabels = () => {
      spotLabels.forEach((m) => m.remove());
      spotLabels = [];
      if (map.getZoom() < SPOT_LABEL_ZOOM) return;
      const bounds = map.getBounds();
      const seen = new Set<string>();
      for (const s of atlas.spots) {
        if (spotLabels.length >= 150) break;
        const key = `${s.name}@${s.lat.toFixed(4)}`;
        if (seen.has(key) || !bounds.contains([s.lng, s.lat])) continue;
        seen.add(key);
        spotLabels.push(
          new maplibregl.Marker({ element: label(s.name, "spot"), anchor: "left", offset: [7, 0] })
            .setLngLat([s.lng, s.lat])
            .addTo(map),
        );
      }
    };
    map.on("moveend", updateSpotLabels);
    map.on("moveend", () => {
      const hide = map.getZoom() >= TOWN_LABEL_MAX_ZOOM;
      townLabelsRef.current.forEach((m) => (m.getElement().style.visibility = hide ? "hidden" : "visible"));
    });

    map.on("click", "spots", (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!f) return;
      const p = f.properties as { name: string; ts: string; cat: Spot["cat"]; note: string };
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${escapeHtml(p.name)}</strong><br>${CATEGORY_LABEL[p.cat]} ・ ${formatDate(p.ts)}` +
            (p.note ? `<br><span style="color:#6b665c">${escapeHtml(p.note)}</span>` : "") +
            mapLinks(e.lngLat.lng, e.lngLat.lat, p.name),
        )
        .addTo(map);
      e.preventDefault();
    });

    map.on("click", (e) => {
      // 印（マーカー）を押したときは、その吹き出しだけを出す
      if (e.defaultPrevented || (e.originalEvent.target as HTMLElement).closest(".maplibregl-marker")) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["muni-line", "muni-visited", "muni-area"] })[0];
      if (!f) return;
      const p = f.properties as unknown as MuniProps;
      const area = p.area && p.area !== "null" ? p.area : null;
      const status = p.visited
        ? `訪問 ${p.visits} 件 ・ 最後 ${formatDate(p.last)}`
        : "まだ記録がありません";
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${escapeHtml(p.name)}</strong><br>${status}<br>自宅から約 ${p.km} km${mapLinks(e.lngLat.lng, e.lngLat.lat, p.name)}`)
        .addTo(map);
      if (area) onSelectRef.current(area);
    });

    for (const layer of ["spots", "muni-visited", "muni-area"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    // 地図の枠の大きさが変わったら描き直す
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(containerRef.current);

    return () => {
      resize.disconnect();
      map.remove();
    };
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
      townLabelsRef.current.forEach((m) => m.remove());
      townLabelsRef.current = [];
      if (selected) {
        const centers = new Map(
          atlas.municipalities.features.map((f) => [f.properties.id, f] as const),
        );
        for (const t of selected.towns) {
          const f = centers.get(t.id);
          if (!f) continue;
          const [x0, y0, x1, y1] = bboxOf(f.geometry);
          townLabelsRef.current.push(
            new maplibregl.Marker({ element: label(t.name, "town") })
              .setLngLat([(x0 + x1) / 2, (y0 + y1) / 2])
              .addTo(map),
          );
        }
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
    // atlas は選択のたびに変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // 選んだ地帯の本命候補（赤）と予習先（青）を印で出す
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placeMarkersRef.current.forEach((m) => m.remove());
    placeMarkersRef.current = new Map();
    actionBoxesRef.current = new Map();
    if (!places) return;
    for (const p of [...places.primers, ...(places.halls ?? []), ...places.anchors]) {
      if (placeMarkersRef.current.has(p.id)) continue;
      const el = document.createElement("div");
      el.className = `size-3.5 cursor-pointer rounded-full ring-2 ring-white shadow ${PLACE_BG[p.kind]}`;
      el.title = p.name;
      const content = document.createElement("div");
      const info = document.createElement("div");
      info.innerHTML =
        `<strong>${escapeHtml(p.name)}</strong><br>${PLACE_LABEL[p.kind]} ・ ${escapeHtml(p.town)}` +
        (p.reasons.length ? `<br>${p.reasons.map(escapeHtml).join("・")}` : "") +
        (p.wikipedia ? `<br><a href="${escapeHtml(p.wikipedia)}" target="_blank" rel="noreferrer">Wikipedia</a>` : "") +
        mapLinks(p.lng, p.lat, `${p.name} ${p.town}`);
      const box = document.createElement("div");
      box.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
      content.append(info, box);
      const popup = new maplibregl.Popup({ offset: 10, maxWidth: "280px" }).setDOMContent(content);
      popup.on("open", () => renderActions(box, p, planRef.current));
      actionBoxesRef.current.set(p.id, { box, place: p, popup });
      placeMarkersRef.current.set(p.id, new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map));
    }
  }, [places]);

  // 行程の順路（自宅→各地点→自宅）を線と番号で出す。線は道ではなく、回る順の目安
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(routeData(route));
      else {
        map.addSource("route", { type: "geojson", data: routeData(route) });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#23211c", "line-width": 2.5, "line-opacity": 0.7, "line-dasharray": [2, 1.5] },
        });
      }
      routeMarkersRef.current.forEach((m) => m.remove());
      routeMarkersRef.current = (route?.stops ?? []).map((s, i) => {
        const el = document.createElement("div");
        el.className = "pointer-events-none grid size-5 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white shadow";
        el.style.backgroundColor = ROUTE_COLOR[s.role];
        el.textContent = String(i + 1);
        return new maplibregl.Marker({ element: el, offset: [10, -10] }).setLngLat([s.place.lng, s.place.lat]).addTo(map);
      });
    };
    if (map.loaded() || map.getLayer("muni-line")) apply();
    else map.once("load", apply);
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 13) });
    const m = placeMarkersRef.current.get(focus.id);
    if (m && !m.getPopup()?.isOpen()) m.togglePopup();
  }, [focus]);

  return <div ref={containerRef} className="h-full w-full" />;
}
