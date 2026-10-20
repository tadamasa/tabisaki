import { getAtlas } from "@/lib/atlas";

export async function GET() {
  try {
    return Response.json(await getAtlas());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
