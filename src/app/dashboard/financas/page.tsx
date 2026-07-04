"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Finance = { id: string; type: string; amount: number; category: string; description: string; date: string; mode: string };

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
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d: string) { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR"); }

const EXPENSE_CATS = ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos", "Funcionários", "Marketing", "Fornecedores", "Outros"];
const INCOME_CATS = ["Salário", "Freelance", "Vendas", "Investimentos", "Aluguel", "Serviços", "Reembolso", "Outros"];
const UNIT_LABEL: Record<string, string> = { monthly: "Mensal", weekly: "Semanal", daily: "Diário", yearly: "Anual" };

type RecForm = {
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

const EMPTY_REC: RecForm = {
  type: "expense", description: "", amount: "", totalAmount: "", category: "Outros",
  recurrenceType: "recurring", totalInstallments: "", repeatUnit: "monthly",
  dayOfMonth: "", startDate: new Date().toISOString().slice(0, 10),
};

export default function FinancasPage() {
  const [mode, setMode] = useState("");
  const [tab, setTab] = useState<"lancamentos" | "recorrentes">("lancamentos");

  // ── Lançamentos ──
  const [finances, setFinances] = useState<Finance[]>([]);
  const [balance, setBalance] = useState({ income: 0, expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "expense", amount: "", category: "", description: "" });
  const [editTarget, setEditTarget] = useState<Finance | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", category: "", description: "", date: "" });
  const [deleteTarget, setDeleteTarget] = useState<Finance | null>(null);

  // ── Recorrentes ──
  const [recs, setRecs] = useState<RecurringTransaction[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [showRecForm, setShowRecForm] = useState(false);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [recForm, setRecForm] = useState<RecForm>(EMPTY_REC);
  const [recSaving, setRecSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  function loadFinances(m: string) {
    setLoading(true);
    fetch(`/api/finances?mode=${m}`).then(r => r.json()).then(d => {
      setFinances(d.finances || []);
      setBalance(d.balance || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  function loadRecs(m: string) {
    setRecsLoading(true);
    fetch(`/api/recurring?mode=${m}&status=active`).then(r => r.json()).then(d => {
      setRecs(Array.isArray(d) ? d : []);
      setRecsLoading(false);
    }).catch(() => setRecsLoading(false));
  }

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => {
      const m = d.user?.activeMode || "personal";
      setMode(m);
      loadFinances(m);
      loadRecs(m);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers lançamentos ──
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/finances", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount), mode }),
    });
    if (res.ok) { setShowForm(false); setForm({ type: "expense", amount: "", category: "", description: "" }); loadFinances(mode); }
  }

  function openEdit(f: Finance) {
    setEditTarget(f);
    setEditForm({ amount: String(f.amount), category: f.category, description: f.description, date: f.date });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const res = await fetch(`/api/finances/${editTarget.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseFloat(editForm.amount), category: editForm.category, description: editForm.description, date: editForm.date }),
    });
    if (res.ok) { setEditTarget(null); loadFinances(mode); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/finances/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) { setDeleteTarget(null); loadFinances(mode); }
  }

  // ── Handlers recorrentes ──
  function openRecCreate() {
    setEditingRecId(null);
    setRecForm(EMPTY_REC);
    setShowRecForm(true);
  }

  function openRecEdit(item: RecurringTransaction) {
    setEditingRecId(item.id);
    setRecForm({
      type: item.type, description: item.description, amount: String(item.amount),
      totalAmount: item.totalAmount ? String(item.totalAmount) : "",
      category: item.category, recurrenceType: item.recurrenceType,
      totalInstallments: item.totalInstallments ? String(item.totalInstallments) : "",
      repeatUnit: item.repeatUnit as RecForm["repeatUnit"],
      dayOfMonth: item.dayOfMonth ? String(item.dayOfMonth) : "",
      startDate: item.startDate,
    });
    setShowRecForm(true);
  }

  async function handleRecSave(e: React.FormEvent) {
    e.preventDefault();
    setRecSaving(true);
    const body = {
      type: recForm.type, description: recForm.description, amount: recForm.amount,
      totalAmount: recForm.totalAmount || undefined, category: recForm.category, mode,
      recurrenceType: recForm.recurrenceType,
      totalInstallments: recForm.recurrenceType === "installment" ? recForm.totalInstallments : undefined,
      repeatUnit: recForm.repeatUnit,
      dayOfMonth: recForm.dayOfMonth || undefined, startDate: recForm.startDate,
    };
    if (editingRecId) {
      await fetch(`/api/recurring/${editingRecId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setRecSaving(false);
    setShowRecForm(false);
    loadRecs(mode);
  }

  async function handleRecCancel(item: RecurringTransaction) {
    if (!window.confirm(`Cancelar "${item.description}"?`)) return;
    await fetch(`/api/recurring/${item.id}`, { method: "DELETE" });
    loadRecs(mode);
  }

  async function handleMarkPaid(item: RecurringTransaction) {
    setMarkingPaid(item.id);
    await fetch(`/api/recurring/${item.id}/confirm`, { method: "POST" });
    setMarkingPaid(null);
    loadRecs(mode);
    loadFinances(mode);
  }

  const cats = form.type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const editCats = editTarget?.type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const recCats = recForm.type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const catTotals: Record<string, number> = {};
  finances.filter(f => f.type === "expense").forEach(f => { catTotals[f.category] = (catTotals[f.category] || 0) + f.amount; });
  const topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
  const installments = recs.filter(r => r.recurrenceType === "installment");
  const recurrings = recs.filter(r => r.recurrenceType === "recurring");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💰 Finanças</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button
          onClick={() => tab === "recorrentes" ? openRecCreate() : setShowForm(true)}
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition shadow-sm">
          + Adicionar
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(["lancamentos", "recorrentes"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition", tab === t ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}>
            {t === "lancamentos" ? "📋 Lançamentos" : "🔁 Recorrentes"}
          </button>
        ))}
      </div>

      {/* ── TAB: LANÇAMENTOS ── */}
      {tab === "lancamentos" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-600 rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-emerald-100 font-medium uppercase tracking-wide">Receitas</p>
              <p className="text-2xl font-bold text-white mt-2">{fmt(balance.income)}</p>
            </div>
            <div className="bg-red-500 rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-red-100 font-medium uppercase tracking-wide">Despesas</p>
              <p className="text-2xl font-bold text-white mt-2">{fmt(balance.expense)}</p>
            </div>
            <div className={clsx("rounded-2xl p-5 shadow-sm", balance.balance >= 0 ? "bg-blue-600" : "bg-orange-500")}>
              <p className="text-xs text-blue-100 font-medium uppercase tracking-wide">Saldo do Mês</p>
              <p className="text-2xl font-bold text-white mt-2">{fmt(balance.balance)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4 text-sm">📊 Despesas por Categoria</h3>
              {topCats.length === 0 ? (
                <div className="text-center py-10 text-slate-300">
                  <p className="text-3xl mb-2">📊</p>
                  <p className="text-sm">Sem despesas registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {topCats.map(([cat, val]) => {
                    const pct = balance.expense > 0 ? (val / balance.expense * 100).toFixed(0) : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="text-slate-600 font-medium">{cat}</span>
                          <span className="font-semibold text-slate-800">{fmt(val)}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full">
                          <div className="h-2 bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 text-right">{pct}% do total</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4 text-sm">📋 Extrato</h3>
              {loading ? <p className="text-slate-400 text-sm">Carregando...</p> : finances.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <p className="text-4xl mb-3">💬</p>
                  <p className="font-medium text-slate-500">Nenhum registro ainda</p>
                  <p className="text-xs mt-1">Envie uma mensagem para o bot!</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {finances.slice(0, 50).map(f => (
                    <div key={f.id} className="group flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", f.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500")}>
                          {f.type === "income" ? "↑" : "↓"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{f.description}</p>
                          <p className="text-xs text-slate-400">{f.category} · {new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className={clsx("text-sm font-bold", f.type === "income" ? "text-emerald-600" : "text-red-500")}>
                          {f.type === "income" ? "+" : "-"}{fmt(f.amount)}
                        </span>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Editar">✏️</button>
                          <button onClick={() => setDeleteTarget(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition" title="Excluir">🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── TAB: RECORRENTES ── */}
      {tab === "recorrentes" && (
        <>
          {recsLoading ? <p className="text-slate-400 text-sm">Carregando...</p> : recs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">🔁</p>
              <p className="font-semibold text-slate-700">Nenhum lançamento recorrente</p>
              <p className="text-sm text-slate-400 mt-1">Cadastre parcelas ou despesas/receitas recorrentes</p>
              <button onClick={openRecCreate} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition">+ Adicionar</button>
            </div>
          ) : (
            <div className="space-y-5">
              {installments.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="font-bold text-slate-700 mb-4 text-sm">💳 Parcelamentos ativos ({installments.length})</h2>
                  <div className="space-y-4">
                    {installments.map(item => {
                      const pct = item.totalInstallments ? Math.round((item.paidInstallments / item.totalInstallments) * 100) : 0;
                      const isPast = item.nextDueDate < today;
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
                              <p className={clsx("text-lg font-bold mt-0.5", item.type === "income" ? "text-emerald-600" : "text-red-500")}>
                                {fmt(item.amount)}<span className="text-sm font-normal text-slate-400">/parcela</span>
                              </p>
                              {item.totalAmount && <p className="text-xs text-slate-400">Total: {fmt(item.totalAmount)}</p>}
                              <p className="text-xs text-slate-400 mt-0.5">
                                Parcela {item.paidInstallments}/{item.totalInstallments} · Próx:{" "}
                                <span className={clsx(isPast && "text-red-500 font-medium")}>{fmtDate(item.nextDueDate)}</span>
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-slate-500 shrink-0">{pct}%</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                              <button onClick={() => handleMarkPaid(item)} disabled={markingPaid === item.id}
                                className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                                {markingPaid === item.id ? "..." : "✓ Pagar"}
                              </button>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                <button onClick={() => openRecEdit(item)} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs">✏️</button>
                                <button onClick={() => handleRecCancel(item)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs">🗑️</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {recurrings.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="font-bold text-slate-700 mb-4 text-sm">🔁 Recorrentes ({recurrings.length})</h2>
                  <div className="space-y-1">
                    {recurrings.map(item => {
                      const isPast = item.nextDueDate < today;
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
                            <span className={clsx("font-semibold text-sm", item.type === "income" ? "text-emerald-600" : "text-red-500")}>{fmt(item.amount)}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => openRecEdit(item)} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs">✏️</button>
                              <button onClick={() => handleRecCancel(item)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs">🗑️</button>
                            </div>
                            <button onClick={() => handleMarkPaid(item)} disabled={markingPaid === item.id}
                              className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                              {markingPaid === item.id ? "..." : "✓ Confirmar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal — Adicionar lançamento */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">+ Nova transação</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="flex gap-2">
                {[{ v: "expense", l: "💸 Despesa" }, { v: "income", l: "💰 Receita" }].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setForm(f => ({ ...f, type: opt.v, category: "" }))}
                    className={clsx("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition",
                      form.type === opt.v ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                    {opt.l}
                  </button>
                ))}
              </div>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
                placeholder="Valor (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-200" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                <option value="">Categoria</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição (opcional)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 transition">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Editar lançamento */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-1">✏️ Editar lançamento</h3>
            <p className="text-xs text-slate-400 mb-4">{editTarget.type === "income" ? "💰 Receita" : "💸 Despesa"}</p>
            <form onSubmit={handleEdit} className="space-y-3">
              <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} required
                placeholder="Valor (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} required
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                <option value="">Categoria</option>
                {editCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition">Salvar alterações</button>
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
            <h3 className="font-bold text-slate-900 mb-1">Excluir lançamento?</h3>
            <p className="text-sm text-slate-500 mb-1">{deleteTarget.description}</p>
            <p className={clsx("text-lg font-bold mb-5", deleteTarget.type === "income" ? "text-emerald-600" : "text-red-500")}>
              {deleteTarget.type === "income" ? "+" : "-"}{fmt(deleteTarget.amount)}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 transition">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Criar/Editar recorrente */}
      {showRecForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-4">{editingRecId ? "✏️ Editar recorrente" : "+ Novo recorrente"}</h3>
            <form onSubmit={handleRecSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setRecForm(f => ({ ...f, type: "expense", category: "Outros" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", recForm.type === "expense" ? "bg-red-50 border-red-200 text-red-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  💸 Despesa
                </button>
                <button type="button" onClick={() => setRecForm(f => ({ ...f, type: "income", category: "Outros" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", recForm.type === "income" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  💰 Receita
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setRecForm(f => ({ ...f, recurrenceType: "recurring" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", recForm.recurrenceType === "recurring" ? "bg-slate-800 border-slate-800 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  🔁 Recorrente
                </button>
                <button type="button" onClick={() => setRecForm(f => ({ ...f, recurrenceType: "installment" }))}
                  className={clsx("py-2.5 rounded-xl text-sm font-medium border transition", recForm.recurrenceType === "installment" ? "bg-slate-800 border-slate-800 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  💳 Parcelado
                </button>
              </div>
              <input value={recForm.description} onChange={e => setRecForm(f => ({ ...f, description: e.target.value }))} required
                placeholder="Descrição (ex: Netflix, Aluguel)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" value={recForm.amount} onChange={e => setRecForm(f => ({ ...f, amount: e.target.value }))} required
                  placeholder={recForm.recurrenceType === "installment" ? "Valor/parcela" : "Valor (R$)"} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                {recForm.recurrenceType === "installment" ? (
                  <input type="number" value={recForm.totalInstallments} onChange={e => setRecForm(f => ({ ...f, totalInstallments: e.target.value }))} required
                    placeholder="Nº parcelas" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                ) : (
                  <select value={recForm.repeatUnit} onChange={e => setRecForm(f => ({ ...f, repeatUnit: e.target.value as RecForm["repeatUnit"] }))}
                    className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                    <option value="monthly">Mensal</option>
                    <option value="weekly">Semanal</option>
                    <option value="daily">Diário</option>
                    <option value="yearly">Anual</option>
                  </select>
                )}
              </div>
              {recForm.recurrenceType === "installment" && (
                <input type="number" step="0.01" value={recForm.totalAmount} onChange={e => setRecForm(f => ({ ...f, totalAmount: e.target.value }))}
                  placeholder="Valor total (opcional)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min="1" max="31" value={recForm.dayOfMonth} onChange={e => setRecForm(f => ({ ...f, dayOfMonth: e.target.value }))}
                  placeholder="Dia do mês (ex: 10)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input type="date" value={recForm.startDate} onChange={e => setRecForm(f => ({ ...f, startDate: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <select value={recForm.category} onChange={e => setRecForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                {recCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowRecForm(false)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={recSaving}
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
                  {recSaving ? "Salvando..." : editingRecId ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
