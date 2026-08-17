"use client";

import { money } from "@/lib/format";

export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-48 items-end gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">{money(d.value)}</span>
          <div className="flex w-full items-end" style={{ height: 140 }}>
            <div
              className="w-full rounded-t bg-navy transition-all"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 4 }}
            />
          </div>
          <span className="text-[11px] text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

const COLORS = ["#1e293b", "#84cc16", "#3b82f6", "#f59e0b", "#f43f5e", "#8b5cf6"];

export function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let acc = 0;
  const r = 60, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * c;
          const seg = (
            <circle
              key={d.label}
              cx="80" cy="80" r={r}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="24"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc * c}
            />
          );
          acc += frac;
          return seg;
        })}
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="font-semibold">{money(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-600" title={d.label}>{d.label}</span>
          <div className="h-5 flex-1 rounded bg-slate-100">
            <div className="flex h-5 items-center justify-end rounded bg-lime px-2" style={{ width: `${(d.value / max) * 100}%`, minWidth: 40 }}>
              <span className="text-[10px] font-semibold text-navy">{money(d.value)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
