// 場所の種類ごとの名前・アイコン・色。色は日本の伝統色からとり、globals.css の変数と同じ値にそろえる
import type { Place } from "@/lib/types";

export const HUE = {
  shu: "#c8432b", // 朱（神社）
  ai: "#2c5a8a", // 藍（資料館・博物館・案内所）
  edomurasaki: "#745399", // 江戸紫（美術館）
  hiwada: "#8a5a3b", // 檜皮（城）
  chitose: "#316745", // 千歳緑（宿）
  seiji: "#4f8f7e", // 青磁（行った町）
  kanzo: "#e08a2e", // 萱草（まだの町の地帯）
  sumi: "#2a2622", // 墨
  nibi: "#6e675c", // 鈍（線・控えめな文字）
  kinari: "#f3ede1", // 生成り（地図の下地）
  kin: "#e3b23c", // 金（例祭の印）
} as const;

export const KIND: Record<Place["kind"], { label: string; icon: string; color: string; dot: string }> = {
  shrine: { label: "神社", icon: "⛩️", color: HUE.shu, dot: "bg-shrine" },
  museum: { label: "資料館・博物館", icon: "🏛️", color: HUE.ai, dot: "bg-museum" },
  art: { label: "美術館", icon: "🎨", color: HUE.edomurasaki, dot: "bg-art" },
  castle: { label: "城・城跡", icon: "🏯", color: HUE.hiwada, dot: "bg-castle" },
  info: { label: "観光案内所", icon: "ℹ️", color: HUE.ai, dot: "bg-museum" },
  lodging: { label: "宿", icon: "♨️", color: HUE.chitose, dot: "bg-inn" },
};
