"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Task = { id: string; title: string; status: string; priority: string; dueDate?: string; mode: string };

const PRIORITY_ICON: Record<string, string> = { high: "⚡", medium: "🟡", low: "⚪" };
const STATUS_COLS = [
  { key: "pending", label: "📌 Pendente", color: "border-orange-300" },
  { key: "in_progress", label: "🔄 Em andamento", color: "border-blue-300" },
  { key: "completed", label: "✅ Concluído", color: "border-emerald-300" },
] as const;

export default function TarefasPage() {
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", priority: "medium", dueDate: "" });

  function load(m: string) {
    setLoading(true);
    fetch(`/api/tasks?mode=${m}`)
      .then(r => r.json())
      .then(d => { setTasks(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(mode); }, [mode]);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    load(mode);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, mode }) });
    setShowForm(false);
    setForm({ title: "", priority: "medium", dueDate: "" });
    load(mode);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📋 Tarefas</h1>
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

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_COLS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} className={clsx("bg-white rounded-2xl border-t-4 shadow-sm p-4", col.color)}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-700 text-sm">{col.label}</h3>
                <span className="bg-gray-100 text-gray-600 text-xs rounded-full px-2 py-0.5">{colTasks.length}</span>
              </div>
              <div className="space-y-3">
                {loading ? <p className="text-gray-400 text-xs">Carregando...</p> :
                  colTasks.length === 0 ? <p className="text-gray-300 text-xs text-center py-4">Nenhuma tarefa</p> :
                  colTasks.map(t => (
                    <div key={t.id} className="bg-gray-50 rounded-xl p-3 group">
                      <div className="flex items-start gap-2">
                        <span className="text-base mt-0.5">{PRIORITY_ICON[t.priority]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 line-clamp-2">{t.title}</p>
                          {t.dueDate && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              📅 {new Date(t.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Status actions */}
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {STATUS_COLS.filter(c => c.key !== col.key).map(other => (
                          <button key={other.key} onClick={() => updateStatus(t.id, other.key)}
                            className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                            → {other.label.split(" ")[1]}
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

      {/* Modal nova tarefa */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 mb-4">+ Nova tarefa</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                placeholder="Título da tarefa" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none">
                <option value="low">⚪ Baixa prioridade</option>
                <option value="medium">🟡 Média prioridade</option>
                <option value="high">⚡ Alta prioridade</option>
              </select>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Prazo (opcional)</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit"
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-emerald-700 transition">Criar tarefa</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
