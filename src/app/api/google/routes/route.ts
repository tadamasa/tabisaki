import { type RouteMode, googleEnabled, routeMinutes } from "@/lib/google/places";

type Leg = { by: RouteMode; from: [number, number]; to: [number, number] };
const MAX_LEGS = 30;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const point = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));

// 行程の車・歩きの区間を実際の道で測る。区間ごとに覚えるので、並べ替えても測り直すのは新しい区間だけ
export async function POST(req: Request) {
  if (!googleEnabled()) return Response.json({ enabled: false, minutes: [] });
  const body = (await req.json().catch(() => null)) as { legs?: Leg[] } | null;
  const legs = (body?.legs ?? []).slice(0, MAX_LEGS);
  if (!legs.every((l) => (l.by === "car" || l.by === "walk") && point(l.from) && point(l.to)))
    return Response.json({ error: "legs は { by: car|walk, from: [経度,緯度], to } の並び" }, { status: 400 });
  const minutes = await Promise.all(
    legs.map((l) =>
      routeMinutes(l.by, [r4(l.from[0]), r4(l.from[1])], [r4(l.to[0]), r4(l.to[1])]).catch((e) => {
        console.error("経路を測れませんでした", e);
        return null;
      }),
    ),
  );
  return Response.json({ enabled: true, minutes });
}
