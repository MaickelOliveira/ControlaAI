"use client";
import BankLogo from "@/components/BankLogo";
import FinanceAuthor from "@/components/FinanceAuthor";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { clsx } from "clsx";
import dynamic from "next/dynamic";
import Link from "next/link";
import {useBankUpdates} from "@/components/useBankUpdates";
import {financeOrigin,ledgerBalance,ledgerExpenseGroups,type FinanceLedgerData,type LedgerEntry} from "@/lib/finance-ledger";
import {bankDate} from "@/lib/open-finance-display";
import {bankDashboardAccounts} from "@/lib/bank-dashboard";
import {bankMoney} from "@/lib/open-finance-display";
import DashboardCredit from "@/components/DashboardCredit";
import DashboardAgenda from "@/components/DashboardAgenda";
import EclipseDashboardHeader from "@/components/EclipseDashboardHeader";
import DashboardBalanceSummary from "@/components/DashboardBalanceSummary";
import FinanceFilterBar, { type FinanceFilters, defaultFilters, previousRange } from "@/components/FinanceFilterBar";

const BankDashboard = dynamic(()=>import("@/components/BankDashboard"),{ssr:false});

const BarChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.BarChartComponent),
  { ssr: false, loading: () => <div className="h-[220px] flex items-center justify-center text-subtle text-sm">Carregando gráfico...</div> }
);
const PieChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.PieChartComponent),
  { ssr: false, loading: () => <div className="h-[170px] flex items-center justify-center text-subtle text-sm">Carregando...</div> }
);
const AreaChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.AreaChartComponent),
  { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center text-subtle text-sm">Carregando gráfico...</div> }
);
const CategoryBarChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.CategoryBarChartComponent),
  { ssr: false, loading: () => <div className="h-[238px] animate-pulse rounded-2xl bg-surface-muted" /> }
);
const DailyFlowChartComponent = dynamic(
  () => import("./DashboardCharts").then(m => m.DailyFlowChartComponent),
  { ssr: false, loading: () => <div className="h-[230px] animate-pulse rounded-2xl bg-surface-muted" /> }
);

type Finance = LedgerEntry;
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
    return { label, receitas, despesas, saldo: receitas - despesas };
  });
}

