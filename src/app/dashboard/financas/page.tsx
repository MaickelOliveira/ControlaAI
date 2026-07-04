"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Finance = { id: string; type: string; amount: number; category: string; description: string; date: string; mode: string };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

const EXPENSE_CATS = ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos", "Funcionários", "Marketing", "Fornecedores", "Outros"];
const INCOME_CATS = ["Salário", "Freelance", "Vendas", "Investimentos", "Aluguel", "Serviços", "Reembolso", "Outros"];

export default function FinancasPage() {
  const [mode, setMode] = useState<string>("");
  const [finances, setFinances] = useState<Finance[]>([]);
  const [balance, setBalance] = useState({ income: 0, expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  // modal adicionar
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "expense", amount: "", category: "", description: "" });

  // modal editar
  const [editTarget, setEditTarget] = useState<Finance | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", category: "", description: "", date: "" });

  // confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<Finance | null>(null);

  async function reload(m: string) {
    const d = await (await fetch(`/api/finances?mode=${m}`)).json();
    setFinances(d.finances || []);
    setBalance(d.balance || {});
  }

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => {
        const m = d.user?.activeMode || "personal";
        setMode(m);
        return fetch(`/api/finances?mode=${m}`);
      })
      .then(r => r.json())
      .then(d => { setFinances(d.finances || []); setBalance(d.balance || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/finances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount), mode }),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ type: "expense", amount: "", category: "", description: "" });
      await reload(mode);
    }
  }

  function openEdit(f: Finance) {
    setEditTarget(f);
    setEditForm({ amount: String(f.amount), category: f.category, description: f.description, date: f.date });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const res = await fetch(`/api/finances/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseFloat(editForm.amount), category: editForm.category, description: editForm.description, date: editForm.date }),
    });
    if (res.ok) {
      setEditTarget(null);
      await reload(mode);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/finances/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteTarget(null);
      await reload(mode);
    }
  }

  const cats = form.type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const editCats = editTarget?.type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const catTotals: Record<string, number> = {};
  finances.filter(f => f.type === "expense").forEach(f => {
    catTotals[f.category] = (catTotals[f.category] || 0) + f.amount;
  });
  const topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💰 Finanças</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition shadow-sm">
          + Adicionar
        </button>
      </div>

      {/* Saldo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-600 rounded-2xl p-6 shadow-sm">
          <p className="text-xs text-emerald-100 font-medium uppercase tracking-wide">Receitas</p>
          <p className="text-2xl font-bold text-white mt-2">{fmt(balance.income)}</p>
        </div>
        <div className="bg-red-500 rounded-2xl p-6 shadow-sm">
          <p className="text-xs text-red-100 font-medium uppercase tracking-wide">Despesas</p>
          <p className="text-2xl font-bold text-white mt-2">{fmt(balance.expense)}</p>
        </div>
        <div className={clsx("rounded-2xl p-6 shadow-sm", balance.balance >= 0 ? "bg-blue-600" : "bg-orange-500")}>
          <p className="text-xs text-blue-100 font-medium uppercase tracking-wide">Saldo do Mês</p>
          <p className="text-2xl font-bold text-white mt-2">{fmt(balance.balance)}</p>
        </div>
      </div>

      {/* Categorias + Extrato */}
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

        {/* Extrato com ações */}
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
                    {/* Ações: aparecem no hover */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(f)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        title="Editar">
                        ✏️
                      </button>
                      <button onClick={() => setDeleteTarget(f)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Excluir">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal — Adicionar */}
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

      {/* Modal — Editar */}
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
    </div>
  );
}
