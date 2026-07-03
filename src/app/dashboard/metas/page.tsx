"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Goal = { id: string; title: string; targetAmount: number; currentAmount: number; deadline?: string; category: string; mode: string; status: string };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function pct(g: Goal) { return Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)); }

export default function MetasPage() {
  const [mode, setMode] = useState<string>("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAdd, setShowAdd] = useState<Goal | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [form, setForm] = useState({ title: "", targetAmount: "", currentAmount: "0", deadline: "", category: "Geral" });

  function load(m: string) {
    setLoading(true);
    fetch(`/api/admin/goals?mode=${m}`)
      .then(r => r.json())
      .then(d => { setGoals(Array.isArray(d) ? d : []); setLoading(false); });
  }

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => {
        const m = d.user?.activeMode || "personal";
        setMode(m);
        load(m);
      });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, targetAmount: parseFloat(form.targetAmount), currentAmount: parseFloat(form.currentAmount || "0"), mode }) });
    setShowForm(false);
    setForm({ title: "", targetAmount: "", currentAmount: "0", deadline: "", category: "Geral" });
    load(mode);
  }

  async function handleAdd(goal: Goal) {
    await fetch("/api/admin/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: goal.id, addAmount: parseFloat(addAmount) }) });
    setShowAdd(null); setAddAmount(""); load(mode);
  }

  async function complete(goal: Goal) {
    await fetch("/api/admin/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: goal.id, status: "completed" }) });
    load(mode);
  }

  const active = goals.filter(g => g.status === "active");
  const completed = goals.filter(g => g.status === "completed");
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🎯 Metas</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
          + Nova Meta
        </button>
      </div>

      {loading ? <p className="text-slate-400 text-sm">Carregando...</p> :
        active.length === 0 && completed.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">🎯</p>
            <p className="font-semibold text-slate-700">Nenhuma meta criada</p>
            <p className="text-sm text-slate-400 mt-1">Defina um objetivo e acompanhe seu progresso!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(goal => {
              const p = pct(goal);
              return (
                <div key={goal.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-800">{goal.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{goal.category}{goal.deadline && ` · ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`}</p>
                    </div>
                    <span className="text-xs bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-full px-2.5 py-0.5 font-semibold shrink-0 ml-3">{p}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full mb-2">
                    <div className={clsx("h-2 rounded-full transition-all", p >= 100 ? "bg-emerald-500" : "bg-indigo-500")} style={{ width: `${p}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm">
                      <span className="font-semibold text-slate-800">{fmt(goal.currentAmount)}</span>
                      <span className="text-slate-400"> / {fmt(goal.targetAmount)}</span>
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowAdd(goal); setAddAmount(""); }} className="text-xs px-2.5 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition font-medium">+ Adicionar</button>
                      <button onClick={() => complete(goal)} className="text-xs px-2.5 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition font-medium">✓ Concluir</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {completed.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-4">🏆 Concluídas</p>
                {completed.map(goal => (
                  <div key={goal.id} className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-2">
                    <p className="font-medium text-slate-700 text-sm">{goal.title}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">✓ {fmt(goal.targetAmount)} atingido!</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">🎯 Nova Meta</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                placeholder="Ex: Guardar para viagem" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              <input type="number" step="0.01" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} required
                placeholder="Valor da meta (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input type="number" step="0.01" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))}
                placeholder="Já guardei (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Categoria (ex: Viagem, Emergência)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 mb-1">+ Adicionar valor</h3>
            <p className="text-sm text-slate-500 mb-4">{showAdd.title}</p>
            <input type="number" step="0.01" value={addAmount} onChange={e => setAddAmount(e.target.value)} autoFocus
              placeholder="Valor (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 mb-3" />
            <div className="flex gap-3">
              <button onClick={() => setShowAdd(null)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={() => handleAdd(showAdd)} disabled={!addAmount} className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-40">Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
