"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { clsx } from "clsx";
import dynamic from "next/dynamic";
import Link from "next/link";
import FinanceFilterBar, { type FinanceFilters, defaultFilters, previousRange } from "@/components/pt/FinanceFilterBar";

const BarChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.BarChartComponent),
  { ssr: false, loading: () => <div className="h-[220px] flex items-center justify-center text-slate-300 text-sm">A carregar gráfico...</div> }
);
const PieChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.PieChartComponent),
  { ssr: false, loading: () => <div className="h-[170px] flex items-center justify-center text-slate-300 text-sm">A carregar...</div> }
);
const AreaChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.AreaChartComponent),
  { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center text-slate-300 text-sm">A carregar gráfico...</div> }
);
const CategoryBarChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.CategoryBarChartComponent),
  { ssr: false, loading: () => <div className="h-[238px] animate-pulse rounded-2xl bg-slate-50" /> }
);
const DailyFlowChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.DailyFlowChartComponent),
  { ssr: false, loading: () => <div className="h-[230px] animate-pulse rounded-2xl bg-slate-50" /> }
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

function fmt(v: number) { return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" }); }
function pad(n: number) { return String(n).padStart(2, "0"); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Gera lista dos últimos N meses no formato { key: "2026-05", label: "mai" }
function lastNMonths(n: number) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""),
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
    return { label, receitas, despesas, saldo: receitas - despesas };
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
      ? new Date(key + "-01T12:00:00").toLocaleDateString("pt-PT", { month: "short" }).replace(".", "")
      : new Date(key + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
    return { label, saldo: running };
  });
}

function buildFlowData(finances: Finance[], from: string, to: string) {
  const posted = finances.filter(f => f.status !== "pending").sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = Math.round((new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime()) / 86_400_000) + 1;
  const byMonth = spanDays > 45;
  const buckets = new Map<string, { receitas: number; despesas: number }>();
  for (const finance of posted) {
    const key = byMonth ? finance.date.slice(0, 7) : finance.date;
    const current = buckets.get(key) ?? { receitas: 0, despesas: 0 };
    if (finance.type === "income") current.receitas += finance.amount;
    else current.despesas += finance.amount;
    buckets.set(key, current);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, totals]) => ({
    label: byMonth
      ? new Date(key + "-01T12:00:00").toLocaleDateString("pt-PT", { month: "short" }).replace(".", "")
      : new Date(key + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }),
    ...totals,
  }));
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

function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="A carregar dashboard">
      <div className="h-52 rounded-[28px] bg-slate-200" />
      <div className="h-14 rounded-2xl bg-slate-100" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(item => <div key={item} className="h-32 rounded-2xl bg-slate-100" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-80 rounded-2xl bg-slate-100" />
        <div className="h-80 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-52 items-center justify-center rounded-2xl bg-slate-50 text-center text-xs font-medium text-slate-400">{label}</div>;
}

function EmptyList({ label }: { label: string }) {
  return <div className="flex h-36 items-center justify-center rounded-2xl bg-slate-50 text-center text-xs font-medium text-slate-400">{label}</div>;
}

function PanelTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      <Link href={href} className="text-[11px] font-semibold text-amber-600 transition hover:text-amber-700">Ver tudo →</Link>
    </div>
  );
}

