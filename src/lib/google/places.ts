import "server-only";
import { cacheLife } from "next/cache";
import type { Period } from "./hours";

// Google Places API（New）。鍵はサーバーの環境変数だけに置き、画面には出さない
const API = process.env.GOOGLE_PLACES_API_URL ?? "https://places.googleapis.com/v1";
const key = () => process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
export const googleEnabled = () => !!key();

// 名前と位置で探して、いちばん近い1件の評価・営業時間・写真を返す。
// 料金は呼んだ数で決まるので、画面で押されたときだけ呼び、結果はしばらく覚える
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours.periods",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.photos",
].join(",");

// OpenStreetMap の位置と Google の位置がこれより離れていたら別の場所とみる
const MATCH_KM = 1.5;

export type GooglePhoto = { name: string; authors: { name: string; uri: string | null }[] };

export type GooglePlace = {
  id: string;
  name: string;
  km: number;
  rating: number | null;
  ratings: number;
  periods: Period[] | null;
  weekdayText: string[];
  status: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
  mapsUri: string | null;
  website: string | null;
  photo: GooglePhoto | null;
};

type RawPlace = {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { periods?: Period[]; weekdayDescriptions?: string[] };
  businessStatus?: GooglePlace["status"];
  googleMapsUri?: string;
  websiteUri?: string;
  photos?: { name: string; authorAttributions?: { displayName: string; uri?: string }[] }[];
};

const kmBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

export async function findGooglePlace(name: string, town: string, lat: number, lng: number): Promise<GooglePlace | null> {
  "use cache: remote";
  cacheLife("days");
  const k = key();
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY が設定されていません");
  const res = await fetch(`${API}/places:searchText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": k, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({
      textQuery: `${name} ${town}`,
      languageCode: "ja",
      regionCode: "JP",
      pageSize: 5,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 2000 } },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Google Places API: HTTP ${res.status}${detail ? `（${detail}）` : ""}`);
  }
  const { places = [] } = (await res.json()) as { places?: RawPlace[] };
  const best = places
    .filter((p) => p.location)
    .map((p) => ({ p, km: kmBetween(lat, lng, p.location!.latitude, p.location!.longitude) }))
    .sort((a, b) => a.km - b.km)[0];
  if (!best || best.km > MATCH_KM) return null;
  const { p, km } = best;
  const photo = p.photos?.[0];
  return {
    id: p.id,
    name: p.displayName?.text ?? name,
    km: Math.round(km * 10) / 10,
    rating: p.rating ?? null,
    ratings: p.userRatingCount ?? 0,
    periods: p.regularOpeningHours?.periods ?? null,
    weekdayText: p.regularOpeningHours?.weekdayDescriptions ?? [],
    status: p.businessStatus ?? null,
    mapsUri: p.googleMapsUri ?? null,
    website: p.websiteUri ?? null,
    photo: photo
      ? { name: photo.name, authors: (photo.authorAttributions ?? []).map((a) => ({ name: a.displayName, uri: a.uri ?? null })) }
      : null,
  };
}

// 写真の名前（places/…/photos/…）から、鍵の付かない画像の URL を受け取る
export async function googlePhotoUri(photoName: string, width: number): Promise<string> {
  "use cache: remote";
  cacheLife("hours");
  const k = key();
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY が設定されていません");
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(photoName)) throw new Error("写真の名前が正しくありません");
  const params = new URLSearchParams({ maxWidthPx: String(width), skipHttpRedirect: "true" });
  const res = await fetch(`${API}/${photoName}/media?${params}`, {
    headers: { "X-Goog-Api-Key": k },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google Places API（写真）: HTTP ${res.status}`);
  const { photoUri } = (await res.json()) as { photoUri: string };
  return photoUri;
}

// 乗り換えの拠点（レンタカーの店・駐車場）を近い順に探す。Nearby Search（名前と位置だけ）
export type HubKind = "rental" | "parking";
const HUB_TYPE: Record<HubKind, string> = { rental: "car_rental", parking: "parking" };
const HUB_RADIUS: Record<HubKind, number> = { rental: 15_000, parking: 1_000 };

export type Hub = { id: string; name: string; lat: number; lng: number; address: string };

export async function findHubs(kind: HubKind, lat: number, lng: number): Promise<Hub[]> {
  "use cache: remote";
  cacheLife("days");
  const k = key();
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY が設定されていません");
  const res = await fetch(`${API}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": k,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.shortFormattedAddress",
    },
    body: JSON.stringify({
      includedTypes: [HUB_TYPE[kind]],
      maxResultCount: 8,
      rankPreference: "DISTANCE",
      languageCode: "ja",
      regionCode: "JP",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: HUB_RADIUS[kind] } },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google Places API: HTTP ${res.status}`);
  const { places = [] } = (await res.json()) as { places?: (RawPlace & { shortFormattedAddress?: string })[] };
  return places
    .filter((p) => p.location)
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? (kind === "rental" ? "レンタカー" : "駐車場"),
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      address: p.shortFormattedAddress ?? "",
    }));
}

// 車・歩きの区間を実際の道で測る（Routes API、渋滞を考えない Essentials）。分で返す
const ROUTES = process.env.GOOGLE_ROUTES_API_URL ?? "https://routes.googleapis.com/directions/v2:computeRoutes";
const TRAVEL_MODE = { car: "DRIVE", walk: "WALK" } as const;
export type RouteMode = keyof typeof TRAVEL_MODE;

export async function routeMinutes(mode: RouteMode, from: [number, number], to: [number, number]): Promise<number | null> {
  "use cache: remote";
  cacheLife("days");
  const k = key();
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY が設定されていません");
  const point = ([lng, lat]: [number, number]) => ({ location: { latLng: { latitude: lat, longitude: lng } } });
  const res = await fetch(ROUTES, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": k, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters" },
    body: JSON.stringify({
      origin: point(from),
      destination: point(to),
      travelMode: TRAVEL_MODE[mode],
      ...(mode === "car" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
      languageCode: "ja",
      regionCode: "JP",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Google Routes API: HTTP ${res.status}${detail ? `（${detail}）` : ""}`);
  }
  const { routes = [] } = (await res.json()) as { routes?: { duration?: string }[] };
  const sec = Number.parseInt(routes[0]?.duration ?? "", 10);
  return Number.isFinite(sec) ? Math.max(1, Math.round(sec / 60)) : null;
}
