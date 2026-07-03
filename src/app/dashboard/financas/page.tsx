"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Finance = { id: string; type: string; amount: number; category: string; description: string; date: string; mode: string };

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinancasPage() {
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [finances, setFinances] = useState<Finance[]>([]);
  const [balance, setBalance] = useState({ income: 0, expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "expense", amount: "", category: "", description: "" });

  const EXPENSE_CATS = ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos", "Funcionários", "Marketing", "Fornecedores", "Outros"];
  const INCOME_CATS = ["Salário", "Freelance", "Vendas", "Investimentos", "Aluguel", "Serviços", "Reembolso", "Outros"];

  useEffect(() => {
    setLoading(true);
    fetch(`/api/finances?mode=${mode}`)
      .then(r => r.json())
      .then(d => { setFinances(d.finances || []); setBalance(d.balance || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, [mode]);

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
      // Reload
      const d = await (await fetch(`/api/finances?mode=${mode}`)).json();
      setFinances(d.finances || []);
      setBalance(d.balance || {});
    }
  }

  const cats = form.type === "income" ? INCOME_CATS : EXPENSE_CATS;

  // Calcula categorias para exibição
  const catTotals: Record<string, number> = {};
  finances.filter(f => f.type === "expense").forEach(f => {
    catTotals[f.category] = (catTotals[f.category] || 0) + f.amount;
  });
  const topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">💰 Finanças</h1>
        <div className="flex gap-2">
          {(["personal", "business"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={clsx("px-4 py-2 rounded-xl text-sm font-medium transition",
                mode === m ? "bg-emerald-600 text-white" : "bg-white border text-gray-600 hover:bg-gray-50")}>
              {m === "personal" ? "👤 Pessoal" : "🏢 Empresa"}
            </button>
          ))}
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
            + Adicionar
          </button>
        </div>
      </div>

      {/* Saldo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-600 text-white rounded-2xl p-5">
          <p className="text-sm opacity-80">Receitas</p>
          <p className="text-xl font-bold mt-1">{fmt(balance.income)}</p>
        </div>
        <div className="bg-red-500 text-white rounded-2xl p-5">
          <p className="text-sm opacity-80">Despesas</p>
          <p className="text-xl font-bold mt-1">{fmt(balance.expense)}</p>
        </div>
        <div className={clsx("text-white rounded-2xl p-5", balance.balance >= 0 ? "bg-blue-600" : "bg-orange-500")}>
          <p className="text-sm opacity-80">Saldo</p>
          <p className="text-xl font-bold mt-1">{fmt(balance.balance)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top categorias */}
        {topCats.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-4">📊 Top Despesas por Categoria</h3>
            <div className="space-y-3">
              {topCats.map(([cat, val]) => {
                const pct = balance.expense > 0 ? (val / balance.expense * 100).toFixed(0) : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{cat}</span>
                      <span className="font-medium">{fmt(val)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Extrato */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">📋 Extrato</h3>
          {loading ? <p className="text-gray-400 text-sm">Carregando...</p> : finances.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm">Nenhum registro. Envie uma mensagem para o bot!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {finances.slice(0, 20).map(f => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{f.description}</p>
                    <p className="text-xs text-gray-400">{f.category} · {new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
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

      {/* Modal adicionar */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 mb-4">+ Nova transação</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="flex gap-2">
                {[{ v: "expense", l: "💸 Despesa" }, { v: "income", l: "💰 Receita" }].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setForm(f => ({ ...f, type: opt.v, category: "" }))}
                    className={clsx("flex-1 py-2 rounded-xl text-sm font-medium border transition",
                      form.type === opt.v ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-600 hover:bg-gray-50")}>
                    {opt.l}
                  </button>
                ))}
              </div>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
                placeholder="Valor (R$)" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none">
                <option value="">Categoria</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição (opcional)" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit"
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-emerald-700 transition">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
