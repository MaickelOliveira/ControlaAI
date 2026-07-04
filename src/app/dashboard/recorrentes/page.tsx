"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type RecurringTransaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  totalAmount?: number;
  category: string;
  description: string;
  mode: "personal" | "business";
  recurrenceType: "installment" | "recurring";
  totalInstallments?: number;
  paidInstallments: number;
  repeatUnit: "daily" | "weekly" | "monthly" | "yearly";
  dayOfMonth?: number;
  startDate: string;
  nextDueDate: string;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d: string) { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR"); }

const UNIT_LABEL: Record<string, string> = { monthly: "Mensal", weekly: "Semanal", daily: "Diário", yearly: "Anual" };
const CATEGORIES_EXPENSE = ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos", "Funcionários", "Marketing", "Fornecedores", "Outros"];
const CATEGORIES_INCOME = ["Salário", "Freelance", "Vendas", "Investimentos", "Aluguel", "Serviços", "Reembolso", "Outros"];

type FormState = {
  type: "income" | "expense";
  description: string;
  amount: string;
  totalAmount: string;
  category: string;
  recurrenceType: "installment" | "recurring";
  totalInstallments: string;
  repeatUnit: "monthly" | "weekly" | "daily" | "yearly";
  dayOfMonth: string;
  startDate: string;
};

const EMPTY_FORM: FormState = {
  type: "expense",
  description: "",
  amount: "",
  totalAmount: "",
  category: "Outros",
  recurrenceType: "recurring",
  totalInstallments: "",
  repeatUnit: "monthly",
  dayOfMonth: "",
  startDate: new Date().toISOString().slice(0, 10),
};

export default function RecorrentesPage() {
  const [mode, setMode] = useState("");
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  function load(m: string) {
    setLoading(true);
    fetch(`/api/recurring?mode=${m}&status=active`)
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); });
  }

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => {
      const m = d.user?.activeMode || "personal";
      setMode(m);
      load(m);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(item: RecurringTransaction) {
    setEditingId(item.id);
    setForm({
      type: item.type,
      description: item.description,
      amount: String(item.amount),
      totalAmount: item.totalAmount ? String(item.totalAmount) : "",
      category: item.category,
      recurrenceType: item.recurrenceType,
      totalInstallments: item.totalInstallments ? String(item.totalInstallments) : "",
      repeatUnit: item.repeatUnit as FormState["repeatUnit"],
      dayOfMonth: item.dayOfMonth ? String(item.dayOfMonth) : "",
      startDate: item.startDate,
    });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      type: form.type,
      description: form.description,
      amount: form.amount,
      totalAmount: form.totalAmount || undefined,
      category: form.category,
      mode,
      recurrenceType: form.recurrenceType,
      totalInstallments: form.recurrenceType === "installment" ? form.totalInstallments : undefined,
      repeatUnit: form.repeatUnit,
      dayOfMonth: form.dayOfMonth || undefined,
      startDate: form.startDate,
    };
    if (editingId) {
      await fetch(`/api/recurring/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setSaving(false);
    setShowForm(false);
    load(mode);
  }

  async function cancelItem(item: RecurringTransaction) {
    if (!window.confirm(`Cancelar "${item.description}"?`)) return;
    await fetch(`/api/recurring/${item.id}`, { method: "DELETE" });
    load(mode);
  }

  async function markPaid(item: RecurringTransaction) {
    setConfirming(item.id);
    await fetch(`/api/recurring/${item.id}/confirm`, { method: "POST" });
    setConfirming(null);
    load(mode);
  }

  const installments = items.filter(r => r.recurrenceType === "installment");
  const recurrings = items.filter(r => r.recurrenceType === "recurring");
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
  const categories = form.type === "income" ? CATEGORIES_INCOME : CATEGORIES_EXPENSE;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💳 Recorrentes</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition">
          + Novo
        </button>
      </div>

      {loading ? <p className="text-slate-400 text-sm">Carregando...</p> : (
        <>
          {/* Parcelas */}
          {installments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-700 mb-4">💳 Parcelamentos ativos ({installments.length})</h2>
              <div className="space-y-4">
                {installments.map(item => {
                  const pct = item.totalInstallments ? Math.round((item.paidInstallments / item.totalInstallments) * 100) : 0;
                  const typeColor = item.type === "income" ? "text-emerald-600" : "text-red-500";
                  const isPast = item.nextDueDate < new Date().toISOString().slice(0, 10);
                  return (
                    <div key={item.id} className="group border border-slate-100 rounded-xl p-4 hover:border-slate-200 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-800">{item.description}</p>
                            <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", item.type === "income" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                              {item.type === "income" ? "Receita" : "Despesa"}
                            </span>
                          </div>
                          <p className={clsx("text-lg font-bold mt-0.5", typeColor)}>{fmt(item.amount)}<span className="text-sm font-normal text-slate-400">/parcela</span></p>
                          {item.totalAmount && <p className="text-xs text-slate-400">Total: {fmt(item.totalAmount)}</p>}
                          <p className="text-xs text-slate-400 mt-0.5">
                            Parcela {item.paidInstallments}/{item.totalInstallments} · Próx: <span className={clsx(isPast && "text-red-500 font-medium")}>{fmtDate(item.nextDueDate)}</span>
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 shrink-0">{pct}%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => markPaid(item)} disabled={confirming === item.id}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                            {confirming === item.id ? "..." : "✓ Pagar"}
                          </button>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => openEdit(item)} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs">✏️</button>
                            <button onClick={() => cancelItem(item)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs">🗑️</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recorrentes */}
          {recurrings.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-700 mb-4">🔁 Recorrentes ({recurrings.length})</h2>
              <div className="space-y-2">
                {recurrings.map(item => {
                  const isPast = item.nextDueDate < new Date().toISOString().slice(0, 10);
                  const typeColor = item.type === "income" ? "text-emerald-600" : "text-red-500";
                  return (
                    <div key={item.id} className="group flex items-center justify-between py-3 px-3 rounded-xl hover:bg-slate-50 transition">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800">{item.description}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{UNIT_LABEL[item.repeatUnit]}</span>
                          {item.dayOfMonth && <span className="text-xs text-slate-400">dia {item.dayOfMonth}</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Próx: <span className={clsx(isPast && "text-red-500 font-medium")}>{fmtDate(item.nextDueDate)}</span> · {item.category}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={clsx("font-semibold text-sm", typeColor)}>{fmt(item.amount)}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => openEdit(item)} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs">✏️</button>
                          <button onClick={() => cancelItem(item)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs">🗑️</button>
                        </div>
                        <button onClick={() => markPaid(item)} disabled={confirming === item.id}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                          {confirming === item.id ? "..." : "✓ Confirmar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">💳</p>
              <p className="font-semibold text-slate-700">Nenhum lançamento recorrente</p>
              <p className="text-sm text-slate-400 mt-1">Cadastre parcelas ou despesas/receitas recorrentes</p>
              <button onClick={openCreate} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition">
                + Adicionar
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-4">{editingId ? "✏️ Editar" : "+ Novo recorrente"}</h3>
            <form onSubmit={save} className="space-y-3">

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setForm(f => ({ ...f, type: "expense", category: "Outros" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", form.type === "expense" ? "bg-red-50 border-red-200 text-red-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  💸 Despesa
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, type: "income", category: "Outros" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", form.type === "income" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  💰 Receita
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setForm(f => ({ ...f, recurrenceType: "recurring" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", form.recurrenceType === "recurring" ? "bg-slate-800 border-slate-800 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  🔁 Recorrente
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, recurrenceType: "installment" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", form.recurrenceType === "installment" ? "bg-slate-800 border-slate-800 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  💳 Parcelado
                </button>
              </div>

              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required
                placeholder="Descrição (ex: Netflix, Aluguel)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />

              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
                  placeholder={form.recurrenceType === "installment" ? "Valor/parcela" : "Valor (R$)"} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                {form.recurrenceType === "installment" ? (
                  <input type="number" value={form.totalInstallments} onChange={e => setForm(f => ({ ...f, totalInstallments: e.target.value }))} required
                    placeholder="Nº parcelas" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                ) : (
                  <select value={form.repeatUnit} onChange={e => setForm(f => ({ ...f, repeatUnit: e.target.value as FormState["repeatUnit"] }))}
                    className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                    <option value="monthly">Mensal</option>
                    <option value="weekly">Semanal</option>
                    <option value="daily">Diário</option>
                    <option value="yearly">Anual</option>
                  </select>
                )}
              </div>

              {form.recurrenceType === "installment" && (
                <input type="number" step="0.01" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                  placeholder="Valor total (opcional)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              )}

              <div className="grid grid-cols-2 gap-3">
                <input type="number" min="1" max="31" value={form.dayOfMonth} onChange={e => setForm(f => ({ ...f, dayOfMonth: e.target.value }))}
                  placeholder="Dia do mês (ex: 10)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>

              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-50">
                  {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
