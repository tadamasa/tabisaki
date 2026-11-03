import { type HubKind, findHubs, googleEnabled } from "@/lib/google/places";

// レンタカーの店・駐車場を、指定した位置の近い順に返す
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (!googleEnabled()) return Response.json({ enabled: false, hubs: [] });
  const kind = q.get("kind") as HubKind;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if ((kind !== "rental" && kind !== "parking") || !Number.isFinite(lat) || !Number.isFinite(lng))
    return Response.json({ error: "kind（rental / parking）, lat, lng が必要です" }, { status: 400 });
  try {
    // 覚えの鍵がぶれないよう、位置は小数3桁（約100m）にそろえる
    return Response.json({ enabled: true, hubs: await findHubs(kind, Math.round(lat * 1e3) / 1e3, Math.round(lng * 1e3) / 1e3) });
  } catch (e) {
    return Response.json({ enabled: true, hubs: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
