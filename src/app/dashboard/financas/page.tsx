"use client";
import { useSearchParams } from "next/navigation";
import PageTitle from "@/components/PageTitle";
import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from "react";
import { clsx } from "clsx";
import FinanceFilterBar, { type FinanceFilters, defaultFilters } from "@/components/FinanceFilterBar";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";
import OpenFinanceFinancial from "@/components/OpenFinanceFinancial";
import BankCategoryDialog from "@/components/BankCategoryDialog";
import BankCreditPixDialog from "@/components/BankCreditPixDialog";
import FinanceLedgerRows from "@/components/FinanceLedgerRows";
import FinanceInstallmentProjections from "@/components/FinanceInstallmentProjections";
import {useBankUpdates} from "@/components/useBankUpdates";
import FinanceCategorySummary from "@/components/FinanceCategorySummary";
import FinanceBankSchedules from "@/components/FinanceBankSchedules";
import {financeBankSchedules} from "@/lib/finance-bank-schedules";
import {projectBankInstallments} from "@/lib/bank-installment-projections";
import {normalizeBankText} from "@/lib/bank-question-parser";
import {financeAccountOptions,matchesFinanceAccount} from "@/lib/finance-account-filter";
import {ledgerCategoryGroups,ledgerBalance,type FinanceLedgerData,type LedgerEntry} from "@/lib/finance-ledger";

type Finance = LedgerEntry;
type Balance = { income: number; expense: number; balance: number };
type Recurring = {
  id: string;
  type: "income" | "expense";
  amount: number;
  totalAmount?: number;
  category: string;
  description: string;
  mode: string;
  recurrenceType: "installment" | "recurring";
  totalInstallments?: number;
  paidInstallments: number;
  repeatUnit: "daily" | "weekly" | "monthly" | "yearly";
  dayOfMonth?: number;
  nextDueDate: string;
  startDate: string;
  status: "active" | "completed" | "cancelled";
};

function fmt(v: number | undefined | null) { return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d: string) { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR"); }
function fmtMonth(d: string) { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); }
function purchaseDateFromDescription(description: string): string | undefined {
  const match = description.match(/\bcompra em (\d{2})\/(\d{2})\/(\d{4})\b/i);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}
function visibleFinanceDescription(description: string) {
  return description.replace(/\s*·\s*compra em \d{2}\/\d{2}\/\d{4}\s*$/i, "").trim();
}
function visibleFinanceDate(finance: Finance) {
  const purchaseDate = purchaseDateFromDescription(finance.description);
  if (!purchaseDate || purchaseDate === finance.date) return fmtDate(finance.date);
  return `Compra em ${fmtDate(purchaseDate)} · competência ${finance.date.slice(5, 7)}/${finance.date.slice(0, 4)}`;
}

const UNIT_LABEL: Record<string, string> = { monthly: "Mensal", weekly: "Semanal", daily: "Diário", yearly: "Anual" };

type FormState = {
  type: "expense" | "income";
  frequency: "once" | "recurring" | "installment";
  amount: string;
  category: string;
  description: string;
  totalInstallments: string;
  repeatUnit: "monthly" | "weekly" | "daily" | "yearly";
  dayOfMonth: string;
  startDate: string;
  totalAmount: string;
};

const EMPTY_FORM: FormState = {
  type: "expense", frequency: "once", amount: "", category: "", description: "",
  totalInstallments: "", repeatUnit: "monthly", dayOfMonth: "",
  startDate: new Date().toISOString().slice(0, 10), totalAmount: "",
};

