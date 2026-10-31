import { geocode } from "@/lib/geocode";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ hits: [] });
  return Response.json({ hits: await geocode(q.slice(0, 100)) });
}
