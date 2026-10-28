import { getAreaNews } from "@/lib/news";

export async function GET(_req: Request, ctx: RouteContext<"/api/areas/[id]/news">) {
  const { id } = await ctx.params;
  try {
    const news = await getAreaNews(id);
    if (!news) return Response.json({ error: "その地帯は見つかりません" }, { status: 404 });
    return Response.json(news);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
