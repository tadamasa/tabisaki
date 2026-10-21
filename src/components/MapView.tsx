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

const PLACE_LABEL: Record<Place["kind"], string> = {
  shrine: "神社",
  museum: "資料館・博物館",
  art: "美術館",
  castle: "城・城跡",
  info: "観光案内所",
  lodging: "宿",
};
const PLACE_BG: Record<Place["kind"], string> = {
  shrine: "bg-shrine",
  museum: "bg-museum",
  art: "bg-art",
  castle: "bg-castle",
  info: "bg-museum",
  lodging: "bg-inn",
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const areaFilter = (maxKm: number): FilterSpecification => [
  "all",
  ["to-boolean", ["get", "area"]],
  ["<", ["get", "km"], maxKm],
];

// この縮尺より寄ったら、見えている範囲のすべての市町村に名前を出す（開いた地帯の町はいつでも出す）
const ALL_TOWN_LABEL_ZOOM = 8.5;
const TOWN_LABEL_MAX = 300;
const SPOT_LABEL_ZOOM = 12;

const mapLinks = (lng: number, lat: number, query: string) =>
  `<br><a href="https://maps.gsi.go.jp/#15/${lat.toFixed(5)}/${lng.toFixed(5)}/" target="_blank" rel="noreferrer">地理院地図</a>` +
  ` ・ <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}" target="_blank" rel="noreferrer">Googleマップ</a>`;

// town: 開いた地帯の町、visited-town: 行ったことのある町、other-town: そのほかのまだの町
function label(text: string, kind: "town" | "visited-town" | "other-town" | "spot") {
  const el = document.createElement(kind === "spot" ? "div" : "button");
  el.className = {
    town: "cursor-pointer rounded bg-surface px-1.5 text-xs font-medium text-foreground shadow ring-1 ring-border hover:ring-area",
    "visited-town": "cursor-pointer whitespace-nowrap rounded bg-surface/80 px-1 text-[11px] text-muted ring-1 ring-visited/50 hover:ring-visited",
    "other-town": "cursor-pointer whitespace-nowrap rounded bg-surface/80 px-1 text-[11px] text-foreground ring-1 ring-area/50 hover:ring-area",
    spot: "pointer-events-none whitespace-nowrap rounded bg-surface/90 px-1 text-[11px] text-foreground ring-1 ring-border",
  }[kind];
  el.textContent = text;
  return el;
}

// 市町村の吹き出し。まだの町は地帯ごと、行ったことのある町はその町だけの候補を読み込める
function muniPopup(p: MuniProps, [lng, lat]: [number, number], onLoad: (areaId: string) => void) {
  const status = p.visited ? `訪問 ${p.visits} 件 ・ 最後 ${formatDate(p.last)}` : "まだ記録がありません";
  const content = document.createElement("div");
  const info = document.createElement("div");
  info.innerHTML = `<strong>${escapeHtml(p.name)}</strong><br>${status}<br>自宅から約 ${p.km} km${mapLinks(lng, lat, p.name)}`;
  const area = p.area && p.area !== "null" ? p.area : null;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = area ? "この地帯の候補を探す" : "この町の候補を探す";
  b.style.cssText =
    "margin-top:8px;min-height:32px;padding:0 12px;border-radius:999px;border:1px solid #3b6fb6;color:#3b6fb6;background:#fff;font-size:13px;cursor:pointer";
  content.append(info, b);
  const popup = new maplibregl.Popup({ offset: 14, maxWidth: "280px" }).setDOMContent(content);
  b.addEventListener("click", () => {
    popup.remove();
    onLoad(area ?? `town-${p.id}`);
  });
  return popup;
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

const ROUTE_COLOR: Record<TimedStop["role"], string> = { primer: "#3b6fb6", anchor: "#c2412d", kin: "#e07a5f", extra: "#7b4fa0", stay: "#3f7a46" };

// 宿の空きを調べる検索（予約サイトを1つに決めない）
export const innSearchLink = (p: Place) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${p.name} ${p.town} 宿泊予約`)}`;

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
  const inPlan = plan.planIds.has(place.id);
  if (place.kind === "lodging") {
    button(inPlan ? "泊まるのをやめる" : "ここに泊まる", inPlan ? "#6b665c" : "#3f7a46", () => plan.onTogglePlace(place));
    return;
  }
  if (place.kind !== "info") button("本命にする", "#c2412d", () => plan.onMakeAnchor(place));
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
  const townLabelsRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const selectedRef = useRef(selected);
  // 市町村ごとの名前の位置（枠の中心）
  const townCenters = useRef(
    atlas.municipalities.features.map((f) => {
      const [x0, y0, x1, y1] = bboxOf(f.geometry);
      return { p: f.properties, at: [(x0 + x1) / 2, (y0 + y1) / 2] as [number, number] };
    }),
  );
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

  // 市町村名のラベル。開いた地帯の町はいつでも、ほかの町は寄ったときに見えている範囲だけ出す。
  // 名前を押すと町の吹き出しが出る（町の面を押しても吹き出しは出ない）
  const updateTownLabels = (map: maplibregl.Map) => {
    const sel = selectedRef.current;
    const mine = new Set(sel?.towns.map((t) => t.id));
    const bounds = map.getBounds();
    const wanted = townCenters.current
      .filter(({ p, at }) => mine.has(p.id) || (map.getZoom() >= ALL_TOWN_LABEL_ZOOM && bounds.contains(at)))
      .sort((a, b) => Number(mine.has(b.p.id)) - Number(mine.has(a.p.id)))
      .slice(0, TOWN_LABEL_MAX);
    const ids = new Set(wanted.map((w) => w.p.id));
    for (const [id, m] of townLabelsRef.current) {
      if (!ids.has(id)) {
        m.remove();
        townLabelsRef.current.delete(id);
      }
    }
    for (const { p, at } of wanted) {
      if (townLabelsRef.current.has(p.id)) continue;
      const name = sel?.towns.find((t) => t.id === p.id)?.name ?? p.short;
      const el = label(name, mine.has(p.id) ? "town" : p.visited ? "visited-town" : "other-town");
      el.setAttribute("aria-label", `${p.name}の情報`);
      townLabelsRef.current.set(
        p.id,
        new maplibregl.Marker({ element: el })
          .setLngLat(at)
          .setPopup(muniPopup(p, at, (id) => onSelectRef.current(id)))
          .addTo(map),
      );
    }
  };

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
    map.on("moveend", () => updateTownLabels(map));

    map.on("click", "spots", (e) => {
      // 町名や印を押したときは、その吹き出しだけを出す
      if ((e.originalEvent.target as HTMLElement).closest(".maplibregl-marker")) return;
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

    // 町の面を押したら、その町を含む地帯を開くだけにする。町の吹き出しは町の名前を押したときに出す
    map.on("click", (e) => {
      if (e.defaultPrevented || (e.originalEvent.target as HTMLElement).closest(".maplibregl-marker")) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["muni-area"] })[0];
      if (!f) return;
      const area = (f.properties as unknown as MuniProps).area;
      if (area && area !== "null") onSelectRef.current(area);
    });

    for (const layer of ["spots", "muni-area"]) {
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
      map.setFilter("muni-selected", ["in", ["get", "id"], ["literal", selected?.towns.map((t) => t.id) ?? []]]);
      // 選んだ地帯が変わると名前の見た目も変わるので、作り直す
      selectedRef.current = selected;
      townLabelsRef.current.forEach((m) => m.remove());
      townLabelsRef.current.clear();
      updateTownLabels(map);
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

  // 選んだ地帯の本命候補（赤）と予習先（青）を印で出す
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placeMarkersRef.current.forEach((m) => m.remove());
    placeMarkersRef.current = new Map();
    actionBoxesRef.current = new Map();
    if (!places) return;
    for (const p of [...places.primers, ...(places.halls ?? []), ...(places.castles ?? []), ...(places.lodgings ?? []), ...places.anchors]) {
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
        (p.kind === "lodging" ? `<br><a href="${escapeHtml(innSearchLink(p))}" target="_blank" rel="noreferrer">空室・料金を調べる</a>` : "") +
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
      let n = 0;
      routeMarkersRef.current = (route?.stops ?? []).map((s) => {
        const el = document.createElement("div");
        el.className = "pointer-events-none grid size-5 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white shadow";
        el.style.backgroundColor = ROUTE_COLOR[s.role];
        // 宿は番号の代わりに「泊」
        el.textContent = s.role === "stay" ? "泊" : String(++n);
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
