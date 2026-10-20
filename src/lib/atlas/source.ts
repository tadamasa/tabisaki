// 縁泉の訪問記録（場所）を読む。
//
// - ENSEN_GAS_URL と ENSEN_GAS_TOKEN があれば、縁泉スプレッドシートを読む Apps Script（gas/ensen-api.gs）から取得する
// - なければ ENSEN_XLSX のエクスポートファイルを読む（ローカル開発用）
import "server-only";
import type { VisitRow } from "./build";

type RawEvent = Record<string, string | number | null | undefined>;

function toVisits(events: RawEvent[]): VisitRow[] {
  const visits: VisitRow[] = [];
  for (const e of events) {
    if (e.actant_type !== "場所") continue;
    const lat = Number(e.lat);
    const lng = Number(e.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    visits.push({
      ts: String(e.ts ?? ""),
      lat,
      lng,
      name: String(e.actant_name ?? ""),
      note: e.note ? String(e.note) : null,
    });
  }
  return visits;
}

async function fromAppsScript(url: string, token: string): Promise<RawEvent[]> {
  const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`縁泉スプレッドシートの読み込みに失敗しました（HTTP ${res.status}）`);
  const body = (await res.json()) as { events?: RawEvent[]; error?: string };
  if (!body.events) throw new Error(`縁泉スプレッドシートの読み込みに失敗しました（${body.error ?? "応答が不正です"}）`);
  return body.events;
}

async function fromXlsx(file: string): Promise<RawEvent[]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("events");
  if (!ws) throw new Error("events シートが見つかりません");
  const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
  const rows: RawEvent[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const values = (row.values as unknown[]).slice(1);
    rows.push(Object.fromEntries(header.map((h, j) => [h, (values[j] ?? null) as RawEvent[string]])));
  });
  return rows;
}

export async function loadVisits(): Promise<VisitRow[]> {
  const { ENSEN_GAS_URL, ENSEN_GAS_TOKEN, ENSEN_XLSX } = process.env;
  if (ENSEN_GAS_URL && ENSEN_GAS_TOKEN) return toVisits(await fromAppsScript(ENSEN_GAS_URL, ENSEN_GAS_TOKEN));
  if (ENSEN_XLSX) return toVisits(await fromXlsx(ENSEN_XLSX));
  throw new Error("訪問データの読み込み先が設定されていません（ENSEN_GAS_URL と ENSEN_GAS_TOKEN、または ENSEN_XLSX）");
}
