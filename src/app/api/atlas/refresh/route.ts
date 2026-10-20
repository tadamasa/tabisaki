import { revalidateTag } from "next/cache";
import { ATLAS_TAG } from "@/lib/atlas";

// 縁泉に記録を足したあと、次の表示で最新のスプレッドシートを読み直す
export async function POST() {
  revalidateTag(ATLAS_TAG, { expire: 0 });
  return Response.json({ ok: true });
}
