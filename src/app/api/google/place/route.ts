import { findGooglePlace, googleEnabled } from "@/lib/google/places";

// 社・館・宿の名前と位置から、Google の評価・営業時間・写真を返す。鍵が未設定なら enabled: false
export async function GET(req: Request) {
  // 先に要求を読む（読まないと公開時の作り置き（prerender）になり、鍵の有無が固まってしまう）
  const q = new URL(req.url).searchParams;
  if (!googleEnabled()) return Response.json({ enabled: false });
  // 名前なしは「使えるか」だけを聞く問い合わせ（料金はかからない）
  if (!q.has("name")) return Response.json({ enabled: true });
  const name = (q.get("name") ?? "").slice(0, 100);
  const town = (q.get("town") ?? "").slice(0, 50);
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  // 覚えの鍵がぶれないよう、位置は小数4桁（約10m）にそろえる
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: "name, lat, lng が必要です" }, { status: 400 });
  try {
    const place = await findGooglePlace(name, town, Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4);
    return Response.json({ enabled: true, place });
  } catch (e) {
    return Response.json({ enabled: true, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