export default function DashboardPagePt() {
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
  const flowData = useMemo(() => buildFlowData(filteredFinances, filters.from, filters.to), [filteredFinances, filters.from, filters.to]);

  if (loading) return <DashboardLoading />;

  if (!data) return null;

  const { user, tasks, recentTransactions } = data;
  const isPersonal = user.activeMode !== "business";
  const monthLabel = new Date(now).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  const trialDays = Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - now) / 86400000));
  const rangeDays = Math.max(1, Math.round((new Date(filters.to + "T12:00:00").getTime() - new Date(filters.from + "T12:00:00").getTime()) / 86_400_000) + 1);
  const savingsRate = activeBalance.income > 0 ? Math.round((activeBalance.balance / activeBalance.income) * 100) : 0;
  const averageDailyExpense = activeBalance.expense / rangeDays;
  const topCategory = pieData[0];
  const postedCount = filteredFinances.filter(f => f.status !== "pending").length;
  const rangeLabel = `${new Date(filters.from + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })} — ${new Date(filters.to + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}`;

  const kpis = [
    { label: "Receitas", value: fmt(activeBalance.income), icon: "↗", color: "text-emerald-600", accent: "bg-emerald-500", trend: <TrendBadge pct={trendPct(activeBalance.income, prevBalance.income)} goodWhenUp /> },
    { label: "Despesas", value: fmt(activeBalance.expense), icon: "↘", color: "text-rose-600", accent: "bg-rose-500", trend: <TrendBadge pct={trendPct(activeBalance.expense, prevBalance.expense)} goodWhenUp={false} /> },
    { label: "Taxa de poupança", value: `${savingsRate}%`, icon: "◎", color: savingsRate >= 0 ? "text-blue-600" : "text-orange-600", accent: savingsRate >= 0 ? "bg-blue-500" : "bg-orange-500", sub: savingsRate >= 20 ? "Ótimo ritmo no período" : savingsRate >= 0 ? "Há espaço para melhorar" : "Despesas acima das receitas" },
    { label: "Tarefas pendentes", value: String(tasks.pendingCount), icon: tasks.overdueCount > 0 ? "!" : "✓", color: tasks.overdueCount > 0 ? "text-amber-600" : "text-violet-600", accent: tasks.overdueCount > 0 ? "bg-amber-500" : "bg-violet-500", sub: tasks.overdueCount > 0 ? `${tasks.overdueCount} atrasada${tasks.overdueCount > 1 ? "s" : ""}` : "Tudo dentro do prazo" },
  ];

  return (
    <div className="space-y-7 pb-8">
      <section className="relative overflow-hidden rounded-[28px] bg-slate-950 px-5 py-6 text-white shadow-xl shadow-slate-300/40 sm:px-7 sm:py-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-400/20 blur-2xl" />
        <div className="absolute -bottom-24 right-1/3 h-44 w-44 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-200">
                {isPersonal ? "Modo pessoal" : "Modo empresa"}
              </span>
              <span className="text-xs capitalize text-slate-400">{monthLabel}</span>
              {user.status === "trial" && <span className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-slate-950">Trial · {trialDays} dias</span>}
            </div>
            <p className="text-sm text-slate-400">Olá, {user.name.split(" ")[0]}. Este é o teu resultado no período.</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{fmt(activeBalance.balance)}</h1>
              <span className={clsx("mb-1 rounded-full px-2.5 py-1 text-xs font-semibold", activeBalance.balance >= 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300")}>
                {activeBalance.balance >= 0 ? "Saldo positivo" : "Atenção ao saldo"}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">Saldo de {rangeLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pt/dashboard/financas" className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300">+ Movimentação</Link>
            <Link href="/pt/dashboard/tarefas" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15">+ Tarefa</Link>
            <Link href="/pt/dashboard/metas" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15">+ Meta</Link>
          </div>
        </div>
      </section>

      <FinanceFilterBar categories={categories} value={filters} onChange={setFilters} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map(k => (
          <div key={k.label} className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <div className={clsx("absolute inset-x-0 top-0 h-1", k.accent)} />
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">{k.label}</p>
              <span className={clsx("flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-base font-bold", k.color)}>{k.icon}</span>
            </div>
            <p className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{k.value}</p>
            {k.sub && <p className="mt-1 text-[11px] text-slate-400">{k.sub}</p>}
            {k.trend && <div className="mt-1.5">{k.trend}</div>}
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Média diária de gastos</p>
          <p className="mt-1 text-base font-bold text-slate-800">{fmt(averageDailyExpense)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Maior categoria</p>
          <p className="mt-1 truncate text-base font-bold text-slate-800">{topCategory ? `${topCategory.name} · ${fmt(topCategory.value)}` : "Sem despesas"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Movimentações no período</p>
          <p className="mt-1 text-base font-bold text-slate-800">{postedCount} registo{postedCount === 1 ? "" : "s"}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Análise financeira</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Entende o teu dinheiro em vários ângulos</h2>
          <p className="mt-1 text-sm text-slate-400">Os gráficos abaixo acompanham os filtros selecionados, exceto o histórico de seis meses.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-8">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><h3 className="font-semibold text-slate-800">Receitas, despesas e resultado</h3><p className="mt-0.5 text-xs text-slate-400">Comparativo dos últimos 6 meses</p></div>
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">6 meses</span>
            </div>
            {barData.every(d => d.receitas === 0 && d.despesas === 0) ? <EmptyChart label="Sem histórico financeiro" /> : <BarChartComponent data={barData} />}
          </article>
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-4">
            <div className="mb-3"><h3 className="font-semibold text-slate-800">Participação das despesas</h3><p className="mt-0.5 text-xs text-slate-400">Quanto cada categoria representa</p></div>
            {pieData.length === 0 ? <EmptyChart label="Sem despesas no período" /> : <PieChartComponent data={pieData} totalExpense={activeBalance.expense} />}
          </article>
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-7">
            <div className="mb-4"><h3 className="font-semibold text-slate-800">Evolução do saldo</h3><p className="mt-0.5 text-xs text-slate-400">Acumulado ao longo do período</p></div>
            {areaData.length === 0 ? <EmptyChart label="Sem movimentações no período" /> : <AreaChartComponent data={areaData} />}
          </article>
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-5">
            <div className="mb-3"><h3 className="font-semibold text-slate-800">Ranking de categorias</h3><p className="mt-0.5 text-xs text-slate-400">Onde concentraste mais os teus gastos</p></div>
            {pieData.length === 0 ? <EmptyChart label="Sem categorias para comparar" /> : <CategoryBarChartComponent data={pieData} />}
          </article>
        </div>

        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-semibold text-slate-800">Ritmo das movimentações</h3><p className="mt-0.5 text-xs text-slate-400">Picos de entradas e saídas no período selecionado</p></div>
            <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">{rangeLabel}</span>
          </div>
          {flowData.length === 0 ? <EmptyChart label="Sem fluxo para visualizar" /> : <DailyFlowChartComponent data={flowData} />}
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Planeamento</p><h2 className="mt-1 text-xl font-bold text-slate-900">Próximos passos</h2></div>
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <PanelTitle title="Metas em curso" href="/pt/dashboard/metas" />
            {goals.length === 0 ? <EmptyList label="Nenhuma meta ativa" /> : <div className="space-y-4">{goals.slice(0, 4).map(g => {
              const pct = g.targetAmount > 0 ? Math.min(100, Math.round(g.currentAmount / g.targetAmount * 100)) : 0;
              return <div key={g.id}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate font-medium text-slate-700">{g.title}</span><span className="font-bold text-slate-800">{pct}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">{fmt(g.currentAmount)} de {fmt(g.targetAmount)}</p></div>;
            })}</div>}
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <PanelTitle title="Transações recentes" href="/pt/dashboard/financas" />
            {recentTransactions.filter(t => t.mode === user.activeMode).length === 0 ? <EmptyList label="Nenhuma transação ainda" /> : <div className="space-y-1">{recentTransactions.filter(t => t.mode === user.activeMode).slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0"><span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold", t.type === "income" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>{t.type === "income" ? "↗" : "↘"}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700">{t.description}</p><p className="text-[10px] text-slate-400">{t.category}</p></div><span className={clsx("text-xs font-bold", t.type === "income" ? "text-emerald-600" : "text-rose-600")}>{t.type === "income" ? "+" : "-"}{fmt(t.amount)}</span></div>
            ))}</div>}
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <PanelTitle title="Tarefas pendentes" href="/pt/dashboard/tarefas" />
            {tasks.recent.length === 0 ? <EmptyList label="Tudo em dia" /> : <div className="space-y-2">{tasks.recent.slice(0, 5).map(t => {
              const prColor = t.priority === "high" ? "bg-rose-50 text-rose-600" : t.priority === "medium" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500";
              return <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5"><span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold", prColor)}>{t.priority === "high" ? "!" : "•"}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700">{t.title}</p>{t.dueDate && <p className="mt-0.5 text-[10px] text-slate-400">Prazo {new Date(t.dueDate + "T12:00:00").toLocaleDateString("pt-PT")}</p>}</div></div>;
            })}</div>}
          </article>
        </div>
      </section>

      {recentTransactions.length === 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-bold text-slate-800">Começa pelo WhatsApp</h3><p className="mt-1 text-sm text-slate-500">Experimenta enviar “Gastei 50 no supermercado”, “Criar tarefa: ligar para o cliente” ou “Meta: poupar 5000 para uma viagem”.</p></section>
      )}
    </div>
  );
}
