"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line, LineChart,
} from "recharts";

type BarEntry = { label: string; receitas: number; despesas: number; saldo?: number };
type PieEntry = { name: string; value: number };
type AreaEntry = { label: string; saldo: number };
type FlowEntry = { label: string; receitas: number; despesas: number };

const PIE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtK(v: number) {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
}

export function BarChartComponent({ data }: { data: BarEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} barCategoryGap="30%" barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(value, name) => [fmt(Number(value ?? 0)), name === "receitas" ? "Ingresos" : name === "despesas" ? "Gastos" : "Resultado"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
          cursor={{ fill: "#f8fafc" }}
        />
        <Legend formatter={(v) => v === "receitas" ? "Ingresos" : v === "despesas" ? "Gastos" : "Resultado"} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="receitas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
        <Bar dataKey="despesas" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={36} />
        <Line type="monotone" dataKey="saldo" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3, fill: "#0f172a" }} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DailyFlowChartComponent({ data }: { data: FlowEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={22} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(value, name) => [fmt(Number(value ?? 0)), name === "receitas" ? "Ingresos" : "Gastos"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
        />
        <Legend formatter={(v) => v === "receitas" ? "Ingresos" : "Gastos"} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Line type="monotone" dataKey="receitas" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="despesas" stroke="#f43f5e" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChartComponent({ data }: { data: PieEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={238}>
      <BarChart data={data.slice(0, 6)} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 2 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => [fmt(Number(value ?? 0)), "Gastos"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
          cursor={{ fill: "#f8fafc" }}
        />
        <Bar dataKey="value" fill="#f59e0b" radius={[0, 7, 7, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AreaChartComponent({ data }: { data: AreaEntry[] }) {
  const hasNegative = data.some(d => d.saldo < 0);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hasNegative ? "#f59e0b" : "#3b82f6"} stopOpacity={0.35} />
            <stop offset="100%" stopColor={hasNegative ? "#f59e0b" : "#3b82f6"} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(value) => [fmt(Number(value ?? 0)), "Saldo"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
        />
        <Area type="monotone" dataKey="saldo" stroke={hasNegative ? "#f59e0b" : "#3b82f6"} strokeWidth={2} fill="url(#saldoGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PieChartComponent({ data, totalExpense }: { data: PieEntry[]; totalExpense: number }) {
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
