import type { Mode, Role } from "@/lib/plan/itinerary";
import type { Origin } from "@/lib/origin";
import type { Place } from "@/lib/types";

// 保存した行程。旅先専用のスプレッドシートの plans シートの1行（data は JSON の文字列）
export type SavedTrip = {
  plan_id: string;
  updated_at: string;
  title: string;
  area_id: string;
  area_label: string;
  trip_date: string;
  mode: Mode;
  data: string;
};

// data の中身。地点は Place をまるごと持つので、地帯の候補を読み直さなくても行程を出せる
export type TripData = {
  // null なら自宅から出る
  origin: Origin | null;
  start: number;
  start2: number;
  stops: [string, Role, (0 | 1)?, string[]?][];
  places: Place[];
};
