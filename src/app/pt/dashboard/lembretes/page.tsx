"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type RecipientType = "self" | "customer" | "employee" | "other";

type Reminder = {
  id: string;
  message: string;
  scheduledAt: string;
  repeat: string;
  sent: boolean;
  failedAttempts: number;
  phone: string;
  recipientType: RecipientType;
  recipientName?: string;
};

type Contact = { id: string; name: string; phone?: string };

const RECIPIENT_LABEL: Record<RecipientType, string> = {
  self: "👤 Tu",
  customer: "🧑‍💼 Cliente",
  employee: "🧑‍🔧 Equipa",
  other: "📱 Outro",
};

// Precisa bater com MAX_FAILED_ATTEMPTS em src/lib/reminders.ts — não
// importa direto porque esse arquivo roda no navegador (cliente).
const MAX_FAILED_ATTEMPTS = 5;

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
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " às " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function isOverdue(iso: string) {
  return new Date(iso) < new Date();
}

export default function LembretesPagePt() {
  const [mode, setMode] = useState<string>("personal");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ message: "", date: "", time: "", repeat: "none" });
  const [filter, setFilter] = useState<"all" | "active" | "sent">("active");

  // Destinatário — "Assessor notifica por você"
  const [recipientType, setRecipientType] = useState<RecipientType>("self");
  const [recipientId, setRecipientId] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [employees, setEmployees] = useState<Contact[]>([]);

  function load(m: string) {
    setLoading(true);
    fetch(`/api/admin/reminders?mode=${m}`)
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

  useEffect(() => {
    fetchDashboardMe()
      .then(d => {
        const m = d.user?.activeMode || "personal";
        setMode(m);
        load(m);
        if (m === "business") {
          fetch("/api/admin/customers").then(r => r.json()).then(d => setCustomers(d.customers || [])).catch(() => {});
          fetch("/api/admin/employees").then(r => r.json()).then(d => setEmployees(d.employees || [])).catch(() => {});
        }
      })
      .catch(() => load("personal"));
  }, []);

  function resetRecipient() {
    setRecipientType("self");
    setRecipientId("");
    setRecipientLabel("");
    setRecipientPhone("");
  }

  function openNew() {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    setForm({
      message: "",
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 5),
      repeat: "none",
    });
    resetRecipient();
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
    setRecipientType(r.recipientType || "self");
    if (r.recipientType === "customer") setRecipientId(customers.find(c => c.name === r.recipientName)?.id || "");
    else if (r.recipientType === "employee") setRecipientId(employees.find(c => c.name === r.recipientName)?.id || "");
    else setRecipientId("");
    setRecipientLabel(r.recipientType === "other" ? (r.recipientName || "") : "");
    setRecipientPhone(r.recipientType === "other" ? r.phone : "");
    setEditingId(r.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();

    const recipientPayload = recipientType === "self"
      ? { recipientType: "self" as const }
      : recipientType === "customer"
      ? (() => { const c = customers.find(x => x.id === recipientId); return { recipientType: "customer" as const, recipientName: c?.name, phone: c?.phone }; })()
      : recipientType === "employee"
      ? (() => { const e = employees.find(x => x.id === recipientId); return { recipientType: "employee" as const, recipientName: e?.name, phone: e?.phone }; })()
      : { recipientType: "other" as const, recipientName: recipientLabel, phone: recipientPhone };

    if (editingId) {
      await fetch("/api/admin/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, message: form.message, scheduledAt, repeat: form.repeat, ...recipientPayload }),
      });
    } else {
      await fetch("/api/admin/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: form.message, scheduledAt, repeat: form.repeat, mode, ...recipientPayload }),
      });
    }
    setShowForm(false);
    setEditingId(null);
    resetRecipient();
    load(mode);
  }

  async function deleteReminder(id: string) {
    await fetch("/api/admin/reminders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load(mode);
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
            {mode === "business" ? "🏢 Empresa" : "👤 Pessoal"} · {activeCount} ativo{activeCount !== 1 ? "s" : ""}
            {overdueCount > 0 && <span className="text-red-500 ml-2">· {overdueCount} atrasado{overdueCount !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition shadow-sm">
          + Novo lembrete
        </button>
      </div>

      {/* Como usar via WhatsApp */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-sm font-semibold text-amber-800 mb-2">💬 Cria lembretes pelo WhatsApp:</p>
        <div className="grid md:grid-cols-3 gap-2">
          {[
            { ex: '"Lembra-me de tomar o remédio todos os dias às 8h"', desc: "Diário" },
            { ex: '"Lembrete: pagar a conta sexta às 14h"', desc: "Único" },
            { ex: '"Todos os meses no dia 5 pagar a renda"', desc: "Mensal" },
          ].map(i => (
            <div key={i.ex} className="bg-white rounded-xl p-2.5 border border-amber-100">
              <p className="text-xs text-slate-600 font-mono leading-relaxed">{i.ex}</p>
              <p className="text-[10px] text-amber-600 font-semibold mt-1">{i.desc}</p>
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
        <p className="text-slate-400 text-sm">A carregar...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
          <p className="text-4xl mb-3">🔔</p>
          <p className="font-semibold text-slate-700">
            {filter === "active" ? "Nenhum lembrete ativo" : filter === "sent" ? "Nenhum lembrete enviado" : "Nenhum lembrete"}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {filter === "active" ? 'Cria um ou envia uma mensagem como "Lembra-me de..."' : ""}
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
                  "bg-amber-100"
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
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium border",
                      r.recipientType && r.recipientType !== "self"
                        ? "bg-violet-50 text-violet-600 border-violet-200"
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    )}>
                      {r.recipientType === "self" || !r.recipientType
                        ? RECIPIENT_LABEL.self
                        : `${RECIPIENT_LABEL[r.recipientType]}${r.recipientName ? ` · ${r.recipientName}` : ""}`}
                    </span>
                    {!r.sent && r.failedAttempts > 0 && (
                      <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium border",
                        r.failedAttempts >= MAX_FAILED_ATTEMPTS
                          ? "bg-red-50 text-red-600 border-red-200"
                          : "bg-amber-50 text-amber-600 border-amber-200"
                      )}>
                        {r.failedAttempts >= MAX_FAILED_ATTEMPTS
                          ? "⚠ desistiu após várias tentativas"
                          : `⚠ falhou ${r.failedAttempts}x`}
                      </span>
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
                      Eliminar
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
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700")}>
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
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200" />
              </div>

              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Para quem é este lembrete?</label>
                <div className={clsx("grid gap-2", mode === "business" ? "grid-cols-4" : "grid-cols-2")}>
                  {(mode === "business"
                    ? (["self", "customer", "employee", "other"] as const)
                    : (["self", "other"] as const)
                  ).map(t => (
                    <button key={t} type="button"
                      onClick={() => { setRecipientType(t); setRecipientId(""); setRecipientLabel(""); setRecipientPhone(""); }}
                      className={clsx("py-2 rounded-xl text-xs font-medium border transition text-center",
                        recipientType === t
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100")}>
                      {t === "self" ? "Para mim" : t === "customer" ? "Cliente" : t === "employee" ? "Funcionário" : "Outro número"}
                    </button>
                  ))}
                </div>

                {recipientType === "customer" && (
                  <select value={recipientId} onChange={e => setRecipientId(e.target.value)} required
                    className="w-full mt-2 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200">
                    <option value="">Seleciona o cliente...</option>
                    {customers.filter(c => c.phone).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {recipientType === "employee" && (
                  <select value={recipientId} onChange={e => setRecipientId(e.target.value)} required
                    className="w-full mt-2 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200">
                    <option value="">Seleciona o funcionário...</option>
                    {employees.filter(e => e.phone).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                )}
                {(recipientType === "customer" || recipientType === "employee") && (customers.length === 0 && employees.length === 0) && (
                  <p className="text-xs text-amber-600 mt-1.5">Nenhum cliente/funcionário com telefone registado ainda.</p>
                )}
                {recipientType === "other" && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input value={recipientLabel} onChange={e => setRecipientLabel(e.target.value)} required
                      placeholder="Nome (ex: Milena)"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200" />
                    <input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} required
                      placeholder="Telefone com indicativo"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Data</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Hora</label>
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
                          ? "bg-amber-600 text-white border-amber-600"
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
                  className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition">
                  {editingId ? "Guardar" : "Criar lembrete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
