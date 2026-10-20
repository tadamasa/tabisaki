import { getAreaPlaces } from "@/lib/places";

export async function GET(_req: Request, ctx: RouteContext<"/api/areas/[id]/places">) {
  const { id } = await ctx.params;
  try {
    const places = await getAreaPlaces(id);
    if (!places) return Response.json({ error: "その地帯は見つかりません" }, { status: 404 });
    return Response.json(places);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
