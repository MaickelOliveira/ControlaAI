"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Task = { id: string; title: string; status: string; priority: string; dueDate?: string; mode: string };

const STATUS_COLS = [
  { key: "pending", label: "Pendente", icon: "📌", color: "border-orange-200 bg-orange-50/50" },
  { key: "in_progress", label: "Em andamento", icon: "🔄", color: "border-blue-200 bg-blue-50/50" },
  { key: "completed", label: "Concluído", icon: "✅", color: "border-amber-200 bg-amber-50/50" },
] as const;

const PR_COLOR: Record<string, string> = {
  high: "bg-red-100 text-red-600",
  medium: "bg-amber-100 text-amber-600",
  low: "bg-slate-100 text-slate-500",
};
const PR_ICON: Record<string, string> = { high: "!", medium: "·", low: "·" };

export default function TarefasPage() {
  const [mode, setMode] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", priority: "medium", dueDate: "" });

  function loadTasks(m: string) {
    setLoading(true);
    fetch(`/api/tasks?mode=${m}`)
      .then(r => r.json())
      .then(d => { setTasks(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => {
        const m = d.user?.activeMode || "personal";
        setMode(m);
        loadTasks(m);
      });
  }, []);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    loadTasks(mode);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, mode }) });
    setShowForm(false);
    setForm({ title: "", priority: "medium", dueDate: "" });
    loadTasks(mode);
  }

  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📋 Tarefas</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition">
          + Nova Tarefa
        </button>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_COLS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} className={clsx("bg-white rounded-2xl border-t-4 shadow-sm p-4", col.color)}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
                  <span>{col.icon}</span>{col.label}
                </h3>
                <span className="bg-slate-100 text-slate-500 text-xs rounded-full px-2 py-0.5 font-medium">{colTasks.length}</span>
              </div>
              <div className="space-y-2.5 min-h-16">
                {loading ? <p className="text-slate-300 text-xs">Carregando...</p> :
                  colTasks.length === 0 ? <p className="text-slate-300 text-xs text-center py-3">Vazio</p> :
                  colTasks.map(t => (
                    <div key={t.id} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                      <div className="flex items-start gap-2 mb-2">
                        <div className={clsx("w-5 h-5 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5", PR_COLOR[t.priority])}>
                          {PR_ICON[t.priority]}
                        </div>
                        <p className="text-sm font-medium text-slate-800 leading-tight">{t.title}</p>
                      </div>
                      {t.dueDate && (
                        <p className="text-xs text-slate-400 mb-2">📅 {new Date(t.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                      )}
                      <div className="flex gap-1 flex-wrap">
                        {STATUS_COLS.filter(c => c.key !== col.key).map(other => (
                          <button key={other.key} onClick={() => updateStatus(t.id, other.key)}
                            className="text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100 transition">
                            → {other.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">+ Nova tarefa</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                placeholder="Título da tarefa" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-200" />
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                <option value="low">⚪ Baixa prioridade</option>
                <option value="medium">🟡 Média prioridade</option>
                <option value="high">⚡ Alta prioridade</option>
              </select>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Prazo (opcional)</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-700 transition">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
