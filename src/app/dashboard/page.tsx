"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { clsx } from "clsx";
import dynamic from "next/dynamic";
import FinanceFilterBar, { type FinanceFilters, defaultFilters, previousRange } from "@/components/FinanceFilterBar";

const BarChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.BarChartComponent),
  { ssr: false, loading: () => <div className="h-[220px] flex items-center justify-center text-slate-300 text-sm">Carregando gráfico...</div> }
);
const PieChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.PieChartComponent),
  { ssr: false, loading: () => <div className="h-[170px] flex items-center justify-center text-slate-300 text-sm">Carregando...</div> }
);
const AreaChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.AreaChartComponent),
  { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center text-slate-300 text-sm">Carregando gráfico...</div> }
);

type Finance = { id: string; type: string; amount: number; category: string; description: string; date: string; mode: string; status?: string };
type Goal = { id: string; title: string; targetAmount: number; currentAmount: number; category: string; status: string };

type DashData = {
  user: { name: string; plan: string; status: string; activeMode: string; trialEndsAt: string };
  personal: { balance: { income: number; expense: number; balance: number } };
  business: { balance: { income: number; expense: number; balance: number } };
  tasks: { pendingCount: number; overdueCount: number; recent: Array<{ id: string; title: string; priority: string; dueDate?: string }> };
  recentTransactions: Array<{ id: string; type: string; amount: number; category: string; description: string; date: string; mode: string }>;
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function pad(n: number) { return String(n).padStart(2, "0"); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

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

function sixMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return { from: toYMD(first), to: toYMD(now) };
}

function buildBarData(finances: Finance[]) {
  const months = lastNMonths(6);
  return months.map(({ key, label }) => {
    const slice = finances.filter(f => f.date.startsWith(key) && f.status !== "pending");
    const receitas = slice.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
    const despesas = slice.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
    return { label, receitas, despesas };
  });
}

function buildPieData(finances: Finance[]) {
  const map: Record<string, number> = {};
  finances.filter(f => f.type === "expense" && f.status !== "pending").forEach(f => {
    map[f.category] = (map[f.category] || 0) + f.amount;
  });
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7)
    .map(([name, value]) => ({ name, value }));
}

