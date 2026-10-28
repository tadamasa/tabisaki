import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { TripLink } from "./types";

// 資料のリンクは縁泉スプレッドシートの links シートに置き、縁泉アプリからも見えるようにする。
// Apps Script がないローカル開発では LINKS_FILE（JSON）に置く
const { ENSEN_GAS_URL, ENSEN_GAS_TOKEN } = process.env;
const LINKS_FILE = process.env.LINKS_FILE ?? ".links.local.json";
const viaGas = () => !!(ENSEN_GAS_URL && ENSEN_GAS_TOKEN);
// 古い Apps Script は資料の読み書きを知らない（POST に HTML のエラーを返し、links の代わりに events を返す）
const OUTDATED = "縁泉の Apps Script を新しい版に差し替えてください（手順書「資料のリンクを縁泉スプレッドシートに保存する」）";

async function jsonOf<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(OUTDATED);
  }
}

async function readLocal(): Promise<TripLink[]> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ LINKS_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function gasPost(body: object) {
  const res = await fetch(ENSEN_GAS_URL!, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: ENSEN_GAS_TOKEN, ...body }),
    redirect: "follow",
  });
  const out = await jsonOf<{ error?: string; link?: TripLink }>(res);
  if (!res.ok || out.error) throw new Error(`資料を保存できませんでした（${out.error ?? `HTTP ${res.status}`}）`);
  return out;
}

export async function listLinks(): Promise<TripLink[]> {
  if (!viaGas()) return readLocal();
  const res = await fetch(`${ENSEN_GAS_URL}?${new URLSearchParams({ token: ENSEN_GAS_TOKEN!, action: "links" })}`, {
    redirect: "follow",
    cache: "no-store",
  });
  const body = await jsonOf<{ links?: TripLink[]; events?: unknown[]; error?: string }>(res);
  if (body.events) throw new Error(OUTDATED);
  if (!body.links) throw new Error(`資料を読めませんでした（${body.error ?? `HTTP ${res.status}`}）`);
  return body.links;
}

export async function addLink(link: Omit<TripLink, "link_id" | "created_at">): Promise<TripLink> {
  if (viaGas()) return (await gasPost({ action: "addLink", link })).link!;
  const saved = { ...link, link_id: randomUUID(), created_at: new Date().toISOString() };
  await writeFile(/* turbopackIgnore: true */ LINKS_FILE, JSON.stringify([...(await readLocal()), saved], null, 1));
  return saved;
}

export async function deleteLink(id: string) {
  if (viaGas()) return void (await gasPost({ action: "deleteLink", link_id: id }));
  await writeFile(/* turbopackIgnore: true */ LINKS_FILE, JSON.stringify((await readLocal()).filter((l) => l.link_id !== id), null, 1));
}
