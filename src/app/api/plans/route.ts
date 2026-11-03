import { deleteTrip, listTrips, saveTrip } from "@/lib/plans";
import type { SavedTrip } from "@/lib/plans/types";

const fail = (e: unknown) => Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const MODES = ["car", "train", "bike", "walk", "rent"];
// スプレッドシートの1つのセルに入る長さ（5万字）より短くする
const MAX_DATA = 45_000;

export async function GET() {
  try {
    return Response.json({ plans: await listTrips() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<SavedTrip>;
  const data = typeof b.data === "string" ? b.data : "";
  if (!data || data.length > MAX_DATA) return Response.json({ error: "行程の中身がないか、長すぎます" }, { status: 400 });
  try {
    JSON.parse(data);
  } catch {
    return Response.json({ error: "行程の中身が読めません" }, { status: 400 });
  }
  if (!text(b.area_id)) return Response.json({ error: "地帯がありません" }, { status: 400 });
  try {
    const plan = await saveTrip({
      plan_id: text(b.plan_id, 100) || undefined,
      title: text(b.title) || "行程",
      area_id: text(b.area_id),
      area_label: text(b.area_label),
      trip_date: text(b.trip_date, 10),
      mode: (MODES.includes(String(b.mode)) ? b.mode : "car") as SavedTrip["mode"],
      data,
    });
    return Response.json({ plan });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id がありません" }, { status: 400 });
  try {
    await deleteTrip(id);
    return Response.json({ deleted: id });
  } catch (e) {
    return fail(e);
  }
}