function buildPieData(finances: Finance[]) {
  return ledgerExpenseGroups(finances,"category").sort((a,b)=>b.value-a.value);
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
      ? new Date(key + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
      : new Date(key + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
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
    <span className={clsx("text-[11px] font-semibold inline-flex items-center gap-0.5", isGood ? "text-emerald-ink" : "text-red-500")}>
      {isUp ? "▲" : "▼"} {Math.abs(pct)}% vs período anterior
    </span>
  );
}

function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Carregando dashboard">
      <div className="h-52 rounded-[28px] bg-line" />
      <div className="h-14 rounded-2xl bg-surface-muted" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(item => <div key={item} className="h-32 rounded-2xl bg-surface-muted" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-80 rounded-2xl bg-surface-muted" />
        <div className="h-80 rounded-2xl bg-surface-muted" />
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-52 items-center justify-center rounded-2xl bg-surface-muted text-center text-xs font-medium text-subtle">{label}</div>;
}

export default function DashboardPage() {
  const [now] = useState(() => Date.now());
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<string>("personal");
  const [categories, setCategories] = useState<string[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [filters, setFilters] = useState<FinanceFilters>(defaultFilters());

  const [prevFinances, setPrevFinances] = useState<Finance[]>([]);
  const [history,setHistory]=useState<{mode:string;finances:Finance[];error:string}>({mode:"",finances:[],error:""});
  const finances6mo=useMemo(()=>history.mode===mode?history.finances:[],[history,mode]);
  const ledgerLoader=useCallback(async(signal:AbortSignal):Promise<FinanceLedgerData|null>=>{
    const response=await fetch(`/api/finances/ledger?${new URLSearchParams({mode,from:filters.from,to:filters.to})}`,{cache:"no-store",signal});
    if(response.status===401)return null;
    const body=await response.json();if(!response.ok)throw Error(body.error);return body;
  },[mode,filters.from,filters.to]);
  const {data:ledger,error:ledgerError}=useBankUpdates(ledgerLoader);
  const finances=useMemo(()=>(ledger?.finances??[]).filter(f=>f.included),[ledger]);
  const fetchSequence = useRef(0);

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
    const controller=new AbortController();
    fetch(`/api/finances/ledger?mode=${mode}&from=${from}&to=${to}`,{signal:controller.signal,cache:"no-store"}).then(async r => {if(!r.ok)throw Error("HISTORY_UNAVAILABLE");return r.json();}).then(d => {
      if(!controller.signal.aborted)setHistory({mode,finances:(d.finances || []).filter((f:Finance)=>f.included),error:""});
    }).catch(() => {if(!controller.signal.aborted)setHistory({mode,finances:[],error:"Não foi possível carregar os seis meses. O gráfico não representa valores zerados."});});
    return ()=>controller.abort();
  }, [mode]);

  const fetchFiltered = useCallback((m: string, f: FinanceFilters) => {
    const sequence = ++fetchSequence.current;
    const prev = previousRange(f.from, f.to);
    fetch(`/api/finances/ledger?mode=${m}&from=${prev.from}&to=${prev.to}`).then(async r => {if(!r.ok)throw Error("PERIOD_UNAVAILABLE");return r.json();}).then(d => {
      if (sequence !== fetchSequence.current) return;
      setPrevFinances((d.finances || []).filter((f:Finance)=>f.included));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mode) return;
    fetchFiltered(mode, filters);
  }, [mode, filters.from, filters.to, fetchFiltered]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredFinances = useMemo(() => applyClientFilters(finances, filters), [finances, filters]);
  const filteredPrevFinances = useMemo(() => applyClientFilters(prevFinances, filters), [prevFinances, filters]);

  const activeBalance = useMemo(() => ledgerBalance(filteredFinances), [filteredFinances]);
  const prevBalance = useMemo(() => ledgerBalance(filteredPrevFinances), [filteredPrevFinances]);

  const barData = useMemo(() => buildBarData(finances6mo), [finances6mo]);
  const pieData = useMemo(() => buildPieData(filteredFinances), [filteredFinances]);
  const areaData = useMemo(() => buildAreaData(filteredFinances, filters.from, filters.to), [filteredFinances, filters.from, filters.to]);
  const flowData = useMemo(() => buildFlowData(filteredFinances, filters.from, filters.to), [filteredFinances, filters.from, filters.to]);

  if (loading||(!ledger&&!ledgerError)) return <DashboardLoading />;
  if(!ledger&&ledgerError)return <div className="space-y-5"><h1 className="text-2xl font-bold text-ink">Dashboard</h1><FinanceFilterBar categories={categories} value={filters} onChange={setFilters}/><p role="alert" className="rounded-2xl bg-amber-soft p-5 text-sm text-amber-ink">{ledgerError} Tente reduzir o período. Tentaremos atualizar novamente.</p></div>;

  if (!data) return null;

  const { user, tasks, recentTransactions } = data;
  const monthLabel = new Date(now).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const trialDays = Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - now) / 86400000));
  const rangeDays = Math.max(1, Math.round((new Date(filters.to + "T12:00:00").getTime() - new Date(filters.from + "T12:00:00").getTime()) / 86_400_000) + 1);
  const savingsRate = activeBalance.income > 0 ? Math.round((activeBalance.balance / activeBalance.income) * 100) : 0;
  const averageDailyExpense = activeBalance.expense / rangeDays;
  const topCategory = pieData.find(g=>g.value>0);
  const positiveExpenses=pieData.filter(g=>g.value>0),positiveExpenseTotal=positiveExpenses.reduce((sum,g)=>sum+g.value,0);
  const postedCount = filteredFinances.filter(f => f.status !== "pending").length;
  const rangeLabel = `${new Date(filters.from + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${new Date(filters.to + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
  const cashGroups=ledger?.bank?bankDashboardAccounts(ledger.bank.overview):[];
  const primaryCash=cashGroups.find(group=>group.currency==="BRL")??cashGroups[0];
  const cashValue=primaryCash?bankMoney(primaryCash.total,primaryCash.currency):"—";

  return (
    <div className="z-page z-eclipse-dashboard pb-8">
      <EclipseDashboardHeader name={user.name} mode={user.activeMode} monthLabel={monthLabel} syncAt={ledger?.bank?.report.last_successful_sync_at} updating={ledger?.bank?.report.sync_pending}/>
      <FinanceFilterBar categories={[...new Set([...categories,...finances.map(f=>f.category)])]} value={filters} onChange={setFilters}/>
      {user.status==="trial"&&<p className="text-xs text-amber-ink">Trial · {trialDays} dias</p>}
      {ledgerError&&<p role="alert" className="rounded-xl bg-amber-soft p-4 text-xs text-amber-ink">{ledgerError} Os valores exibidos podem estar desatualizados.</p>}
      <div className="z-eclipse-grid">
        <div className="min-w-0">
          <section className="z-eclipse-focus" aria-label="Visão geral financeira">
            <div className="z-card-heading"><h2>Visão geral financeira</h2><span className="rounded-full border border-white/20 px-3 py-1.5 text-[10px] text-white/70">{rangeLabel}</span></div>
            <div className="z-eclipse-stats">
              <div className="z-eclipse-stat"><span>Saldo disponível nas contas</span><strong>{cashValue}</strong><small>{primaryCash?`${primaryCash.accounts.length} conta(s) · ${primaryCash.currency}${primaryCash.missing?" · há saldos não informados":""}`:"Conecte um banco em Contas"}</small></div>
              <div className="z-eclipse-stat"><span>Entradas do período</span><strong>{fmt(activeBalance.income)}</strong>{!ledger?.bank&&<TrendBadge pct={trendPct(activeBalance.income,prevBalance.income)} goodWhenUp/>}<small>Todas as origens</small></div>
              <div className="z-eclipse-stat"><span>Saídas do período</span><strong>{fmt(activeBalance.expense)}</strong>{!ledger?.bank&&<TrendBadge pct={trendPct(activeBalance.expense,prevBalance.expense)} goodWhenUp={false}/>}<small>Contas, cartões e registros</small></div>
              <div className="z-eclipse-stat"><DashboardBalanceSummary balance={activeBalance} compact/></div>
            </div>
            <div className="mb-4 flex justify-between gap-3"><h3 className="text-sm font-medium">Entradas e saídas</h3><span className="text-[10px] text-white/50">Últimos 6 meses</span></div>
            {history.mode!==mode?<div className="z-chart-empty">Carregando histórico…</div>:history.error?<p role="alert" className="z-chart-empty">{history.error}</p>:barData.every(d=>d.receitas===0&&d.despesas===0)?<div className="z-chart-empty">Seu histórico financeiro aparecerá aqui.</div>:<DailyFlowChartComponent data={barData}/>}
            {ledger?.bank&&<p className="mt-3 text-[10px] leading-5 text-white/50">Saldo: posição recebida do banco. Resultado: entradas menos saídas do período. Última importação: {bankDate(ledger.bank.report.last_successful_sync_at)}{ledger.bank.report.sync_pending?" · atualizando":""}. O histórico bancário pode estar incompleto.</p>}
            {cashGroups.length>1&&<p className="mt-2 text-[10px] text-white/70">Outras moedas: {cashGroups.filter(group=>group!==primaryCash).map(group=>bankMoney(group.total,group.currency)).join(" · ")} · exibidas separadamente.</p>}
          </section>
          <div className="z-eclipse-secondary">
            <article className="z-card"><div className="z-card-heading"><h2>Onde você gastou</h2><span className="z-badge">{rangeLabel}</span></div>{positiveExpenses.length?<PieChartComponent data={positiveExpenses} totalExpense={positiveExpenseTotal}/>:<div className="z-empty">Sem despesas positivas neste período.</div>}{pieData.some(g=>g.value<0)&&<p className="mt-3 text-[10px] text-emerald-ink">Estornos líquidos aparecem no ranking, fora desta participação.</p>}</article>
            <article className="z-card"><div className="z-card-heading"><h2>Últimas movimentações</h2><Link href="/dashboard/financas">Ver todas →</Link></div>{!filteredFinances.length?<div className="z-empty">Nenhuma movimentação neste período.</div>:filteredFinances.slice(0,6).map(transaction=><div key={transaction.id} className="z-transaction-row"><span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-xl",transaction.type==="income"?"bg-emerald-soft text-emerald-ink":"bg-red-soft text-red-ink")}>{transaction.type==="income"?"↗":"↘"}</span><div className="min-w-0 flex-1"><p className="truncate">{transaction.description}</p><small>{transaction.category}</small><span className="z-badge ml-1 inline-flex items-center gap-1.5">{transaction.bank&&<BankLogo institutionId={transaction.bank.institution_id} size={24}/>}<span>{financeOrigin(transaction)}</span></span><FinanceAuthor name={transaction.registeredByName}/></div><strong className={transaction.type==="income"?"text-emerald-ink":"text-red-ink"}>{transaction.type==="income"?"+":"−"}{fmt(transaction.amount)}</strong></div>)}</article>
          </div>
        </div>
        <aside className="z-eclipse-rail" aria-label="Crédito e planejamento">
          <DashboardCredit overview={ledger?.bank?.overview??null}/>
          <DashboardAgenda/>
          <article className="z-card"><div className="z-card-heading"><h2>Tarefas</h2><Link href="/dashboard/tarefas">Ver todas →</Link></div><p className="mb-3 text-[11px] text-subtle">{tasks.pendingCount} pendente(s){tasks.overdueCount?` · ${tasks.overdueCount} atrasada(s)`:" · tudo dentro do prazo"}</p>{tasks.recent.length?tasks.recent.slice(0,4).map(task=><Link href="/dashboard/tarefas" key={task.id} className="z-task-item"><span className="z-task-dot">{task.priority==="high"?"!":""}</span><span className="truncate">{task.title}</span></Link>):<div className="z-empty">Tudo em dia.</div>}<Link href="/dashboard/tarefas" className="mt-3 block rounded-full border border-line py-2.5 text-center text-[11px]">+ Nova tarefa</Link></article>
          <article className="z-card"><div className="z-card-heading"><h2>Suas metas</h2><Link href="/dashboard/metas">Ver todas →</Link></div>{goals.length?goals.slice(0,3).map(goal=>{const pct=goal.targetAmount>0?Math.min(100,Math.round(goal.currentAmount/goal.targetAmount*100)):0;return <div key={goal.id} className="mb-4 last:mb-0"><div className="mb-2 flex justify-between text-xs"><span className="truncate">{goal.title}</span><strong>{pct}%</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-primary" style={{width:`${pct}%`}}/></div><p className="mt-1.5 text-[10px] text-subtle">{fmt(goal.currentAmount)} de {fmt(goal.targetAmount)}</p></div>;}):<div className="z-empty">Qual é seu próximo objetivo?<br/><Link href="/dashboard/metas" className="text-amber-ink">Criar uma meta →</Link></div>}</article>
        </aside>
      </div>
      <section className="space-y-5" aria-label="Análise financeira completa"><h2 className="text-lg font-semibold text-ink">Análise financeira completa</h2>
        <div className="grid gap-4 sm:grid-cols-3 mb-4"><div className="z-card"><p className="text-xs text-subtle">Média diária de gastos</p><strong className="mt-2 block text-lg">{fmt(averageDailyExpense)}</strong></div><div className="z-card"><p className="text-xs text-subtle">Maior categoria</p><strong className="mt-2 block text-lg">{topCategory?`${topCategory.name} · ${fmt(topCategory.value)}`:"Sem despesas"}</strong></div><div className="z-card"><p className="text-xs text-subtle">Taxa de economia · {postedCount} movimentos</p><strong className="mt-2 block text-lg">{savingsRate}%</strong></div></div>
        <div className="grid gap-5 lg:grid-cols-12"><article className="z-card lg:col-span-8"><div className="z-card-heading"><h2>Receitas, despesas e resultado</h2></div>{history.error?<p role="alert" className="text-amber-ink text-xs">{history.error}</p>:<BarChartComponent data={barData}/>}</article><article className="z-card lg:col-span-4"><div className="z-card-heading"><h2>Ranking de categorias</h2></div>{pieData.length?<CategoryBarChartComponent data={pieData}/>:<EmptyChart label="Sem categorias para comparar"/>}</article><BankDashboard data={ledger?.bank??null} entries={filteredFinances}/><article className="z-card lg:col-span-12"><div className="z-card-heading"><h2>Evolução do resultado</h2></div>{areaData.length?<AreaChartComponent data={areaData}/>:<EmptyChart label="Sem movimentações no período"/>}</article><article className="z-card lg:col-span-12"><div className="z-card-heading"><h2>Ritmo das movimentações</h2></div>{flowData.length?<DailyFlowChartComponent data={flowData}/>:<EmptyChart label="Sem fluxo para visualizar"/>}</article></div>
      </section>
      {recentTransactions.length===0&&<p className="text-xs text-subtle">Comece pelo WhatsApp: “Gastei 50 no mercado”, “Criar tarefa: ligar para o cliente” ou “Meta: guardar 5000 para viagem”.</p>}
    </div>
  );
}
