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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "expense", amount: "", category: "", description: "" });

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
      const d = await (await fetch(`/api/finances?mode=${mode}`)).json();
      setFinances(d.finances || []);
      setBalance(d.balance || {});
    }
  }

  const cats = form.type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const catTotals: Record<string, number> = {};
  finances.filter(f => f.type === "expense").forEach(f => {
    catTotals[f.category] = (catTotals[f.category] || 0) + f.amount;
  });
  const topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💰 Finanças</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition">
          + Adicionar
        </button>
      </div>

      {/* Saldo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Receitas</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(balance.income)}</p>
        </div>
        <div className="bg-white border border-red-100 rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Despesas</p>
          <p className="text-xl font-bold text-red-500 mt-1">{fmt(balance.expense)}</p>
        </div>
        <div className={clsx("bg-white rounded-2xl p-5 shadow-sm border", balance.balance >= 0 ? "border-blue-100" : "border-orange-100")}>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Saldo</p>
          <p className={clsx("text-xl font-bold mt-1", balance.balance >= 0 ? "text-blue-600" : "text-orange-500")}>{fmt(balance.balance)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {topCats.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4 text-sm">📊 Top Despesas por Categoria</h3>
            <div className="space-y-3">
              {topCats.map(([cat, val]) => {
                const pct = balance.expense > 0 ? (val / balance.expense * 100).toFixed(0) : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">{cat}</span>
                      <span className="font-semibold text-slate-800">{fmt(val)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={clsx("bg-white rounded-2xl border border-slate-100 shadow-sm p-5", topCats.length === 0 ? "lg:col-span-2" : "")}>
          <h3 className="font-semibold text-slate-800 mb-4 text-sm">📋 Extrato</h3>
          {loading ? <p className="text-slate-400 text-sm">Carregando...</p> : finances.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm">Nenhum registro ainda.</p>
              <p className="text-xs mt-1">Envie uma mensagem para o bot!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {finances.slice(0, 30).map(f => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold", f.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500")}>
                      {f.type === "income" ? "↑" : "↓"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{f.description}</p>
                      <p className="text-xs text-slate-400">{f.category} · {new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                  <span className={clsx("text-sm font-bold", f.type === "income" ? "text-emerald-600" : "text-red-500")}>
                    {f.type === "income" ? "+" : "-"}{fmt(f.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}
