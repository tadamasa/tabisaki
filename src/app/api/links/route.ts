import { addLink, deleteLink, listLinks } from "@/lib/links";
import type { TripLink } from "@/lib/links/types";

const fail = (e: unknown) => Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
const text = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET() {
  try {
    return Response.json({ links: await listLinks() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<TripLink>;
  const url = text(b.url, 2000);
  if (!/^https?:\/\//.test(url)) return Response.json({ error: "http(s) の URL を入れてください" }, { status: 400 });
  if (b.target_type !== "town" && b.target_type !== "place") return Response.json({ error: "対象がありません" }, { status: 400 });
  try {
    const link = await addLink({
      target_type: b.target_type,
      target_id: text(b.target_id, 100),
      target_name: text(b.target_name, 200),
      muni_code: text(b.muni_code, 10),
      lat: text(b.lat, 20),
      lng: text(b.lng, 20),
      title: text(b.title, 200) || url,
      url,
      note: text(b.note),
    });
    return Response.json({ link });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id がありません" }, { status: 400 });
  try {
    await deleteLink(id);
    return Response.json({ deleted: id });
  } catch (e) {
    return fail(e);
  }
}
