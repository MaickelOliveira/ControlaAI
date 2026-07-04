"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Goal = { id: string; title: string; targetAmount: number; currentAmount: number; deadline?: string; category: string; mode: string; status: string };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function pct(g: Goal) {
  if (!g.targetAmount) return 0;
  return Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
}

const CATEGORIES = ["Geral", "Viagem", "Emergência", "Investimento", "Educação", "Casa", "Carro", "Saúde", "Outros"];

export default function MetasPage() {
  const [mode, setMode] = useState<string>("personal");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showAdd, setShowAdd] = useState<Goal | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [editTarget, setEditTarget] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [form, setForm] = useState({ title: "", targetAmount: "", currentAmount: "0", deadline: "", category: "Geral" });

  async function loadGoals(m: string) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/goals?mode=${m}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setGoals(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => {
        const m = d.user?.activeMode || "personal";
        setMode(m);
        loadGoals(m);
      })
      .catch(() => { setError("Erro ao carregar dados"); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, targetAmount: parseFloat(form.targetAmount), currentAmount: parseFloat(form.currentAmount || "0"), mode }),
      });
      setShowForm(false);
      setForm({ title: "", targetAmount: "", currentAmount: "0", deadline: "", category: "Geral" });
      loadGoals(mode);
    } catch { /* silencioso */ }
  }

  async function handleAddAmount(goal: Goal) {
    try {
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, addAmount: parseFloat(addAmount) }),
      });
      setShowAdd(null);
      setAddAmount("");
      loadGoals(mode);
    } catch { /* silencioso */ }
  }

  async function handleComplete(goal: Goal) {
    try {
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, status: "completed" }),
      });
      loadGoals(mode);
    } catch { /* silencioso */ }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/goals?id=${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      loadGoals(mode);
    } catch { /* silencioso */ }
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
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm">
          + Nova Meta
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-medium">Erro ao carregar metas</p>
          <p className="text-sm text-red-400 mt-1">{error}</p>
          <button onClick={() => loadGoals(mode)} className="mt-3 text-sm text-red-600 underline">Tentar novamente</button>
        </div>
      ) : active.length === 0 && completed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
          <p className="text-5xl mb-3">🎯</p>
          <p className="font-semibold text-slate-700">Nenhuma meta criada</p>
          <p className="text-sm text-slate-400 mt-1">Defina um objetivo e acompanhe seu progresso!</p>
          <button onClick={() => setShowForm(true)} className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map(goal => {
            const p = pct(goal);
            const barColor = p >= 100 ? "bg-emerald-500" : p >= 75 ? "bg-indigo-500" : p >= 50 ? "bg-indigo-400" : "bg-indigo-300";
            return (
              <div key={goal.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{goal.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{goal.category}{goal.deadline && ` · Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className={clsx("text-xs rounded-full px-2.5 py-0.5 font-semibold border", p >= 100 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-indigo-100 text-indigo-600 border-indigo-200")}>
                      {p}%
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button onClick={() => setDeleteTarget(goal)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition" title="Excluir">🗑️</button>
                    </div>
                  </div>
                </div>

                <div className="h-2.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
                  <div className={clsx("h-2.5 rounded-full transition-all duration-500", barColor)} style={{ width: `${p}%` }} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">{fmt(goal.currentAmount)}</span>
                    <span className="text-slate-400 text-sm"> / {fmt(goal.targetAmount)}</span>
                    <span className="text-xs text-slate-400 ml-2">faltam {fmt(Math.max(0, goal.targetAmount - goal.currentAmount))}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowAdd(goal); setAddAmount(""); }}
                      className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition font-medium">
                      + Adicionar
                    </button>
                    <button onClick={() => handleComplete(goal)}
                      className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition font-medium">
                      ✓ Concluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {completed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-5">🏆 Concluídas ({completed.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {completed.map(goal => (
                  <div key={goal.id} className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 text-base shrink-0">🏆</div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700 text-sm truncate">{goal.title}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">{fmt(goal.targetAmount)} atingido!</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal — Nova Meta */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">🎯 Nova Meta</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                placeholder="Ex: Guardar para viagem" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              <input type="number" step="0.01" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} required
                placeholder="Valor alvo (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              <input type="number" step="0.01" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))}
                placeholder="Já tenho (R$) — opcional" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Adicionar valor */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 mb-1">+ Adicionar valor</h3>
            <p className="text-sm text-slate-500 mb-1">{showAdd.title}</p>
            <p className="text-xs text-slate-400 mb-4">{fmt(showAdd.currentAmount)} / {fmt(showAdd.targetAmount)} ({pct(showAdd)}%)</p>
            <input type="number" step="0.01" value={addAmount} onChange={e => setAddAmount(e.target.value)} autoFocus
              placeholder="Valor a adicionar (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 mb-3" />
            <div className="flex gap-3">
              <button onClick={() => setShowAdd(null)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={() => handleAddAmount(showAdd)} disabled={!addAmount}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-40">
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Confirmar exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-3xl mb-3">🗑️</p>
            <h3 className="font-bold text-slate-900 mb-1">Excluir meta?</h3>
            <p className="text-sm text-slate-500 mb-5">{deleteTarget.title}</p>
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
