import { officialSites } from "@/lib/towns/sites";

export async function GET(req: Request) {
  const codes = (new URL(req.url).searchParams.get("codes") ?? "").split(",").slice(0, 30);
  try {
    return Response.json({ sites: await officialSites(codes) });
  } catch (e) {
    return Response.json({ sites: {}, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
