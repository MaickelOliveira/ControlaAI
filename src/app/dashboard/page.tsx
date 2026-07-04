"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import dynamic from "next/dynamic";

const BarChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.BarChartComponent),
  { ssr: false, loading: () => <div className="h-[220px] flex items-center justify-center text-slate-300 text-sm">Carregando gráfico...</div> }
);
const PieChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.PieChartComponent),
  { ssr: false, loading: () => <div className="h-[170px] flex items-center justify-center text-slate-300 text-sm">Carregando...</div> }
);

type Finance = { id: string; type: string; amount: number; category: string; description: string; date: string; mode: string };

type DashData = {
  user: { name: string; plan: string; status: string; activeMode: string; trialEndsAt: string };
  personal: { balance: { income: number; expense: number; balance: number } };
  business: { balance: { income: number; expense: number; balance: number } };
  tasks: { pendingCount: number; overdueCount: number; recent: Array<{ id: string; title: string; priority: string; dueDate?: string }> };
  recentTransactions: Array<{ id: string; type: string; amount: number; category: string; description: string; date: string; mode: string }>;
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

// Gera lista dos últimos N meses no formato { key: "2026-05", label: "Mai" }
function lastNMonths(n: number) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
  }
  return months;
}

function buildBarData(finances: Finance[]) {
  const months = lastNMonths(6);
  return months.map(({ key, label }) => {
    const slice = finances.filter(f => f.date.startsWith(key));
    const receitas = slice.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
    const despesas = slice.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
    return { label, receitas, despesas };
  });
}

function buildPieData(finances: Finance[]) {
  const map: Record<string, number> = {};
  finances.filter(f => f.type === "expense").forEach(f => {
    map[f.category] = (map[f.category] || 0) + f.amount;
  });
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7)
    .map(([name, value]) => ({ name, value }));
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [finances, setFinances] = useState<Finance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(async (d: DashData) => {
        setData(d);
        const mode = d.user?.activeMode || "personal";
        const fRes = await fetch(`/api/finances?mode=${mode}`);
        const fData = await fRes.json();
        setFinances(fData.finances || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Carregando...</p>
      </div>
    </div>
  );

  if (!data) return null;

  const { user, personal, business, tasks, recentTransactions } = data;
  const isPersonal = user.activeMode !== "business";
  const activeBalance = isPersonal ? personal.balance : business.balance;
  const month = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const trialDays = Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000));

  const barData = buildBarData(finances);
  const pieData = buildPieData(finances);

  const kpis = [
    { label: "Receitas", value: fmt(activeBalance.income), icon: "↑", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
    { label: "Despesas", value: fmt(activeBalance.expense), icon: "↓", color: "text-red-500", bg: "bg-red-50 border-red-100" },
    { label: "Saldo", value: fmt(activeBalance.balance), icon: "◈", color: activeBalance.balance >= 0 ? "text-blue-600" : "text-orange-500", bg: activeBalance.balance >= 0 ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100" },
    { label: "Tarefas Pendentes", value: String(tasks.pendingCount), icon: tasks.overdueCount > 0 ? "⚠" : "☑", color: tasks.overdueCount > 0 ? "text-amber-600" : "text-purple-600", bg: tasks.overdueCount > 0 ? "bg-amber-50 border-amber-100" : "bg-purple-50 border-purple-100", sub: tasks.overdueCount > 0 ? `${tasks.overdueCount} atrasadas` : undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm">{month}</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Olá, {user.name.split(" ")[0]}
            <span className="ml-1">{isPersonal ? "👤" : "🏢"}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{isPersonal ? "Modo Pessoal" : "Modo Empresa"}</p>
        </div>
        {user.status === "trial" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-right">
            <p className="text-xs text-amber-700 font-semibold">⏳ Trial</p>
            <p className="text-xs text-amber-600">{trialDays} dias restantes</p>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={clsx("bg-white border rounded-2xl p-5 shadow-sm", k.bg)}>
            <div className="flex items-center justify-between mb-3">
              <span className={clsx("text-lg font-bold", k.color)}>{k.icon}</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{k.value}</p>
            <p className="text-xs text-slate-500 mt-1">{k.label}</p>
            {k.sub && <p className="text-xs text-amber-600 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Gráfico 1 — Receitas vs Despesas últimos 6 meses */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">📈 Receitas vs Despesas</h3>
            <p className="text-xs text-slate-400 mt-0.5">Últimos 6 meses</p>
          </div>
          {barData.every(d => d.receitas === 0 && d.despesas === 0) ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-300">
              <p className="text-4xl mb-2">📊</p>
              <p className="text-sm">Sem dados ainda</p>
            </div>
          ) : (
            <BarChartComponent data={barData} />
          )}
        </div>

        {/* Gráfico 2 — Despesas por Categoria */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">🍩 Despesas por Categoria</h3>
            <p className="text-xs text-slate-400 mt-0.5">Mês atual</p>
          </div>
          {pieData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-300">
              <p className="text-4xl mb-2">🍩</p>
              <p className="text-sm">Sem despesas</p>
            </div>
          ) : (
            <PieChartComponent data={pieData} totalExpense={activeBalance.expense} />
          )}
        </div>
      </div>

      {/* Transações recentes + Tarefas */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-xs">◈</span>
            Transações Recentes
          </h3>
          {recentTransactions.filter(t => t.mode === user.activeMode).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm text-slate-400 font-medium">Nenhum registro ainda</p>
              <p className="text-xs text-slate-300 mt-1">Envie uma mensagem para o bot!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentTransactions.filter(t => t.mode === user.activeMode).slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-sm", t.type === "income" ? "bg-emerald-100" : "bg-red-100")}>
                      {t.type === "income" ? "↑" : "↓"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{t.description}</p>
                      <p className="text-xs text-slate-400">{t.category}</p>
                    </div>
                  </div>
                  <span className={clsx("text-sm font-semibold", t.type === "income" ? "text-emerald-600" : "text-red-500")}>
                    {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-xs">☑</span>
            Tarefas Pendentes
          </h3>
          {tasks.recent.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">✨</p>
              <p className="text-sm text-slate-400 font-medium">Tudo em dia!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {tasks.recent.map(t => {
                const prColor = t.priority === "high" ? "bg-red-100 text-red-600" : t.priority === "medium" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500";
                return (
                  <div key={t.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl">
                    <div className={clsx("w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", prColor)}>
                      {t.priority === "high" ? "!" : t.priority === "medium" ? "•" : "·"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-slate-400">📅 {new Date(t.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Como usar */}
      {recentTransactions.length === 0 && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span>🚀</span> Como usar pelo WhatsApp
          </h3>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              { icon: "💸", ex: "\"Gastei 50 no mercado\"" },
              { icon: "📋", ex: "\"Criar tarefa: ligar pro cliente\"" },
              { icon: "🎯", ex: "\"Meta: guardar 5000 para viagem\"" },
            ].map(i => (
              <div key={i.ex} className="bg-white rounded-xl p-3 border border-emerald-100">
                <span className="text-xl">{i.icon}</span>
                <p className="text-xs text-slate-500 mt-2 font-mono">{i.ex}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">Cadastre seu número em <strong>Configurações</strong> para começar!</p>
        </div>
      )}
    </div>
  );
}
