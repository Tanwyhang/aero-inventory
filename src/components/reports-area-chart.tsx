"use client";

import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { FluidEntrySurface } from "@/components/fluid-entry-surface";

export type ReportsAreaDatum = {
  month: string;
  movement: number;
};

export function ReportsAreaChart({ data }: { data: ReportsAreaDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.movement, 0);
  const latest = data.at(-1)?.movement ?? 0;
  const previous = data.at(-2)?.movement ?? 0;
  const trend = previous > 0 ? Math.round(((latest - previous) / previous) * 100) : null;

  return (
    <FluidEntrySurface className="mt-5 rounded-2xl border border-lime/35 bg-lime/10 backdrop-blur-2xl sm:mt-8 sm:rounded-3xl" contentClassName="p-3 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-[-0.05em] sm:text-2xl">Stock In/Out Volume</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-500 sm:text-sm">Monthly inbound and outbound stock movement volume.</p>
        </div>
        <div className="rounded-full bg-lime px-2.5 py-1.5 text-[11px] font-black text-black sm:px-4 sm:py-2 sm:text-sm">{total} units moved</div>
      </div>

      <div className="mt-3 h-[170px] min-w-0 w-full sm:mt-6 sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(24,24,27,0.1)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: "#71717a", fontSize: 12, fontWeight: 700 }} />
            <Tooltip
              cursor={false}
              contentStyle={{ borderRadius: 14, border: "1px solid rgba(24,24,27,0.12)", fontWeight: 700 }}
              formatter={(value) => [`${value} units`, "Movement"]}
            />
            <defs>
              <linearGradient id="fillMovementLime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a3e635" stopOpacity={0.88} />
                <stop offset="95%" stopColor="#a3e635" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <Area dataKey="movement" type="natural" fill="url(#fillMovementLime)" fillOpacity={0.55} stroke="#65a30d" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs font-bold text-zinc-600 sm:mt-5 sm:text-sm">
        {trend === null ? "Add more monthly data to show trend" : `${trend >= 0 ? "Trending up" : "Trending down"} by ${Math.abs(trend)}% this month`}
        {trend !== null ? <TrendingUp className="size-4 text-black" /> : null}
      </div>
    </FluidEntrySurface>
  );
}
