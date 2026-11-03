import { googlePhotoUri } from "@/lib/google/places";

// Google の写真へ転送する。鍵はここで付けるので、画面の img には鍵の入らない URL だけが渡る
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const name = q.get("name") ?? "";
  const width = Math.min(800, Math.max(100, Number(q.get("w")) || 400));
  try {
    return Response.redirect(await googlePhotoUri(name, width), 302);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 502 });
  }
}
