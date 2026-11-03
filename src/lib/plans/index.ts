import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { SavedTrip } from "./types";

// 保存した行程は縁泉スプレッドシートの plans シートに置き、どの端末からも開けるようにする。
// Apps Script がないローカル開発では PLANS_FILE（JSON）に置く
const { ENSEN_GAS_URL, ENSEN_GAS_TOKEN } = process.env;
const PLANS_FILE = process.env.PLANS_FILE ?? ".plans.local.json";
const viaGas = () => !!(ENSEN_GAS_URL && ENSEN_GAS_TOKEN);
// 古い Apps Script は行程の保存を知らない（plans の代わりに events を返し、POST には unknown action を返す）
const OUTDATED = "縁泉の Apps Script を新しい版に差し替えてください（手順書「行程を縁泉スプレッドシートに保存する」）";

async function readLocal(): Promise<SavedTrip[]> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ PLANS_FILE, "utf8"));
  } catch {
    return [];
  }
}
const writeLocal = (plans: SavedTrip[]) => writeFile(/* turbopackIgnore: true */ PLANS_FILE, JSON.stringify(plans, null, 1));

async function gas<T>(body: object): Promise<T> {
  const res = await fetch(ENSEN_GAS_URL!, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: ENSEN_GAS_TOKEN, ...body }),
    redirect: "follow",
  });
  const out = (await res.json().catch(() => ({ error: OUTDATED }))) as T & { error?: string };
  if (out.error === "unknown action") throw new Error(OUTDATED);
  if (!res.ok || out.error) throw new Error(`行程を保存できませんでした（${out.error ?? `HTTP ${res.status}`}）`);
  return out;
}

export async function listTrips(): Promise<SavedTrip[]> {
  const trips = viaGas() ? await listFromGas() : await readLocal();
  return trips.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function listFromGas() {
  const res = await fetch(`${ENSEN_GAS_URL}?${new URLSearchParams({ token: ENSEN_GAS_TOKEN!, action: "plans" })}`, { redirect: "follow", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { plans?: SavedTrip[]; events?: unknown[]; error?: string };
  if (body.events) throw new Error(OUTDATED);
  if (!body.plans) throw new Error(`保存した行程を読めませんでした（${body.error ?? `HTTP ${res.status}`}）`);
  return body.plans;
}

// plan_id があれば上書き、なければ新しく保存する
export async function saveTrip(trip: Omit<SavedTrip, "plan_id" | "updated_at"> & { plan_id?: string }): Promise<SavedTrip> {
  if (viaGas()) return (await gas<{ plan: SavedTrip }>({ action: "savePlan", plan: trip })).plan;
  const saved: SavedTrip = { ...trip, plan_id: trip.plan_id || randomUUID(), updated_at: new Date().toISOString() };
  await writeLocal([...(await readLocal()).filter((p) => p.plan_id !== saved.plan_id), saved]);
  return saved;
}

export async function deleteTrip(id: string) {
  if (viaGas()) return void (await gas({ action: "deletePlan", plan_id: id }));
  await writeLocal((await readLocal()).filter((p) => p.plan_id !== id));
}