function FinancasContent() {
  const [mode, setMode] = useState("");

  const [recs, setRecs] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FinanceFilters>(() => {
    const defaults = defaultFilters();
    const from = searchParams.get("from"), to = searchParams.get("to");
    const validDate = (date: string | null): date is string => !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    return validDate(from) && validDate(to) && from <= to ? { ...defaults, from, to } : defaults;
  });

  const loadSequence = useRef(0);
  const [visibleCount,setVisibleCount]=useState(50);
  const loader=useCallback(async(signal:AbortSignal):Promise<FinanceLedgerData|null>=>{
    if(!mode)return null;
    const query=new URLSearchParams({mode,from:filters.from,to:filters.to});
    const response=await fetch(`/api/finances/ledger?${query}`,{cache:"no-store",signal});
    if(response.status===401)return null;
    const body=await response.json();if(!response.ok)throw Error(body.error);return body;
  },[mode,filters.from,filters.to]);
  const {data:ledger,setData:setLedger,error:ledgerError}=useBankUpdates(loader,!!mode);
  const finances=useMemo(()=>ledger?.finances??[],[ledger]);
  const accountOptions=useMemo(()=>financeAccountOptions(ledger),[ledger]);
  const totalBalance:Balance=ledger?.totalBalance??{income:0,expense:0,balance:0};

  const [bankCategoryTarget,setBankCategoryTarget]=useState<LedgerEntry|null>(null);
  const [bankCreditPixId,setBankCreditPixId]=useState<string|null>(null);
  const bankCreditPixTarget=finances.find(entry=>entry.id===bankCreditPixId)?.bank;
  const [catsExpense, setCatsExpense] = useState<string[]>([]);
  const [catsIncome, setCatsIncome] = useState<string[]>([]);

  // modal nova categoria
  const [showCatModal, setShowCatModal] = useState(false);
  const [catType, setCatType] = useState<"expense" | "income">("expense");
  const [catName, setCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState("");
  const [customExpense, setCustomExpense] = useState<string[]>([]);
  const [customIncome, setCustomIncome] = useState<string[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<Finance | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", category: "", description: "", date: "" });

  const [editRec, setEditRec] = useState<Recurring | null>(null);
  const [editRecForm, setEditRecForm] = useState({ amount: "", description: "", category: "", dayOfMonth: "", repeatUnit: "monthly" as Recurring["repeatUnit"] });

  const [deleteTarget, setDeleteTarget] = useState<Finance | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [cancellingRec, setCancellingRec] = useState<string | null>(null);
  const [confirmingPending, setConfirmingPending] = useState<string | null>(null);

  const [banner, setBanner] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState("");
  type ImportItem = { date: string; purchaseDate?: string; description: string; amount: number; category: string; duplicate: boolean; selected: boolean; installmentCurrent?: number; installmentTotal?: number; installmentsRemaining?: number };
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [importMeta, setImportMeta] = useState<{ bankName?: string; closingDay?: number; dueDay?: number; dueDate?: string; billingReferenceMonth?: string; sourceTransactionCount?: number; ignoredTransactionCount?: number; probableRepeat?: boolean; alreadyRegisteredCount?: number }>({});

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  function openImport() {
    setImportFile(null); setImportError(""); setImportItems([]); setImportMeta({}); setShowImport(true);
  }

  async function handleAnalyzeInvoice() {
    if (!importFile) return;
    setImportLoading(true); setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("mode", mode);
      const res = await fetch("/api/finances/import-invoice", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || "Erro ao analisar fatura"); return; }
      setImportItems((data.transactions || []).map((t: Omit<ImportItem, "selected">) => ({ ...t, selected: !t.duplicate })));
      setImportMeta({ bankName: data.bankName, closingDay: data.closingDay, dueDay: data.dueDay, dueDate: data.dueDate, billingReferenceMonth: data.billingReferenceMonth, sourceTransactionCount: data.sourceTransactionCount, ignoredTransactionCount: data.ignoredTransactionCount, probableRepeat: data.probableRepeat, alreadyRegisteredCount: data.alreadyRegisteredCount });
    } catch {
      setImportError("Erro de conexão");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleConfirmImport() {
    const selected = importItems.filter(i => i.selected);
    if (selected.length === 0) return;
    setImportSaving(true); setImportError("");
    try {
      const res = await fetch("/api/finances/import-invoice/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, ...importMeta, items: selected.map(({ date, purchaseDate, description, amount, category, installmentCurrent, installmentTotal, installmentsRemaining }) => ({ date, purchaseDate, description, amount, category, installmentCurrent, installmentTotal, installmentsRemaining })) }),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || "Erro ao importar"); return; }
      setShowImport(false);
      const trackedInstallments = (data.installmentTracking?.created || 0) + (data.installmentTracking?.advanced || 0);
      setBanner(`✅ ${data.imported} lançamento(s) importado(s) da fatura!${data.accountName ? ` Conta: ${data.accountName}${data.accountCreated ? " (criada agora)" : ""}.` : ""}${trackedInstallments ? ` ${trackedInstallments} compra(s) parcelada(s) ficaram em acompanhamento.` : ""}`);
      setFilters(prev => ({ ...prev, from: data.importedFrom || prev.from, to: data.importedTo || prev.to, categories: [], type: "expense", search: "" }));
    } catch {
      setImportError("Erro de conexão");
    } finally {
      setImportSaving(false);
    }
  }

  function loadCategories() {
    fetch("/api/categories").then(r => r.json()).then(d => {
      setCatsExpense(d.expense || []);
      setCatsIncome(d.income || []);
      const defaults = { expense: ["Alimentação", "Delivery","Transporte","Moradia","Saúde","Educação","Lazer","Vestuário","Tecnologia","Serviços","Impostos","Funcionários","Marketing","Fornecedores","Outros"], income: ["Salário","Freelance","Vendas","Investimentos","Aluguel","Serviços","Reembolso","Outros"] };
      setCustomExpense((d.expense || []).filter((c: string) => !defaults.expense.includes(c)));
      setCustomIncome((d.income || []).filter((c: string) => !defaults.income.includes(c)));
    }).catch(() => {});
  }

  function loadAll(m: string,refreshLedger=true) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    Promise.allSettled([
      refreshLedger?fetch(`/api/finances/ledger?mode=${m}&from=${filters.from}&to=${filters.to}`,{cache:"no-store"}).then(async r => {const body=await r.json();if(!r.ok)throw Error(body.error);return body;}):Promise.resolve(null),
      fetch(`/api/recurring?mode=${m}&status=active`).then(r => r.json()),
    ]).then(([fd, rd]) => {
      if (sequence !== loadSequence.current) return;
      if(fd.status==="fulfilled"&&fd.value)setLedger(fd.value);
      if(rd.status==="fulfilled")setRecs(Array.isArray(rd.value) ? rd.value : []);
      setLoading(false);
    }).catch(() => { if (sequence === loadSequence.current) setLoading(false); });
  }

  // Recarrega quando o período do filtro muda (categoria/tipo/busca filtram
  // client-side sobre o que já foi buscado, sem precisar de novo fetch).
  useEffect(() => {
    if (!mode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inicia o carregamento quando período/modo muda
    loadAll(mode,false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filters.from, filters.to]);

  useEffect(() => {
    fetchDashboardMe().then(d => {
      const m = d.user?.activeMode || "personal";
      setMode(m);
      loadCategories();
    });
  }, []);

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    setCatSaving(true);
    setCatError("");
    const res = await fetch("/api/categories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: catType, name: catName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setCatError(data.error || "Erro ao salvar"); setCatSaving(false); return; }
    setCatSaving(false);
    setCatName("");
    setShowCatModal(false);
    loadCategories();
  }

  async function handleDeleteCategory(type: "expense" | "income", name: string) {
    await fetch("/api/categories", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name }),
    });
    loadCategories();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (form.frequency === "once") {
      await fetch("/api/finances", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, amount: parseFloat(form.amount), category: form.category, description: form.description, mode }),
      });
    } else {
      await fetch("/api/recurring", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type, amount: form.amount,
          totalAmount: form.totalAmount || undefined,
          category: form.category || "Outros",
          description: form.description, mode,
          recurrenceType: form.frequency === "installment" ? "installment" : "recurring",
          totalInstallments: form.frequency === "installment" ? form.totalInstallments : undefined,
          repeatUnit: form.repeatUnit,
          dayOfMonth: form.dayOfMonth || undefined,
          startDate: form.startDate,
        }),
      });
    }
    setSaving(false);
    setShowForm(false);
    setForm(EMPTY_FORM);
    loadAll(mode);
  }

  function openEdit(f: Finance) {
    setEditTarget(f);
    setEditForm({ amount: String(f.amount), category: f.category, description: f.description, date: f.date });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    await fetch(`/api/finances/${editTarget.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseFloat(editForm.amount), category: editForm.category, description: editForm.description, date: editForm.date }),
    });
    setEditTarget(null);
    loadAll(mode);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/finances/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    loadAll(mode);
  }

  function toggleSelectMode() {
    setSelectMode(s => !s);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || bulkDeleting) return;
    if (!window.confirm(`Excluir ${selectedIds.size} lançamento(s) selecionado(s)? Essa ação não pode ser desfeita.`)) return;
    setBulkDeleting(true);
    await Promise.all([...selectedIds].map(id => fetch(`/api/finances/${id}`, { method: "DELETE" })));
    setBulkDeleting(false);
    setSelectedIds(new Set());
    setSelectMode(false);
    loadAll(mode);
  }

  async function handleMarkPaid(rec: Recurring) {
    setMarkingPaid(rec.id);
    await fetch(`/api/recurring/${rec.id}/confirm`, { method: "POST" });
    setMarkingPaid(null);
    loadAll(mode);
  }

  async function handleCancelRec(rec: Recurring) {
    if (!window.confirm(`Cancelar "${rec.description}"?`)) return;
    setCancellingRec(rec.id);
    await fetch(`/api/recurring/${rec.id}`, { method: "DELETE" });
    setCancellingRec(null);
    loadAll(mode);
  }

  async function handleConfirmPending(f: Finance) {
    setConfirmingPending(f.id);
    await fetch(`/api/finances/${f.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "posted" }),
    });
    setConfirmingPending(null);
    loadAll(mode);
  }

  async function handleEditRec(e: React.FormEvent) {
    e.preventDefault();
    if (!editRec) return;
    await fetch(`/api/recurring/${editRec.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: editRecForm.amount ? parseFloat(editRecForm.amount) : undefined,
        description: editRecForm.description || undefined,
        category: editRecForm.category || undefined,
        dayOfMonth: editRecForm.dayOfMonth ? parseInt(editRecForm.dayOfMonth) : undefined,
        repeatUnit: editRecForm.repeatUnit,
      }),
    });
    setEditRec(null);
    loadAll(mode);
  }

  const cats = form.type === "income" ? catsIncome : catsExpense;
  const editCats = editTarget?.type === "income" ? catsIncome : catsExpense;
  const editRecCats = editRec?.type === "income" ? catsIncome : catsExpense;
  const allCategories = useMemo(() => [...new Set([...catsExpense, ...catsIncome,...finances.map(f=>f.category)])], [catsExpense, catsIncome,finances]);

  // Categoria/tipo/busca filtram client-side sobre o que já foi buscado
  // (período já veio filtrado do servidor) — cards, gráfico e extrato usam
  // TODOS o mesmo array filtrado, o que corrige o bug de percentual (antes
  // catTotals somava tudo sem filtro de data enquanto o saldo usado como
  // denominador era só do mês atual).
  const filteredFinances = useMemo(() => finances.filter(f => {
    if(!matchesFinanceAccount(f,filters.account))return false;
    if (filters.type !== "all" && f.type !== filters.type) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(f.category)) return false;
    if (filters.search.trim() && !f.description.toLowerCase().includes(filters.search.trim().toLowerCase())) return false;
    return true;
  }), [finances, filters]);

  const filteredRecs = useMemo(() => recs.filter(r => {
    if(filters.account&&filters.account!=="unlinked")return false; // Recurring registrations have no account association.
    if (filters.from && r.nextDueDate < filters.from) return false;
    if (filters.to && r.nextDueDate > filters.to) return false;
    if (filters.type !== "all" && r.type !== filters.type) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(r.category)) return false;
    if (filters.search.trim() && !r.description.toLowerCase().includes(filters.search.trim().toLowerCase())) return false;
    return true;
  }), [recs, filters]);

  // Finanças pendentes (data futura, status pending) separadas das confirmadas
  const pendingFinances = filteredFinances.filter(f => f.status === "pending");
  const postedFinances = filteredFinances.filter(f => f.status !== "pending");
  // Só os lançamentos que aparecem na tela têm checkbox — "selecionar tudo"
  // não pode marcar o que nem está visível (postedFinances é limitado a 50).
  const selectableFinances = [...pendingFinances, ...postedFinances.slice(0, visibleCount)].filter(f=>f.source!=="bank");
  const allSelected = selectableFinances.length > 0 && selectableFinances.every(f => selectedIds.has(f.id));

  const periodBalance = ledgerBalance(postedFinances);

  const expenseGroups=ledgerCategoryGroups(postedFinances,"expense"),incomeGroups=ledgerCategoryGroups(postedFinances,"income");
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
  const today = new Date().toISOString().slice(0, 10);

  // Recs sorted: overdue first, then by nextDueDate
  const sortedRecs = [...filteredRecs].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const bankSchedules=financeBankSchedules(ledger?.bank?.overview.agenda?.items??[],filters);
  const projectedInstallments=useMemo(()=>{
    if(!ledger?.bank||filters.type==="income"||filters.categories.length||filters.account&&!filters.account.startsWith("bank:"))return [];
    const search=normalizeBankText(filters.search);
    return projectBankInstallments(ledger.installmentAnchors?.items??[],ledger.bank.report.movements,{from:filters.from,to:filters.to,today})
      .filter(item=>(!filters.account||item.resource_id===filters.account.slice(5))&&(!search||normalizeBankText(`${item.description} ${item.institution_name} ${item.resource_name}`).includes(search)));
  },[ledger,filters,today]);

  function recStatus(r: Recurring): { label: string; color: string } {
    if (r.nextDueDate < today) return { label: "Vencido", color: "bg-red-soft text-red-ink" };
    if (r.nextDueDate === today) return { label: "Vence hoje", color: "bg-orange-soft text-orange-ink" };
    return { label: `A vencer ${fmtDate(r.nextDueDate)}`, color: "bg-surface-muted text-muted" };
  }

  return (
    <div className="z-page">
      {banner && (
        <div className="rounded-xl border border-line bg-amber-soft text-amber-ink text-sm px-4 py-3">
          {banner}
        </div>
      )}
      <div className="z-page-heading flex items-center justify-between flex-wrap gap-3">
        <div>
          <PageTitle icon="finance">Finanças</PageTitle>
          <p className="text-subtle text-sm mt-0.5">{modeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openImport}
            className="px-4 py-2.5 bg-surface border border-line text-muted rounded-xl text-sm font-semibold hover:bg-surface-muted transition">
            📑 Importar fatura
          </button>
          <button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
            className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition shadow-sm">
            + Adicionar
          </button>
        </div>
      </div>

      <FinanceFilterBar key={filters.search} categories={allCategories} accounts={accountOptions} value={filters} onChange={next=>{setFilters(next);setSelectedIds(new Set());}} />
      {ledgerError&&<p role="alert" className="rounded-xl border border-line bg-amber-soft p-4 text-sm text-amber-ink">{ledgerError} O extrato pode estar desatualizado.</p>}
      {ledger?.bank&&<p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>Conta, cartão, WhatsApp e plataforma no mesmo extrato · Pessoal e Empresa separados.</span><span className="rounded-full bg-emerald-soft px-3 py-1 text-emerald-ink">Atualização automática</span></p>}
      {ledger?.bank?.report.sync_pending&&<p role="status" className="text-xs text-amber-ink">O banco ainda está enviando dados. O extrato acompanha os registros recebidos.</p>}
      {!!ledger?.bank?.report.missing_dates&&<p className="text-xs text-amber-ink">Há {ledger.bank.report.missing_dates} movimento(s) sem data enviados pelo banco, fora deste período.</p>}
      {postedFinances.some(f=>f.possibleDuplicate)&&<p className="rounded-xl border border-line bg-amber-soft p-3 text-xs text-amber-ink">Há registros com mesmo valor e data em mais de uma origem. Estão identificados no extrato para conferência; os totais ainda podem conter repetições.</p>}

      {/* Saldo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-emerald-ink font-medium uppercase tracking-wide">Receitas</p>
          <p className="text-2xl font-bold text-ink mt-2">{ledger?fmt(periodBalance.income):"—"}</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-red-ink font-medium uppercase tracking-wide">Despesas</p>
          <p className="text-2xl font-bold text-ink mt-2">{ledger?fmt(periodBalance.expense):"—"}</p>
        </div>
        <div className={clsx("rounded-2xl p-5 shadow-sm", totalBalance.balance >= 0 ? "bg-amber-soft border border-line" : "bg-red-soft border border-line")}>
          <p className="text-xs text-amber-ink font-medium uppercase tracking-wide">Saldo registrado na Zelo</p>
          <p className="text-2xl font-bold text-ink mt-2">{ledger?fmt(totalBalance.balance):"—"}</p>
          <p className="mt-1 text-[10px] text-muted">Acumulado de todas as contas registradas · saldo do banco em Contas</p>
        </div>
      </div>

      {ledger?.bank&&<FinanceBankSchedules items={bankSchedules} overview={ledger.bank.overview}/>}
      {ledger?.bank?.overview.agenda?.incomplete&&<p role="status" className="text-xs text-amber-ink">As recorrências bancárias podem estar incompletas: há dados em atualização ou indisponíveis.</p>}
      {ledger?.installmentAnchors?.incomplete&&<p role="status" className="text-xs text-amber-ink">Há mais parcelas bancárias do que este extrato consegue mostrar de uma vez. Ajuste o período ou confira no banco.</p>}
      {!!filters.categories.length&&!!ledger?.bank?.overview.agenda?.items.some(item=>item.kind!=="bill")&&<p className="text-xs text-subtle">As previsões bancárias não informam categoria e ficam fora deste filtro.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="space-y-5 lg:col-span-2">
          <FinanceCategorySummary type="income" groups={incomeGroups} onAdd={()=>{setCatType("income");setCatName("");setCatError("");setShowCatModal(true);}}/>
          <FinanceCategorySummary type="expense" groups={expenseGroups} onAdd={()=>{setCatType("expense");setCatName("");setCatError("");setShowCatModal(true);}}/>
        </div>

        {/* Extrato unificado */}
        <div className="lg:col-span-3 bg-surface rounded-2xl border border-line shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="font-semibold text-ink text-sm">📋 Extrato</h3>
            {selectableFinances.length > 0 && (
              <button onClick={toggleSelectMode}
                className={clsx("text-xs font-medium px-2.5 py-1 rounded-lg transition shrink-0",
                  selectMode ? "bg-slate-800 text-white" : "text-muted hover:bg-surface-muted")}>
                {selectMode ? "Cancelar seleção" : "Selecionar"}
              </button>
            )}
          </div>
          {selectMode && (
            <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl bg-surface-muted border border-line">
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                <input type="checkbox" checked={allSelected}
                  onChange={() => setSelectedIds(allSelected ? new Set() : new Set(selectableFinances.map(f => f.id)))}
                  className="w-4 h-4 accent-slate-800" />
                {selectedIds.size > 0 ? `${selectedIds.size} selecionado(s)` : "Selecionar tudo"}
              </label>
              <button onClick={handleBulkDelete} disabled={selectedIds.size === 0 || bulkDeleting}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-soft text-red-ink hover:bg-red-soft transition disabled:opacity-40 disabled:hover:bg-red-soft shrink-0">
                {bulkDeleting ? "Excluindo..." : "🗑️ Excluir selecionados"}
              </button>
            </div>
          )}
          {loading ? <p className="text-subtle text-sm">Carregando...</p> :
            (ledger && postedFinances.length === 0 && sortedRecs.length === 0 && pendingFinances.length === 0 && projectedInstallments.length === 0) ? (
              <div className="text-center py-16 text-subtle">
                <p className="text-4xl mb-3">💬</p>
                <p className="font-medium text-muted">Nenhum registro ainda</p>
                <p className="text-xs mt-1">Envie uma mensagem para o bot ou clique em + Adicionar!</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto">
                {!ledger&&<p className="px-3 py-3 text-xs text-amber-ink">{ledgerError?"Extrato indisponível. Ajuste o período ou aguarde uma nova tentativa.":"Carregando o extrato..."}</p>}

                {/* Pendentes: recorrentes/parcelados */}
                {sortedRecs.map(r => {
                  const st = recStatus(r);
                  const installLabel = r.recurrenceType === "installment"
                    ? ` (${r.paidInstallments + 1}/${r.totalInstallments})`
                    : ` · ${UNIT_LABEL[r.repeatUnit]}`;
                  return (
                    <div key={r.id} className="group flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-surface-muted transition border border-dashed border-line">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", r.type === "income" ? "bg-emerald-soft text-emerald-ink" : "bg-red-soft text-red-500")}>
                          {r.type === "income" ? "↑" : "↓"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-ink truncate">{visibleFinanceDescription(r.description)}{installLabel}</p>
                            <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0", st.color)}>{st.label}</span>
                          </div>
                          <p className="text-xs text-subtle">{r.category}{purchaseDateFromDescription(r.description) ? ` · compra em ${fmtDate(purchaseDateFromDescription(r.description)!)}` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={clsx("text-sm font-bold", r.type === "income" ? "text-emerald-ink" : "text-red-500")}>
                          {r.type === "income" ? "+" : "-"}{fmt(r.amount)}
                        </span>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditRec(r); setEditRecForm({ amount: String(r.amount), description: r.description, category: r.category, dayOfMonth: r.dayOfMonth ? String(r.dayOfMonth) : "", repeatUnit: r.repeatUnit }); }}
                            className="p-1.5 rounded-lg text-subtle hover:text-blue-ink hover:bg-blue-soft transition" title="Editar">✏️</button>
                          <button onClick={() => handleCancelRec(r)} disabled={cancellingRec === r.id}
                            className="p-1.5 rounded-lg text-subtle hover:text-red-ink hover:bg-red-soft transition" title="Cancelar">🗑️</button>
                        </div>
                        <button onClick={() => handleMarkPaid(r)} disabled={markingPaid === r.id}
                          className={clsx("px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 disabled:opacity-50",
                            r.type === "income" ? "bg-primary text-on-primary hover:bg-primary-hover" : "bg-primary text-on-primary hover:bg-primary-hover")}>
                          {markingPaid === r.id ? "..." : r.type === "income" ? "✓ Recebido" : "✓ Pago"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Pendentes: lançamentos únicos com data futura */}
                {pendingFinances.map(f => {
                  const dueDate = new Date(f.date + "T12:00:00");
                  const dueFmt = dueDate.toLocaleDateString("pt-BR");
                  const isOverdue = f.date < today;
                  const badgeColor = isOverdue ? "bg-red-soft text-red-ink" : "bg-surface-muted text-muted";
                  const badgeLabel = isOverdue ? `Vencido ${dueFmt}` : `A vencer ${dueFmt}`;
                  return (
                    <div key={f.id} className="group flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-surface-muted transition border border-dashed border-line">
                      <div className="flex items-center gap-3 min-w-0">
                        {selectMode && (
                          <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelected(f.id)}
                            className="w-4 h-4 accent-slate-800 shrink-0" />
                        )}
                        <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", f.type === "income" ? "bg-emerald-soft text-emerald-ink" : "bg-red-soft text-red-500")}>
                          {f.type === "income" ? "↑" : "↓"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-ink truncate">{f.description}</p>
                            <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0", badgeColor)}>{badgeLabel}</span>
                          </div>
                          <p className="text-xs text-subtle">{f.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={clsx("text-sm font-bold", f.type === "income" ? "text-emerald-ink" : "text-red-500")}>
                          {f.type === "income" ? "+" : "-"}{fmt(f.amount)}
                        </span>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(f)}
                            className="p-1.5 rounded-lg text-subtle hover:text-blue-ink hover:bg-blue-soft transition" title="Editar">✏️</button>
                          <button onClick={() => setDeleteTarget(f)}
                            className="p-1.5 rounded-lg text-subtle hover:text-red-ink hover:bg-red-soft transition" title="Excluir">🗑️</button>
                        </div>
                        <button onClick={() => handleConfirmPending(f)} disabled={confirmingPending === f.id}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 disabled:opacity-50 bg-primary text-on-primary hover:bg-primary-hover">
                          {confirmingPending === f.id ? "..." : f.type === "income" ? "✓ Recebido" : "✓ Pago"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                <FinanceInstallmentProjections items={projectedInstallments}/>

                {/* Separador se tiver pendentes e lançamentos confirmados */}
                {(sortedRecs.length > 0 || pendingFinances.length > 0 || projectedInstallments.length > 0) && postedFinances.length > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-surface-muted" />
                    <span className="text-xs text-subtle">confirmados</span>
                    <div className="flex-1 h-px bg-surface-muted" />
                  </div>
                )}

                {/* Lançamentos confirmados de todas as origens, em ordem de data */}
                <FinanceLedgerRows entries={postedFinances.slice(0,visibleCount)} selectMode={selectMode} selectedIds={selectedIds} onToggle={toggleSelected} onEdit={openEdit} onDelete={setDeleteTarget} onCategory={setBankCategoryTarget} onCreditPix={entry=>setBankCreditPixId(entry.id)} displayDescription={visibleFinanceDescription} displayDate={visibleFinanceDate}/>
                {postedFinances.length>visibleCount&&<button onClick={()=>setVisibleCount(n=>n+50)} className="w-full rounded-xl border border-line py-3 text-xs font-semibold text-muted">Ver mais lançamentos ({postedFinances.length-visibleCount})</button>}
                {ledger?.bank&&<p className="px-3 pt-3 text-[11px] leading-5 text-subtle">Resumo em reais. Pagamentos de fatura, transferências identificadas e investimentos aparecem no extrato sem alterar receitas/gastos. O histórico enviado pelo banco pode estar incompleto.</p>}
              </div>
            )}
        </div>
      </div>

      {ledger?.bank&&(!filters.account||filters.account.startsWith("bank:"))&&(mode==="personal"||mode==="business")&&<OpenFinanceFinancial key={mode} mode={mode} data={ledger.bank} resourceId={filters.account?.slice(5)}/>}

      {bankCategoryTarget&&<BankCategoryDialog key={`${mode}:${bankCategoryTarget.id}`} entry={bankCategoryTarget} mode={mode} categories={[...new Set(bankCategoryTarget.type==="income"?catsIncome:catsExpense)]} onClose={()=>setBankCategoryTarget(null)} onSaved={matched=>{setBankCategoryTarget(null);setBanner(matched===undefined?"✅ Categoria salva. Os gráficos usam sua escolha.":`✅ Transferência confirmada. ${matched} movimentação(ões) com a mesma conta, descrição e valor foram atualizadas no histórico.`);loadAll(mode);}}/>}
      {bankCreditPixTarget&&<BankCreditPixDialog key={`${mode}:${bankCreditPixTarget.id}`} credit={bankCreditPixTarget} movements={ledger?.bank?.report.movements??[]} mode={mode} onClose={()=>setBankCreditPixId(null)} onSaved={()=>{setBankCreditPixId(null);setBanner("✅ Confirmação salva. O histórico e a dívida no cartão foram preservados.");loadAll(mode);}}/>}

      {/* ── Modal Adicionar (único + recorrente + parcelado) ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-ink mb-4">+ Nova transação</h3>
            <form onSubmit={handleSave} className="space-y-3">

              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {([["expense", "💸 Despesa"], ["income", "💰 Receita"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, type: v, category: "" }))}
                    className={clsx("py-2.5 rounded-xl text-sm font-semibold border transition",
                      form.type === v ? "bg-primary text-on-primary border-amber-600" : "border-line text-muted hover:bg-surface-muted")}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Frequência */}
              <div className="grid grid-cols-3 gap-2">
                {([["once", "Único"], ["recurring", "🔁 Recorrente"], ["installment", "💳 Parcelado"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, frequency: v }))}
                    className={clsx("py-2 rounded-xl text-xs font-medium border transition",
                      form.frequency === v ? "bg-slate-800 text-white border-slate-800" : "border-line text-muted hover:bg-surface-muted")}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Campos comuns */}
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
                placeholder={form.frequency === "installment" ? "Valor por parcela (R$)" : "Valor (R$)"}
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200" />

              <div className="flex gap-2 items-center">
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  required={form.frequency === "once"}
                  className="flex-1 border border-line rounded-xl px-4 py-2.5 text-sm outline-none bg-surface">
                  <option value="">{form.frequency === "once" ? "Categoria *" : "Categoria (opcional)"}</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => { setCatType(form.type); setCatName(""); setCatError(""); setShowCatModal(true); }}
                  className="shrink-0 px-3 py-2.5 border border-dashed border-line rounded-xl text-xs text-muted hover:border-amber-400 hover:text-amber-ink transition">
                  + Nova
                </button>
              </div>

              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required={form.frequency !== "once"}
                placeholder={form.frequency === "once" ? "Descrição (opcional)" : "Descrição (ex: Netflix, Geladeira)"}
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />

              {/* Campos extras para recorrente/parcelado */}
              {form.frequency !== "once" && (
                <>
                  {form.frequency === "installment" && (
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" value={form.totalInstallments} onChange={e => setForm(f => ({ ...f, totalInstallments: e.target.value }))} required
                        placeholder="Nº de parcelas" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                      <input type="number" step="0.01" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                        placeholder="Valor total (opcional)" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                    </div>
                  )}
                  {form.frequency === "recurring" && (
                    <select value={form.repeatUnit} onChange={e => setForm(f => ({ ...f, repeatUnit: e.target.value as FormState["repeatUnit"] }))}
                      className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none bg-surface">
                      <option value="monthly">Todo mês</option>
                      <option value="weekly">Toda semana</option>
                      <option value="daily">Todo dia</option>
                      <option value="yearly">Todo ano</option>
                    </select>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" min="1" max="31" value={form.dayOfMonth} onChange={e => setForm(f => ({ ...f, dayOfMonth: e.target.value }))}
                      placeholder="Dia do mês (ex: 10)" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                    <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                      className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Editar lançamento confirmado */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-ink mb-1">✏️ Editar lançamento</h3>
            <p className="text-xs text-subtle mb-4">{editTarget.type === "income" ? "💰 Receita" : "💸 Despesa"}</p>
            <form onSubmit={handleEdit} className="space-y-3">
              <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} required
                placeholder="Valor (R$)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} required
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none bg-surface">
                <option value="">Categoria</option>
                {editCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit"
                  className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary transition">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Editar recorrente/parcelado */}
      {editRec && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-ink mb-1">✏️ Editar {editRec.recurrenceType === "installment" ? "parcelamento" : "recorrente"}</h3>
            <p className="text-xs text-subtle mb-4">{editRec.description}</p>
            <form onSubmit={handleEditRec} className="space-y-3">
              <input type="number" step="0.01" value={editRecForm.amount} onChange={e => setEditRecForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Novo valor (R$)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={editRecForm.description} onChange={e => setEditRecForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select value={editRecForm.category} onChange={e => setEditRecForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none bg-surface">
                <option value="">Categoria</option>
                {editRecCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" min="1" max="31" value={editRecForm.dayOfMonth} onChange={e => setEditRecForm(f => ({ ...f, dayOfMonth: e.target.value }))}
                placeholder="Dia do mês" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditRec(null)}
                  className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit"
                  className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary transition">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Nova Categoria */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-ink mb-1">+ Nova categoria</h3>
            <div className="flex gap-2 mb-4 mt-2">
              {(["expense", "income"] as const).map(t => (
                <button key={t} type="button" onClick={() => setCatType(t)}
                  className={clsx("flex-1 py-2 rounded-xl text-xs font-semibold border transition",
                    catType === t ? "bg-primary text-on-primary border-amber-600" : "border-line text-muted hover:bg-surface-muted")}>
                  {t === "expense" ? "💸 Despesa" : "💰 Receita"}
                </button>
              ))}
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-3">
              <input value={catName} onChange={e => { setCatName(e.target.value); setCatError(""); }} required autoFocus
                placeholder="Nome da categoria (ex: Pet, Assinaturas)"
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200" />
              {catError && <p className="text-xs text-red-500">{catError}</p>}

              {/* Categorias personalizadas existentes */}
              {(catType === "expense" ? customExpense : customIncome).length > 0 && (
                <div>
                  <p className="text-xs text-subtle mb-1.5">Suas categorias:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(catType === "expense" ? customExpense : customIncome).map(c => (
                      <span key={c} className="flex items-center gap-1 text-xs bg-surface-muted text-muted rounded-lg px-2 py-1">
                        {c}
                        <button type="button" onClick={() => handleDeleteCategory(catType, c)}
                          className="text-subtle hover:text-red-500 transition leading-none">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCatModal(false)}
                  className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" disabled={catSaving}
                  className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition disabled:opacity-50">
                  {catSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Confirmar exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-3xl mb-3">🗑️</p>
            <h3 className="font-bold text-ink mb-1">Excluir lançamento?</h3>
            <p className="text-sm text-muted mb-1">{deleteTarget.description}</p>
            <p className={clsx("text-lg font-bold mb-5", deleteTarget.type === "income" ? "text-emerald-ink" : "text-red-500")}>
              {deleteTarget.type === "income" ? "+" : "-"}{fmt(deleteTarget.amount)}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
              <button onClick={handleDelete}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 transition">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Importar fatura */}
      {showImport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-ink mb-1">📑 Importar fatura</h3>
            <p className="text-xs text-subtle mb-4">Envie a fatura do cartão em PDF, imagem ou CSV — cada compra é identificada separadamente e o que já foi registrado não é duplicado.</p>

            {importItems.length === 0 ? (
              <div className="space-y-3">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm border border-line rounded-xl px-3 py-2.5 outline-none file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-soft file:text-amber-ink file:text-xs file:font-semibold" />
                {importError && <p className="text-xs text-red-500">{importError}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowImport(false)}
                    className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                  <button type="button" onClick={handleAnalyzeInvoice} disabled={!importFile || importLoading}
                    className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition disabled:opacity-50">
                    {importLoading ? "Analisando..." : "Analisar fatura"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{importMeta.sourceTransactionCount && importMeta.sourceTransactionCount > importItems.length ? `${importMeta.sourceTransactionCount} movimentações lidas · ${importItems.length} compras` : `${importItems.length} compra(s) encontrada(s)`}</span>
                  <span>{importItems.filter(i => i.selected).length} selecionado(s) — {fmt(importItems.filter(i => i.selected).reduce((s, i) => s + i.amount, 0))}</span>
                </div>
                {!!importMeta.ignoredTransactionCount && <p className="text-xs text-muted bg-surface-muted rounded-lg p-2">ℹ️ {importMeta.ignoredTransactionCount} pagamento/crédito/estorno foi lido e ignorado corretamente; não vira despesa.</p>}
                {importMeta.bankName && <p className="text-xs text-amber-ink">🏦 Banco/cartão identificado: <strong>{importMeta.bankName}</strong></p>}
                {importItems[0]?.date && <p className="text-xs text-blue-ink bg-blue-soft rounded-lg p-2">📅 As compras serão contabilizadas na competência <strong>{fmtMonth(importItems[0].date)}</strong>.{importMeta.dueDate ? <> A fatura vence em <strong>{fmtDate(importMeta.dueDate)}</strong>; sua baixa não cria outra despesa.</> : ""}</p>}
                {importMeta.probableRepeat
                  ? <p className="text-xs text-amber-ink bg-amber-soft rounded-lg p-2">📄 Esta parece ser uma fatura atualizada: {importMeta.alreadyRegisteredCount ?? 0} de {importItems.length} compras já estão registradas. Somente as novas foram selecionadas.</p>
                  : importItems.some(item => item.duplicate) && <p className="text-xs text-amber-ink bg-amber-soft rounded-lg p-2">⚠️ Você realmente gastou estes valores duas vezes no mesmo dia? Os possíveis duplicados começam desmarcados; marque apenas os que aconteceram duas vezes.</p>}
                <div className="border border-line rounded-xl divide-y divide-line max-h-80 overflow-y-auto">
                  {importItems.map((item, idx) => (
                    <label key={idx} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-surface-muted">
                      <input type="checkbox" checked={item.selected}
                        onChange={e => setImportItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: e.target.checked } : it))}
                        className="accent-amber-600" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ink truncate">{item.description}</p>
                        <p className="text-xs text-subtle">
                          {item.purchaseDate && item.purchaseDate !== item.date ? `Data impressa ${fmtDate(item.purchaseDate)} · competência ${fmtDate(item.date)}` : fmtDate(item.date)} · {item.category}
                          {item.installmentCurrent && item.installmentTotal && <span className="ml-1.5 text-blue-ink">· parcela {item.installmentCurrent}/{item.installmentTotal} · restantes {item.installmentsRemaining ?? item.installmentTotal - item.installmentCurrent}</span>}
                          {item.duplicate && <span className="ml-1.5 text-amber-ink">· possível repetição — marque se gastou 2 vezes</span>}
                        </p>
                      </div>
                      <span className="font-semibold text-ink shrink-0">{fmt(item.amount)}</span>
                    </label>
                  ))}
                </div>
                {importError && <p className="text-xs text-red-500">{importError}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowImport(false)}
                    className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                  <button type="button" onClick={handleConfirmImport} disabled={importSaving || importItems.filter(i => i.selected).length === 0}
                    className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition disabled:opacity-50">
                    {importSaving ? "Importando..." : `Importar ${importItems.filter(i => i.selected).length} lançamento(s)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FinancasPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-subtle">Carregando…</p>}><FinancasContent /></Suspense>;
}
