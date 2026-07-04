"use client";
import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

type BarEntry = { label: string; receitas: number; despesas: number };
type PieEntry = { name: string; value: number };

const PIE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtK(v: number) {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
}

export function BarChartComponent({ data }: { data: BarEntry[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-[220px]" />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barCategoryGap="30%" barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(value, name) => [fmt(Number(value ?? 0)), name === "receitas" ? "Receitas" : "Despesas"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
          cursor={{ fill: "#f8fafc" }}
        />
        <Legend formatter={(v) => v === "receitas" ? "Receitas" : "Despesas"} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="receitas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
        <Bar dataKey="despesas" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PieChartComponent({ data, totalExpense }: { data: PieEntry[]; totalExpense: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-[170px]" />;

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={170}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3} dataKey="value">
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [fmt(Number(value ?? 0)), "Total"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="w-full mt-1 space-y-1.5">
        {data.slice(0, 5).map((entry, i) => {
          const pct = totalExpense > 0 ? Math.round(entry.value / totalExpense * 100) : 0;
          return (
            <div key={entry.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-xs text-slate-600 flex-1 truncate">{entry.name}</span>
              <span className="text-xs font-semibold text-slate-700">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
