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
