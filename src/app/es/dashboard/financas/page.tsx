"use client";
import { useEffect, useState, useMemo } from "react";
import { clsx } from "clsx";
import FinanceFilterBar, { type FinanceFilters, defaultFilters } from "@/components/es/FinanceFilterBar";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type Finance = { id: string; type: string; amount: number; category: string; description: string; date: string; mode: string; status?: string };

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
function fmtDate(d: string) { return new Date(d + "T12:00:00").toLocaleDateString("es-419"); }

const UNIT_LABEL: Record<string, string> = { monthly: "Mensual", weekly: "Semanal", daily: "Diario", yearly: "Anual" };

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

export default function FinancasPageEs() {
  const [mode, setMode] = useState("");
  const [finances, setFinances] = useState<Finance[]>([]);
  const [recs, setRecs] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FinanceFilters>(defaultFilters());

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
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [cancellingRec, setCancellingRec] = useState<string | null>(null);
  const [confirmingPending, setConfirmingPending] = useState<string | null>(null);

  const [banner, setBanner] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState("");
  type ImportItem = { date: string; description: string; amount: number; category: string; duplicate: boolean; selected: boolean };
  const [importItems, setImportItems] = useState<ImportItem[]>([]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  function openImport() {
    setImportFile(null); setImportError(""); setImportItems([]); setShowImport(true);
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
      if (!res.ok) { setImportError(data.error || "Error al analizar la factura"); return; }
      setImportItems((data.transactions || []).map((t: Omit<ImportItem, "selected">) => ({ ...t, selected: !t.duplicate })));
    } catch {
      setImportError("Error de conexión");
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
        body: JSON.stringify({ mode, items: selected.map(({ date, description, amount, category }) => ({ date, description, amount, category })) }),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || "Error al importar"); return; }
      setShowImport(false);
      setBanner(`✅ ¡${data.imported} movimiento(s) importado(s) de la factura!`);
      loadAll(mode);
    } catch {
      setImportError("Error de conexión");
    } finally {
      setImportSaving(false);
    }
  }

  function loadCategories() {
    fetch("/api/categories").then(r => r.json()).then(d => {
      setCatsExpense(d.expense || []);
      setCatsIncome(d.income || []);
      const defaults = { expense: ["Alimentación","Transporte","Vivienda","Salud","Educación","Ocio","Ropa","Tecnología","Servicios","Impuestos","Empleados","Marketing","Proveedores","Otros"], income: ["Salario","Freelance","Ventas","Inversiones","Alquiler","Servicios","Reembolso","Otros"] };
      setCustomExpense((d.expense || []).filter((c: string) => !defaults.expense.includes(c)));
      setCustomIncome((d.income || []).filter((c: string) => !defaults.income.includes(c)));
    }).catch(() => {});
  }

  function loadAll(m: string) {
    setLoading(true);
    Promise.all([
      fetch(`/api/finances?mode=${m}&from=${filters.from}&to=${filters.to}`).then(r => r.json()),
      fetch(`/api/recurring?mode=${m}&status=active`).then(r => r.json()),
    ]).then(([fd, rd]) => {
      setFinances(fd.finances || []);
      setRecs(Array.isArray(rd) ? rd : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  // Recarrega quando o período do filtro muda (categoria/tipo/busca filtram
  // client-side sobre o que já foi buscado, sem precisar de novo fetch).
  useEffect(() => {
    if (!mode) return;
    loadAll(mode);
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
    if (!res.ok) { setCatError(data.error || "Error al guardar"); setCatSaving(false); return; }
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
          category: form.category || "Otros",
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

  async function handleMarkPaid(rec: Recurring) {
    setMarkingPaid(rec.id);
    await fetch(`/api/recurring/${rec.id}/confirm`, { method: "POST" });
    setMarkingPaid(null);
    loadAll(mode);
  }

  async function handleCancelRec(rec: Recurring) {
    if (!window.confirm(`¿Cancelar "${rec.description}"?`)) return;
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
  const allCategories = useMemo(() => [...new Set([...catsExpense, ...catsIncome])], [catsExpense, catsIncome]);

  // Categoria/tipo/busca filtram client-side sobre o que já foi buscado
  // (período já veio filtrado do servidor) — cards, gráfico e extrato usam
  // TODOS o mesmo array filtrado, o que corrige o bug de percentual (antes
  // catTotals somava tudo sem filtro de data enquanto o saldo usado como
  // denominador era só do mês atual).
  const filteredFinances = useMemo(() => finances.filter(f => {
    if (filters.type !== "all" && f.type !== filters.type) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(f.category)) return false;
    if (filters.search.trim() && !f.description.toLowerCase().includes(filters.search.trim().toLowerCase())) return false;
    return true;
  }), [finances, filters]);

  const filteredRecs = useMemo(() => recs.filter(r => {
    if (filters.type !== "all" && r.type !== filters.type) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(r.category)) return false;
    if (filters.search.trim() && !r.description.toLowerCase().includes(filters.search.trim().toLowerCase())) return false;
    return true;
  }), [recs, filters]);

  // Finanças pendentes (data futura, status pending) separadas das confirmadas
  const pendingFinances = filteredFinances.filter(f => f.status === "pending");
  const postedFinances = filteredFinances.filter(f => f.status !== "pending");

  const incomeTotal = postedFinances.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
  const expenseTotal = postedFinances.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
  const balance = { income: incomeTotal, expense: expenseTotal, balance: incomeTotal - expenseTotal };

  const catTotals: Record<string, number> = {};
  postedFinances.filter(f => f.type === "expense").forEach(f => { catTotals[f.category] = (catTotals[f.category] || 0) + f.amount; });
  const topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Personal";
  const today = new Date().toISOString().slice(0, 10);

  // Recs sorted: overdue first, then by nextDueDate
  const sortedRecs = [...filteredRecs].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  function recStatus(r: Recurring): { label: string; color: string } {
    if (r.nextDueDate < today) return { label: "Vencido", color: "bg-red-100 text-red-600" };
    if (r.nextDueDate === today) return { label: "Vence hoy", color: "bg-orange-100 text-orange-600" };
    return { label: `Vence el ${fmtDate(r.nextDueDate)}`, color: "bg-slate-100 text-slate-500" };
  }

  return (
    <div className="space-y-5">
      {banner && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm px-4 py-3">
          {banner}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💰 Finanzas</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openImport}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition">
            📑 Importar factura
          </button>
          <button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
            className="px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition shadow-sm">
            + Agregar
          </button>
        </div>
      </div>

      <FinanceFilterBar categories={allCategories} value={filters} onChange={setFilters} />

      {/* Saldo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-600 rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-emerald-100 font-medium uppercase tracking-wide">Ingresos</p>
          <p className="text-2xl font-bold text-white mt-2">{fmt(balance.income)}</p>
        </div>
        <div className="bg-red-500 rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-red-100 font-medium uppercase tracking-wide">Gastos</p>
          <p className="text-2xl font-bold text-white mt-2">{fmt(balance.expense)}</p>
        </div>
        <div className={clsx("rounded-2xl p-5 shadow-sm", balance.balance >= 0 ? "bg-blue-600" : "bg-orange-500")}>
          <p className="text-xs text-blue-100 font-medium uppercase tracking-wide">Saldo del Mes</p>
          <p className="text-2xl font-bold text-white mt-2">{fmt(balance.balance)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Categorias */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">📊 Gastos por Categoría</h3>
            <button onClick={() => { setCatType("expense"); setCatName(""); setCatError(""); setShowCatModal(true); }}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 transition">
              <span className="text-base leading-none">+</span> Categoría
            </button>
          </div>
          {topCats.length === 0 ? (
            <div className="text-center py-10 text-slate-300">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm">Sin gastos registrados</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topCats.map(([cat, val]) => {
                const pctRaw = balance.expense > 0 ? (val / balance.expense * 100) : 0;
                const pct = Math.min(100, pctRaw).toFixed(0);
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-600 font-medium">{cat}</span>
                      <span className="font-semibold text-slate-800">{fmt(val)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-2 bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 text-right">{pct}% del total</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Extrato unificado */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-4 text-sm">📋 Movimientos</h3>
          {loading ? <p className="text-slate-400 text-sm">Cargando...</p> :
            (postedFinances.length === 0 && recs.length === 0 && pendingFinances.length === 0) ? (
              <div className="text-center py-16 text-slate-400">
                <p className="text-4xl mb-3">💬</p>
                <p className="font-medium text-slate-500">Ningún registro todavía</p>
                <p className="text-xs mt-1">¡Envía un mensaje al bot o haz clic en + Agregar!</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto">

                {/* Pendentes: recorrentes/parcelados */}
                {sortedRecs.map(r => {
                  const st = recStatus(r);
                  const installLabel = r.recurrenceType === "installment"
                    ? ` (${r.paidInstallments + 1}/${r.totalInstallments})`
                    : ` · ${UNIT_LABEL[r.repeatUnit]}`;
                  return (
                    <div key={r.id} className="group flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 transition border border-dashed border-slate-200">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", r.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500")}>
                          {r.type === "income" ? "↑" : "↓"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-slate-800 truncate">{r.description}{installLabel}</p>
                            <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0", st.color)}>{st.label}</span>
                          </div>
                          <p className="text-xs text-slate-400">{r.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={clsx("text-sm font-bold", r.type === "income" ? "text-emerald-600" : "text-red-500")}>
                          {r.type === "income" ? "+" : "-"}{fmt(r.amount)}
                        </span>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditRec(r); setEditRecForm({ amount: String(r.amount), description: r.description, category: r.category, dayOfMonth: r.dayOfMonth ? String(r.dayOfMonth) : "", repeatUnit: r.repeatUnit }); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Editar">✏️</button>
                          <button onClick={() => handleCancelRec(r)} disabled={cancellingRec === r.id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition" title="Cancelar">🗑️</button>
                        </div>
                        <button onClick={() => handleMarkPaid(r)} disabled={markingPaid === r.id}
                          className={clsx("px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 disabled:opacity-50",
                            r.type === "income" ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-amber-600 text-white hover:bg-amber-700")}>
                          {markingPaid === r.id ? "..." : r.type === "income" ? "✓ Recibido" : "✓ Pagado"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Pendentes: lançamentos únicos com data futura */}
                {pendingFinances.map(f => {
                  const dueDate = new Date(f.date + "T12:00:00");
                  const dueFmt = dueDate.toLocaleDateString("es-419");
                  const isOverdue = f.date < today;
                  const badgeColor = isOverdue ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500";
                  const badgeLabel = isOverdue ? `Vencido ${dueFmt}` : `Vence el ${dueFmt}`;
                  return (
                    <div key={f.id} className="group flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 transition border border-dashed border-slate-200">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", f.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500")}>
                          {f.type === "income" ? "↑" : "↓"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-slate-800 truncate">{f.description}</p>
                            <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0", badgeColor)}>{badgeLabel}</span>
                          </div>
                          <p className="text-xs text-slate-400">{f.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={clsx("text-sm font-bold", f.type === "income" ? "text-emerald-600" : "text-red-500")}>
                          {f.type === "income" ? "+" : "-"}{fmt(f.amount)}
                        </span>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(f)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Editar">✏️</button>
                          <button onClick={() => setDeleteTarget(f)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition" title="Eliminar">🗑️</button>
                        </div>
                        <button onClick={() => handleConfirmPending(f)} disabled={confirmingPending === f.id}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 disabled:opacity-50 bg-amber-600 text-white hover:bg-amber-700">
                          {confirmingPending === f.id ? "..." : f.type === "income" ? "✓ Recibido" : "✓ Pagado"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Separador se tiver pendentes e lançamentos confirmados */}
                {(sortedRecs.length > 0 || pendingFinances.length > 0) && postedFinances.length > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-xs text-slate-300">confirmados</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                )}

                {/* Lançamentos confirmados */}
                {postedFinances.slice(0, 50).map(f => (
                  <div key={f.id} className="group flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", f.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500")}>
                        {f.type === "income" ? "↑" : "↓"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{f.description}</p>
                        <p className="text-xs text-slate-400">{f.category} · {new Date(f.date + "T12:00:00").toLocaleDateString("es-419")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={clsx("text-sm font-bold", f.type === "income" ? "text-emerald-600" : "text-red-500")}>
                        {f.type === "income" ? "+" : "-"}{fmt(f.amount)}
                      </span>
                      <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Editar">✏️</button>
                        <button onClick={() => setDeleteTarget(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition" title="Eliminar">🗑️</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* ── Modal Adicionar (único + recorrente + parcelado) ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-4">+ Nueva transacción</h3>
            <form onSubmit={handleSave} className="space-y-3">

              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {([["expense", "💸 Gasto"], ["income", "💰 Ingreso"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, type: v, category: "" }))}
                    className={clsx("py-2.5 rounded-xl text-sm font-semibold border transition",
                      form.type === v ? "bg-amber-600 text-white border-amber-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Frequência */}
              <div className="grid grid-cols-3 gap-2">
                {([["once", "Único"], ["recurring", "🔁 Recurrente"], ["installment", "💳 En cuotas"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, frequency: v }))}
                    className={clsx("py-2 rounded-xl text-xs font-medium border transition",
                      form.frequency === v ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Campos comuns */}
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
                placeholder={form.frequency === "installment" ? "Monto por cuota (R$)" : "Monto (R$)"}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200" />

              <div className="flex gap-2 items-center">
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  required={form.frequency === "once"}
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                  <option value="">{form.frequency === "once" ? "Categoría *" : "Categoría (opcional)"}</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => { setCatType(form.type); setCatName(""); setCatError(""); setShowCatModal(true); }}
                  className="shrink-0 px-3 py-2.5 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 hover:border-amber-400 hover:text-amber-600 transition">
                  + Nueva
                </button>
              </div>

              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required={form.frequency !== "once"}
                placeholder={form.frequency === "once" ? "Descripción (opcional)" : "Descripción (ej: Netflix, Refrigerador)"}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />

              {/* Campos extras para recorrente/parcelado */}
              {form.frequency !== "once" && (
                <>
                  {form.frequency === "installment" && (
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" value={form.totalInstallments} onChange={e => setForm(f => ({ ...f, totalInstallments: e.target.value }))} required
                        placeholder="N.º de cuotas" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                      <input type="number" step="0.01" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                        placeholder="Monto total (opcional)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                    </div>
                  )}
                  {form.frequency === "recurring" && (
                    <select value={form.repeatUnit} onChange={e => setForm(f => ({ ...f, repeatUnit: e.target.value as FormState["repeatUnit"] }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                      <option value="monthly">Todos los meses</option>
                      <option value="weekly">Toda la semana</option>
                      <option value="daily">Todos los días</option>
                      <option value="yearly">Todos los años</option>
                    </select>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" min="1" max="31" value={form.dayOfMonth} onChange={e => setForm(f => ({ ...f, dayOfMonth: e.target.value }))}
                      placeholder="Día del mes (ej: 10)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                    <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                      className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Editar lançamento confirmado */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-1">✏️ Editar movimiento</h3>
            <p className="text-xs text-slate-400 mb-4">{editTarget.type === "income" ? "💰 Ingreso" : "💸 Gasto"}</p>
            <form onSubmit={handleEdit} className="space-y-3">
              <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} required
                placeholder="Monto (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} required
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                <option value="">Categoría</option>
                {editCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit"
                  className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Editar recorrente/parcelado */}
      {editRec && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-1">✏️ Editar {editRec.recurrenceType === "installment" ? "en cuotas" : "recurrente"}</h3>
            <p className="text-xs text-slate-400 mb-4">{editRec.description}</p>
            <form onSubmit={handleEditRec} className="space-y-3">
              <input type="number" step="0.01" value={editRecForm.amount} onChange={e => setEditRecForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Nuevo monto (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={editRecForm.description} onChange={e => setEditRecForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select value={editRecForm.category} onChange={e => setEditRecForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                <option value="">Categoría</option>
                {editRecCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" min="1" max="31" value={editRecForm.dayOfMonth} onChange={e => setEditRecForm(f => ({ ...f, dayOfMonth: e.target.value }))}
                placeholder="Día del mes" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditRec(null)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit"
                  className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Nova Categoria */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 mb-1">+ Nueva categoría</h3>
            <div className="flex gap-2 mb-4 mt-2">
              {(["expense", "income"] as const).map(t => (
                <button key={t} type="button" onClick={() => setCatType(t)}
                  className={clsx("flex-1 py-2 rounded-xl text-xs font-semibold border transition",
                    catType === t ? "bg-amber-600 text-white border-amber-600" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  {t === "expense" ? "💸 Gasto" : "💰 Ingreso"}
                </button>
              ))}
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-3">
              <input value={catName} onChange={e => { setCatName(e.target.value); setCatError(""); }} required autoFocus
                placeholder="Nombre de la categoría (ej: Mascota, Suscripciones)"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200" />
              {catError && <p className="text-xs text-red-500">{catError}</p>}

              {/* Categorias personalizadas existentes */}
              {(catType === "expense" ? customExpense : customIncome).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Tus categorías:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(catType === "expense" ? customExpense : customIncome).map(c => (
                      <span key={c} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 rounded-lg px-2 py-1">
                        {c}
                        <button type="button" onClick={() => handleDeleteCategory(catType, c)}
                          className="text-slate-400 hover:text-red-500 transition leading-none">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCatModal(false)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={catSaving}
                  className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50">
                  {catSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Confirmar exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-3xl mb-3">🗑️</p>
            <h3 className="font-bold text-slate-900 mb-1">¿Eliminar movimiento?</h3>
            <p className="text-sm text-slate-500 mb-1">{deleteTarget.description}</p>
            <p className={clsx("text-lg font-bold mb-5", deleteTarget.type === "income" ? "text-emerald-600" : "text-red-500")}>
              {deleteTarget.type === "income" ? "+" : "-"}{fmt(deleteTarget.amount)}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={handleDelete}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 transition">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Importar fatura */}
      {showImport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-1">📑 Importar factura</h3>
            <p className="text-xs text-slate-400 mb-4">Envía la factura de la tarjeta (PDF) o un estado de cuenta — la IA identifica cada movimiento y marca los que ya parecen estar registrados, para que no dupliques.</p>

            {importItems.length === 0 ? (
              <div className="space-y-3">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-50 file:text-amber-700 file:text-xs file:font-semibold" />
                {importError && <p className="text-xs text-red-500">{importError}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowImport(false)}
                    className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                  <button type="button" onClick={handleAnalyzeInvoice} disabled={!importFile || importLoading}
                    className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50">
                    {importLoading ? "Analizando..." : "Analizar factura"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{importItems.length} movimiento(s) encontrado(s)</span>
                  <span>{importItems.filter(i => i.selected).length} seleccionado(s) — {fmt(importItems.filter(i => i.selected).reduce((s, i) => s + i.amount, 0))}</span>
                </div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {importItems.map((item, idx) => (
                    <label key={idx} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={item.selected}
                        onChange={e => setImportItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: e.target.checked } : it))}
                        className="accent-amber-600" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{item.description}</p>
                        <p className="text-xs text-slate-400">
                          {fmtDate(item.date)} · {item.category}
                          {item.duplicate && <span className="ml-1.5 text-amber-600">· parece que ya está registrado</span>}
                        </p>
                      </div>
                      <span className="font-semibold text-slate-700 shrink-0">{fmt(item.amount)}</span>
                    </label>
                  ))}
                </div>
                {importError && <p className="text-xs text-red-500">{importError}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowImport(false)}
                    className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                  <button type="button" onClick={handleConfirmImport} disabled={importSaving || importItems.filter(i => i.selected).length === 0}
                    className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50">
                    {importSaving ? "Importando..." : `Importar ${importItems.filter(i => i.selected).length} movimiento(s)`}
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
