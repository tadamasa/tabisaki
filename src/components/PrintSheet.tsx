"use client";

import { Fragment } from "react";
import { createPortal } from "react-dom";
import { KIND } from "@/lib/kinds";
import { WEEKDAY } from "@/lib/google/hours";
import type { Origin } from "@/lib/origin";
import { type LegMode, MODE_LABEL, type Mode, type Plan, type Role, clock, googleMapsLeg, googleMapsRoutes } from "@/lib/plan/itinerary";
import type { Place } from "@/lib/types";

const ROLE: Record<Role, string> = { primer: "予習", anchor: "本命", kin: "ゆかり", extra: "立ち寄り", stay: "泊", rent: "借りる", park: "停める" };
const BY_ICON: Record<LegMode, string> = { car: "🚗", train: "🚃", bike: "🚲", walk: "🚶" };
const placeLink = (p: Place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.town}`)}`;
const pt = (p: Place): [number, number] => [p.lng, p.lat];

function Leg({ min, by, back, from, to }: { min: number; by: LegMode; back: number; from: [number, number]; to: [number, number] }) {
  return (
    <tr className="text-[10pt] text-neutral-600">
      <td />
      <td colSpan={2} className="py-0.5 pl-4">
        {back > 0 && `🚶 歩いて車に戻る ${back}分 ・ `}
        {BY_ICON[by]} {MODE_LABEL[by]} 約{min - back}分 ・{" "}
        <a href={googleMapsLeg(from, to, by)} className="text-blue-700 underline">
          Googleマップで{by === "train" ? "電車の" : ""}経路
        </a>
      </td>
    </tr>
  );
}

// 印刷・PDF 用の行程表。画面には出さず、印刷するときだけ出す（各区間と各地点に Google マップへのリンク）
export default function PrintSheet({ plan, origin, mode, tripDate, trip, title }: { plan: Plan; origin: Origin; mode: Mode; tripDate: string; trip: Date; title: string }) {
  if (typeof document === "undefined") return null;
  const home = origin.at;
  const routes = mode === "train" ? [] : googleMapsRoutes(plan.stops, home, mode);
  const last = plan.dropOff ? pt(plan.dropOff.place) : plan.stops.length ? pt(plan.stops[plan.stops.length - 1].place) : home;
  return createPortal(
    <article className="hidden bg-white p-6 text-[11pt] leading-relaxed text-black print:block">
      <h1 className="text-[16pt] font-bold">{title}</h1>
      <p className="mt-1">
        {tripDate && `${tripDate.replaceAll("-", "/")}（${WEEKDAY[trip.getDay()]}）・ `}
        {plan.days > 1 ? `${plan.days - 1}泊${plan.days}日` : "日帰り"} ・ {MODE_LABEL[mode]} ・ {origin.label}から
      </p>
      {routes.length > 0 && (
        <p className="mt-1">
          {routes.map((r) => (
            <a key={r.day} href={r.url} className="mr-4 text-blue-700 underline">
              {routes.length > 1 ? `${r.day}日目の` : ""}車の経路（Googleマップ）
            </a>
          ))}
        </p>
      )}
      <table className="mt-3 w-full border-collapse">
        <tbody>
          <tr>
            <td className="w-[6.5rem] py-1 align-top tabular-nums">{clock(plan.start)}</td>
            <td colSpan={2} className="py-1">
              {origin.label}を出る
            </td>
          </tr>
          {plan.stops.map((s) => (
            <Fragment key={s.place.id}>
              <Leg min={s.driveMin} by={s.by} back={s.backMin} from={s.from} to={pt(s.place)} />
              <tr className="border-t border-neutral-300">
                <td className="py-1 align-top tabular-nums">{s.role === "stay" ? `${clock(s.arrive)} 着` : `${clock(s.arrive)}–${clock(s.depart)}`}</td>
                <td className="py-1 align-top">
                  <span className="mr-1 rounded border border-neutral-400 px-1 text-[9pt]">{ROLE[s.role]}</span>
                  {KIND[s.place.kind].icon} <strong>{s.place.name}</strong> <span className="text-neutral-600">{s.place.town}</span>
                </td>
                <td className="py-1 text-right align-top">
                  <a href={placeLink(s.place)} className="text-blue-700 underline">
                    地図
                  </a>
                </td>
              </tr>
              {s.role === "stay" && (
                <tr>
                  <td className="py-1 tabular-nums">{clock(plan.start2)}</td>
                  <td colSpan={2} className="py-1">
                    {s.day + 1}日目 宿を出る
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {plan.dropOff && (
            <>
              <Leg
                min={plan.dropOff.driveMin}
                by="car"
                back={plan.dropOff.backMin}
                from={plan.stops.length ? pt(plan.stops[plan.stops.length - 1].place) : home}
                to={pt(plan.dropOff.place)}
              />
              <tr className="border-t border-neutral-300">
                <td className="py-1 tabular-nums">
                  {clock(plan.dropOff.arrive)}–{clock(plan.dropOff.depart)}
                </td>
                <td className="py-1">
                  <span className="mr-1 rounded border border-neutral-400 px-1 text-[9pt]">返す</span>🚙 <strong>{plan.dropOff.place.name}</strong>
                </td>
                <td />
              </tr>
            </>
          )}
          <Leg min={plan.returnMin} by={plan.returnBy} back={plan.returnBackMin} from={last} to={home} />
          <tr className="border-t border-neutral-300">
            <td className="py-1 tabular-nums">{clock(plan.home)}</td>
            <td colSpan={2} className="py-1">
              {origin.label}に着く（移動 計{Math.floor(plan.driveMin / 60)}時間{plan.driveMin % 60}分）
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-[9pt] text-neutral-600">
        時刻は目安です（車と歩きは、計算していれば Google の実際の道、ほかは直線距離から。電車は乗り換えや本数を考えていません）。各リンクは Google マップで開きます。旅先 で作成。
      </p>
    </article>,
    document.body,
  );
}

