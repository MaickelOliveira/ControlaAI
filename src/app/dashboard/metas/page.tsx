"use client";
import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type Goal = { id: string; title: string; targetAmount: number; currentAmount: number; deadline?: string; category: string; mode: string; status: string };

function fmt(v: number | null | undefined) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(g: Goal) {
  const target = Number(g.targetAmount) || 0;
  const current = Number(g.currentAmount) || 0;
  if (!target) return 0;
  return Math.min(100, Math.round((current / target) * 100));
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
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [form, setForm] = useState({ title: "", targetAmount: "", currentAmount: "0", deadline: "", category: "Geral" });

  async function loadGoals(m: string) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/goals?mode=${m}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      const valid = Array.isArray(data)
        ? data.filter((g): g is Goal => g && typeof g === "object" && !!g.id)
        : [];
      setGoals(valid);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardMe()
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
    <div className="z-page">
      <div className="z-page-heading flex items-center justify-between">
        <div>
          <PageTitle icon="target">Metas</PageTitle>
          <p className="text-subtle text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition shadow-sm">
          + Nova Meta
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-soft border border-line rounded-2xl p-6 text-center">
          <p className="text-red-ink font-medium">Erro ao carregar metas</p>
          <p className="text-sm text-red-400 mt-1">{error}</p>
          <button onClick={() => loadGoals(mode)} className="mt-3 text-sm text-red-ink underline">Tentar novamente</button>
        </div>
      ) : active.length === 0 && completed.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
          <p className="text-5xl mb-3">🎯</p>
          <p className="font-semibold text-ink">Nenhuma meta criada</p>
          <p className="text-sm text-subtle mt-1">Defina um objetivo e acompanhe seu progresso!</p>
          <button onClick={() => setShowForm(true)} className="mt-4 px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition">
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map(goal => {
            const p = pct(goal);
            const barColor = "bg-primary";
            return (
              <div key={goal.id} className="group bg-surface rounded-2xl border border-line shadow-sm p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-ink truncate">{goal.title}</h3>
                    <p className="text-xs text-subtle mt-0.5">{goal.category}{goal.deadline && ` · Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className={clsx("text-xs rounded-full px-2.5 py-0.5 font-semibold border", p >= 100 ? "bg-amber-soft text-amber-ink border-line" : "bg-indigo-soft text-indigo-ink border-line")}>
                      {p}%
                    </span>
                    <div className="transition-opacity flex gap-1">
                      <button onClick={() => setDeleteTarget(goal)} className="p-1.5 rounded-lg text-subtle hover:text-red-500 hover:bg-red-soft transition" title="Excluir">🗑️</button>
                    </div>
                  </div>
                </div>

                <div className="h-2.5 bg-surface-muted rounded-full mb-3 overflow-hidden">
                  <div className={clsx("h-2.5 rounded-full transition-all duration-500", barColor)} style={{ width: `${p}%` }} />
                </div>

                <div className="flex flex-col items-start gap-4">
                  <div>
                    <span className="font-bold text-ink">{fmt(goal.currentAmount)}</span>
                    <span className="text-subtle text-sm"> / {fmt(goal.targetAmount)}</span>
                    <span className="text-xs text-subtle ml-2">faltam {fmt(Math.max(0, (Number(goal.targetAmount) || 0) - (Number(goal.currentAmount) || 0)))}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowAdd(goal); setAddAmount(""); }}
                      className="text-xs px-3 py-1.5 bg-indigo-soft text-indigo-ink border border-line rounded-lg hover:bg-indigo-soft transition font-medium">
                      + Adicionar
                    </button>
                    <button onClick={() => handleComplete(goal)}
                      className="text-xs px-3 py-1.5 bg-amber-soft text-amber-ink border border-line rounded-lg hover:bg-amber-soft transition font-medium">
                      ✓ Concluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {completed.length > 0 && (
            <div className="md:col-span-2 xl:col-span-3">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-2 mt-5">🏆 Concluídas ({completed.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {completed.map(goal => (
                  <div key={goal.id} className="bg-amber-soft border border-line rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-soft flex items-center justify-center text-amber-ink text-base shrink-0">🏆</div>
                    <div className="min-w-0">
                      <p className="font-medium text-ink text-sm truncate">{goal.title}</p>
                      <p className="text-xs text-amber-ink mt-0.5">{fmt(goal.targetAmount || 0)} atingido!</p>
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
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-ink mb-4">🎯 Nova Meta</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                placeholder="Ex: Guardar para viagem" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              <input type="number" step="0.01" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} required
                placeholder="Valor alvo (R$)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              <input type="number" step="0.01" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))}
                placeholder="Já tenho (R$) — opcional" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none bg-surface">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Adicionar valor */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-ink mb-1">+ Adicionar valor</h3>
            <p className="text-sm text-muted mb-1">{showAdd.title}</p>
            <p className="text-xs text-subtle mb-4">{fmt(showAdd.currentAmount)} / {fmt(showAdd.targetAmount)} ({pct(showAdd)}%)</p>
            <input type="number" step="0.01" value={addAmount} onChange={e => setAddAmount(e.target.value)} autoFocus
              placeholder="Valor a adicionar (R$)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 mb-3" />
            <div className="flex gap-3">
              <button onClick={() => setShowAdd(null)} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
              <button onClick={() => handleAddAmount(showAdd)} disabled={!addAmount}
                className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition disabled:opacity-40">
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Confirmar exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-3xl mb-3">🗑️</p>
            <h3 className="font-bold text-ink mb-1">Excluir meta?</h3>
            <p className="text-sm text-muted mb-5">{deleteTarget.title}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 transition">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
