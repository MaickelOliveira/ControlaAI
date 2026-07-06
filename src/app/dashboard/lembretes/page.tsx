"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Reminder = {
  id: string;
  message: string;
  scheduledAt: string;
  repeat: string;
  sent: boolean;
  phone: string;
};

const REPEAT_LABEL: Record<string, string> = {
  none: "Uma vez",
  daily: "Todo dia",
  weekly: "Toda semana",
  monthly: "Todo mês",
};

const REPEAT_ICON: Record<string, string> = {
  none: "🔔",
  daily: "🔁",
  weekly: "📅",
  monthly: "🗓️",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isOverdue(iso: string) {
  return new Date(iso) < new Date();
}

export default function LembretesPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ message: "", date: "", time: "", repeat: "none" });
  const [filter, setFilter] = useState<"all" | "active" | "sent">("active");

  function load() {
    setLoading(true);
    fetch("/api/admin/reminders")
      .then(r => r.json())
      .then(d => {
        setReminders(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => {
        setReminders([]);
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    setForm({
      message: "",
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 5),
      repeat: "none",
    });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(r: Reminder) {
    const d = new Date(r.scheduledAt);
    setForm({
      message: r.message,
      date: d.toISOString().slice(0, 10),
      time: d.toTimeString().slice(0, 5),
      repeat: r.repeat,
    });
    setEditingId(r.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();

    if (editingId) {
      await fetch("/api/admin/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, message: form.message, scheduledAt, repeat: form.repeat }),
      });
    } else {
      await fetch("/api/admin/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: form.message, scheduledAt, repeat: form.repeat }),
      });
    }
    setShowForm(false);
    setEditingId(null);
    load();
  }

  async function deleteReminder(id: string) {
    await fetch("/api/admin/reminders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const filtered = reminders.filter(r => {
    if (filter === "active") return !r.sent;
    if (filter === "sent") return r.sent;
    return true;
  });

  const activeCount = reminders.filter(r => !r.sent).length;
  const overdueCount = reminders.filter(r => !r.sent && isOverdue(r.scheduledAt)).length;

  // Quick preset messages
  const PRESETS = [
    "Tomar remédio",
    "Beber água",
    "Pagar conta",
    "Fazer exercício",
    "Reunião",
    "Ligar para cliente",
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🔔 Lembretes</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeCount} ativo{activeCount !== 1 ? "s" : ""}
            {overdueCount > 0 && <span className="text-red-500 ml-2">· {overdueCount} atrasado{overdueCount !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition shadow-sm">
          + Novo lembrete
        </button>
      </div>

      {/* Como usar via WhatsApp */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
        <p className="text-sm font-semibold text-emerald-800 mb-2">💬 Crie lembretes pelo WhatsApp:</p>
        <div className="grid md:grid-cols-3 gap-2">
          {[
            { ex: '"Me lembra de tomar remédio todo dia às 8h"', desc: "Diário" },
            { ex: '"Lembrete: pagar conta sexta às 14h"', desc: "Único" },
            { ex: '"Todo mês dia 5 pagar aluguel"', desc: "Mensal" },
          ].map(i => (
            <div key={i.ex} className="bg-white rounded-xl p-2.5 border border-emerald-100">
              <p className="text-xs text-slate-600 font-mono leading-relaxed">{i.ex}</p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-1">{i.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {([
          { key: "active", label: `Ativos (${activeCount})` },
          { key: "sent", label: "Enviados" },
          { key: "all", label: "Todos" },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={clsx("px-3 py-1.5 rounded-xl text-xs font-semibold transition border",
              filter === f.key ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-slate-400 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
          <p className="text-4xl mb-3">🔔</p>
          <p className="font-semibold text-slate-700">
            {filter === "active" ? "Nenhum lembrete ativo" : filter === "sent" ? "Nenhum lembrete enviado" : "Nenhum lembrete"}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {filter === "active" ? 'Crie um ou envie uma mensagem como "Me lembra de..."' : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(r => {
            const overdue = !r.sent && isOverdue(r.scheduledAt);
            return (
              <div key={r.id}
                className={clsx(
                  "bg-white rounded-2xl border shadow-sm p-4 flex items-start gap-4 transition",
                  r.sent ? "border-slate-100 opacity-60" :
                  overdue ? "border-red-200 bg-red-50/40" :
                  "border-slate-100 hover:border-slate-200"
                )}>
                {/* Ícone */}
                <div className={clsx(
                  "w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0",
                  r.sent ? "bg-slate-100" :
                  overdue ? "bg-red-100" :
                  "bg-emerald-100"
                )}>
                  {r.sent ? "✓" : REPEAT_ICON[r.repeat] || "🔔"}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <p className={clsx("font-semibold text-sm", r.sent ? "text-slate-500 line-through" : "text-slate-800")}>
                    {r.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className={clsx("text-xs", overdue ? "text-red-500 font-semibold" : "text-slate-400")}>
                      {overdue && "⚠ "}
                      {formatDate(r.scheduledAt)}
                    </span>
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium border",
                      r.sent ? "bg-slate-100 text-slate-400 border-slate-200" :
                      r.repeat !== "none" ? "bg-blue-50 text-blue-600 border-blue-200" :
                      "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {REPEAT_LABEL[r.repeat]}
                    </span>
                    {r.phone && (
                      <span className="text-xs text-slate-300">📱 {r.phone}</span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                {!r.sent && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(r)}
                      className="text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg transition border border-transparent hover:border-blue-200">
                      Editar
                    </button>
                    <button onClick={() => deleteReminder(r.id)}
                      className="text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg transition border border-transparent hover:border-red-200">
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">
              {editingId ? "✏️ Editar lembrete" : "🔔 Novo lembrete"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Presets rápidos */}
              {!editingId && (
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">Sugestões rápidas:</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {PRESETS.map(p => (
                      <button key={p} type="button"
                        onClick={() => setForm(f => ({ ...f, message: p }))}
                        className={clsx("text-xs px-2.5 py-1.5 rounded-lg border transition",
                          form.message === p
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700")}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Mensagem do lembrete</label>
                <input value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required
                  placeholder="Ex: Tomar remédio de pressão"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Data</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Horário</label>
                  <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Repetição</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(REPEAT_LABEL).map(([key, label]) => (
                    <button key={key} type="button"
                      onClick={() => setForm(f => ({ ...f, repeat: key }))}
                      className={clsx("py-2 rounded-xl text-xs font-medium border transition text-center",
                        form.repeat === key
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100")}>
                      <div>{REPEAT_ICON[key]}</div>
                      <div className="mt-0.5">{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit"
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 transition">
                  {editingId ? "Salvar" : "Criar lembrete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
