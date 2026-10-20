export type Town = { id: string; name: string; pref: string; km: number };

export type BlankArea = {
  id: string;
  label: string;
  pref: string[];
  km: number;
  center: [number, number];
  bbox: [number, number, number, number];
  towns: Town[];
};

export type Spot = {
  name: string;
  lat: number;
  lng: number;
  ts: string;
  cat: "shrine" | "temple" | "museum" | "history" | "nature" | "other";
  muni: string | null;
  note: string | null;
};

export type Summary = {
  generatedAt: string;
  home: [number, number];
  municipalities: number;
  visited: number;
  spots: number;
  unmatched: number;
  unvisitedByBand: { km: number; count: number }[];
  prefectures: { pref: string; visited: number; total: number; km: number }[];
};

export type MuniProps = {
  id: string;
  name: string;
  short: string;
  pref: string;
  visits: number;
  visited: boolean;
  first: string | null;
  last: string | null;
  km: number;
  area: string | null;
};

export type Atlas = {
  summary: Summary;
  areas: BlankArea[];
  spots: Spot[];
  municipalities: import("geojson").FeatureCollection<
    import("geojson").Polygon | import("geojson").MultiPolygon,
    MuniProps
  >;
};

export type Place = {
  id: string;
  kind: "shrine" | "museum" | "art" | "castle" | "info";
  name: string;
  lat: number;
  lng: number;
  town: string;
  score: number;
  reasons: string[];
  wikipedia: string | null;
  website: string | null;
};

export type AreaPlaces = {
  areaId: string;
  anchors: (Place & { primer: { place: Place; km: number } | null; en: En | null })[];
  primers: Place[];
  // 本命にもできる博物館・美術館（資料館を含む）
  halls: Place[];
  // 城・城跡
  castles: Place[];
  shrineCount: number;
  source: string;
};

// 本命の社と、同じ系統の社・同じ祭神の社・これまでの参拝とのつながり
export type Visit = { name: string; date: string; town: string | null };

export type Lineage = {
  family: string;
  honsha: string;
  isHonsha: boolean;
  honshaVisited: string | null;
  visitedCount: number;
  recent: Visit[];
  alsoHere: string[];
};

export type DeityKin = { name: string; visitedCount: number; recent: Visit[] };

export type En = { lineage: Lineage | null; deities: DeityKin[] };
