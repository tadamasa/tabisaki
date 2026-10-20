import { connection } from "next/server";
import { getAtlas } from "@/lib/atlas";

export async function GET() {
  // ビルド時に訪問データを読んで静的ファイルに焼き込まないよう、リクエストが来てから読む
  await connection();
  try {
    return Response.json(await getAtlas());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