// Agrupa por dia se o período for curto (<=45 dias), senão por mês — evita
// eixo com centenas de pontos num período longo.
function buildAreaData(finances: Finance[], from: string, to: string) {
  const posted = finances.filter(f => f.status !== "pending").sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = Math.round((new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime()) / 86_400_000) + 1;
  const byMonth = spanDays > 45;

  const buckets = new Map<string, number>();
  for (const f of posted) {
    const key = byMonth ? f.date.slice(0, 7) : f.date;
    const delta = f.type === "income" ? f.amount : -f.amount;
    buckets.set(key, (buckets.get(key) || 0) + delta);
  }
  const sortedKeys = [...buckets.keys()].sort();
  let running = 0;
  return sortedKeys.map(key => {
    running += buckets.get(key)!;
    const label = byMonth
      ? new Date(key + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
      : new Date(key + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return { label, saldo: running };
  });
}

function applyClientFilters(finances: Finance[], f: FinanceFilters): Finance[] {
  return finances.filter(fin => {
    if (f.type !== "all" && fin.type !== f.type) return false;
    if (f.categories.length > 0 && !f.categories.includes(fin.category)) return false;
    if (f.search.trim() && !fin.description.toLowerCase().includes(f.search.trim().toLowerCase())) return false;
    return true;
  });
}

function sumIncomeExpense(finances: Finance[]) {
  const posted = finances.filter(f => f.status !== "pending");
  const income = posted.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
  const expense = posted.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
  return { income, expense, balance: income - expense };
}

/** % de variação vs período anterior. null quando não dá pra comparar
 *  (base zero) — nesse caso a UI simplesmente omite o indicador. */
function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function TrendBadge({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null) return null;
  const isUp = pct >= 0;
  const isGood = isUp === goodWhenUp;
  return (
    <span className={clsx("text-[11px] font-semibold inline-flex items-center gap-0.5", isGood ? "text-emerald-600" : "text-red-500")}>
      {isUp ? "▲" : "▼"} {Math.abs(pct)}% vs período anterior
    </span>
  );
}

export default function DashboardPage() {
  const [now] = useState(() => Date.now());
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<string>("personal");
  const [categories, setCategories] = useState<string[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [filters, setFilters] = useState<FinanceFilters>(defaultFilters());
  const [finances, setFinances] = useState<Finance[]>([]);
  const [prevFinances, setPrevFinances] = useState<Finance[]>([]);
  const [finances6mo, setFinances6mo] = useState<Finance[]>([]);

  // Carrega dados independentes de filtro: usuário, tarefas, categorias, metas
  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then((d: DashData) => {
        setData(d);
        setMode(d.user?.activeMode || "personal");
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/categories").then(r => r.json()).then(d => {
      setCategories([...new Set([...(d.expense || []), ...(d.income || [])])]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mode) return;
    fetch(`/api/goals?mode=${mode}`).then(r => r.json()).then(d => {
      setGoals((Array.isArray(d) ? d : []).filter((g: Goal) => g.status === "active"));
    }).catch(() => {});
  }, [mode]);

  // Gráfico de 6 meses fica fixo, independente do filtro de período
  useEffect(() => {
    if (!mode) return;
    const { from, to } = sixMonthRange();
    fetch(`/api/finances?mode=${mode}&from=${from}&to=${to}`).then(r => r.json()).then(d => {
      setFinances6mo(d.finances || []);
    }).catch(() => {});
  }, [mode]);

  const fetchFiltered = useCallback((m: string, f: FinanceFilters) => {
    fetch(`/api/finances?mode=${m}&from=${f.from}&to=${f.to}`).then(r => r.json()).then(d => {
      setFinances(d.finances || []);
    }).catch(() => {});
    const prev = previousRange(f.from, f.to);
    fetch(`/api/finances?mode=${m}&from=${prev.from}&to=${prev.to}`).then(r => r.json()).then(d => {
      setPrevFinances(d.finances || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mode) return;
    fetchFiltered(mode, filters);
  }, [mode, filters.from, filters.to, fetchFiltered]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredFinances = useMemo(() => applyClientFilters(finances, filters), [finances, filters]);
  const filteredPrevFinances = useMemo(() => applyClientFilters(prevFinances, filters), [prevFinances, filters]);

  const activeBalance = useMemo(() => sumIncomeExpense(filteredFinances), [filteredFinances]);
  const prevBalance = useMemo(() => sumIncomeExpense(filteredPrevFinances), [filteredPrevFinances]);

  const barData = useMemo(() => buildBarData(finances6mo), [finances6mo]);
  const pieData = useMemo(() => buildPieData(filteredFinances), [filteredFinances]);
  const areaData = useMemo(() => buildAreaData(filteredFinances, filters.from, filters.to), [filteredFinances, filters.from, filters.to]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Carregando...</p>
      </div>
    </div>
  );

  if (!data) return null;

  const { user, tasks, recentTransactions } = data;
  const isPersonal = user.activeMode !== "business";
  const monthLabel = new Date(now).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const trialDays = Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - now) / 86400000));

  const kpis = [
    { label: "Receitas", value: fmt(activeBalance.income), icon: "↑", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", trend: <TrendBadge pct={trendPct(activeBalance.income, prevBalance.income)} goodWhenUp /> },
    { label: "Despesas", value: fmt(activeBalance.expense), icon: "↓", color: "text-red-500", bg: "bg-red-50 border-red-100", trend: <TrendBadge pct={trendPct(activeBalance.expense, prevBalance.expense)} goodWhenUp={false} /> },
    { label: "Saldo", value: fmt(activeBalance.balance), icon: "◈", color: activeBalance.balance >= 0 ? "text-blue-600" : "text-orange-500", bg: activeBalance.balance >= 0 ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100", trend: <TrendBadge pct={trendPct(activeBalance.balance, prevBalance.balance)} goodWhenUp /> },
    { label: "Tarefas Pendentes", value: String(tasks.pendingCount), icon: tasks.overdueCount > 0 ? "⚠" : "☑", color: tasks.overdueCount > 0 ? "text-amber-600" : "text-purple-600", bg: tasks.overdueCount > 0 ? "bg-amber-50 border-amber-100" : "bg-purple-50 border-purple-100", sub: tasks.overdueCount > 0 ? `${tasks.overdueCount} atrasadas` : undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm">{monthLabel}</p>
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

      {/* Filtros */}
      <FinanceFilterBar categories={categories} value={filters} onChange={setFilters} />

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
            {k.trend && <div className="mt-1">{k.trend}</div>}
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Gráfico 1 — Receitas vs Despesas últimos 6 meses (fixo, não segue o filtro) */}
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

        {/* Gráfico 2 — Despesas por Categoria (respeita o filtro) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">🍩 Despesas por Categoria</h3>
            <p className="text-xs text-slate-400 mt-0.5">Período filtrado</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Gráfico 3 — Evolução do saldo acumulado (respeita o filtro) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">📉 Evolução do Saldo</h3>
            <p className="text-xs text-slate-400 mt-0.5">Saldo acumulado no período filtrado</p>
          </div>
          {areaData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-300">
              <p className="text-4xl mb-2">📉</p>
              <p className="text-sm">Sem dados no período</p>
            </div>
          ) : (
            <AreaChartComponent data={areaData} />
          )}
        </div>

        {/* Metas em andamento */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 text-sm mb-4">🎯 Metas em Andamento</h3>
          {goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-300">
              <p className="text-4xl mb-2">🎯</p>
              <p className="text-sm">Nenhuma meta ativa</p>
            </div>
          ) : (
            <div className="space-y-3.5 max-h-48 overflow-y-auto">
              {goals.slice(0, 5).map(g => {
                const pct = g.targetAmount > 0 ? Math.min(100, Math.round(g.currentAmount / g.targetAmount * 100)) : 0;
                return (
                  <div key={g.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 font-medium truncate">{g.title}</span>
                      <span className="font-semibold text-slate-800 shrink-0 ml-2">{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{fmt(g.currentAmount)} de {fmt(g.targetAmount)}</p>
                  </div>
                );
              })}
            </div>
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
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/40 border border-amber-100 rounded-2xl p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span>🚀</span> Como usar pelo WhatsApp
          </h3>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              { icon: "💸", ex: "\"Gastei 50 no mercado\"" },
              { icon: "📋", ex: "\"Criar tarefa: ligar pro cliente\"" },
              { icon: "🎯", ex: "\"Meta: guardar 5000 para viagem\"" },
            ].map(i => (
              <div key={i.ex} className="bg-white rounded-xl p-3 border border-amber-100">
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
