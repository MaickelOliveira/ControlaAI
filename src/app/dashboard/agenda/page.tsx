"use client";
import { useEffect, useState } from "react";

type AppointmentRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";
type AppointmentStatus = "scheduled" | "done" | "cancelled";

type Appointment = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  repeat: AppointmentRepeat;
  status: AppointmentStatus;
  source: string;
  createdAt: string;
};

const TZ = "America/Sao_Paulo";

const REPEAT_LABEL: Record<AppointmentRepeat, string> = {
  none: "Sem repetição",
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

function todaySP(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function aptDateSP(a: Appointment): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(a.startAt));
}

function formatTimeSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

function formatDateTimeSP(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDayHeader(ymd: string): string {
  const d = new Date(ymd + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

type FormState = {
  title: string;
  description: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  repeat: AppointmentRepeat;
};

const emptyForm = (): FormState => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const spNow = now.toLocaleString("sv-SE", { timeZone: TZ });
  const [date, time] = spNow.split(" ");
  return { title: "", description: "", location: "", startDate: date, startTime: time.slice(0, 5), endDate: "", endTime: "", allDay: false, repeat: "none" };
};

function aptToForm(a: Appointment): FormState {
  const spStart = a.startAt
    ? new Date(a.startAt).toLocaleString("sv-SE", { timeZone: TZ })
    : "";
  const [sd, st] = spStart ? spStart.split(" ") : ["", ""];
  let ed = "", et = "";
  if (a.endAt) {
    const spEnd = new Date(a.endAt).toLocaleString("sv-SE", { timeZone: TZ });
    [ed, et] = spEnd.split(" ");
  }
  return {
    title: a.title,
    description: a.description || "",
    location: a.location || "",
    startDate: sd,
    startTime: st ? st.slice(0, 5) : "",
    endDate: ed,
    endTime: et ? et.slice(0, 5) : "",
    allDay: a.allDay,
    repeat: a.repeat,
  };
}

type Group = { label: string; color: string; items: Appointment[] };

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/agenda");
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(a: Appointment) {
    setEditing(a);
    setForm(aptToForm(a));
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.startDate) return;
    setSaving(true);
    try {
      const startAt = new Date(`${form.startDate}T${form.startTime || "00:00"}:00-03:00`).toISOString();
      const endAt = form.endDate
        ? new Date(`${form.endDate}T${form.endTime || "00:00"}:00-03:00`).toISOString()
        : undefined;
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startAt,
        endAt,
        allDay: form.allDay,
        repeat: form.repeat,
      };

      if (editing) {
        const res = await fetch(`/api/agenda/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = await res.json();
          setAppointments(prev => prev.map(a => a.id === editing.id ? updated : a));
        }
      } else {
        const res = await fetch("/api/agenda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const created = await res.json();
          setAppointments(prev => [...prev, created].sort((a, b) => a.startAt.localeCompare(b.startAt)));
        }
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleDone(id: string) {
    const res = await fetch(`/api/agenda/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    if (res.ok) setAppointments(prev => prev.filter(a => a.id !== id));
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este compromisso?")) return;
    const res = await fetch(`/api/agenda/${id}`, { method: "DELETE" });
    if (res.ok) setAppointments(prev => prev.filter(a => a.id !== id));
  }

  // Agrupar compromissos por "Atrasados / Hoje / Amanhã / Esta semana / Futuros"
  const today = todaySP();
  const tomorrow = addDays(today, 1);
  const inSevenDays = addDays(today, 7);

  const nowISO = new Date().toISOString();

  const overdue = appointments.filter(a => a.status === "scheduled" && a.startAt < nowISO && aptDateSP(a) < today);
  const todayItems = appointments.filter(a => a.status === "scheduled" && aptDateSP(a) === today);
  const tomorrowItems = appointments.filter(a => a.status === "scheduled" && aptDateSP(a) === tomorrow);
  const weekItems = appointments.filter(a => {
    const d = aptDateSP(a);
    return a.status === "scheduled" && d > tomorrow && d <= inSevenDays;
  });
  const laterItems = appointments.filter(a => a.status === "scheduled" && aptDateSP(a) > inSevenDays);

  const groups: Group[] = [
    { label: "⚠️ Atrasados", color: "red", items: overdue },
    { label: `📅 Hoje — ${new Date(today + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}`, color: "emerald", items: todayItems },
    { label: `📅 Amanhã — ${formatDayHeader(tomorrow)}`, color: "sky", items: tomorrowItems },
    { label: "📅 Esta semana", color: "violet", items: weekItems },
    { label: "🗓️ Futuros", color: "slate", items: laterItems },
  ].filter(g => g.items.length > 0);

  const totalScheduled = appointments.filter(a => a.status === "scheduled").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🗓️ Agenda</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {totalScheduled} compromisso{totalScheduled !== 1 ? "s" : ""} agendado{totalScheduled !== 1 ? "s" : ""}
            {" · "}{new Date().toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Novo compromisso
        </button>
      </div>

      {/* WhatsApp hint */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
        <span className="text-2xl shrink-0">💡</span>
        <div className="text-sm text-emerald-800">
          <p className="font-semibold">Controle sua agenda pelo WhatsApp!</p>
          <p className="text-emerald-700 mt-0.5">
            <em>"Agendar reunião amanhã às 14h"</em> · <em>"Meus compromissos de hoje"</em> · <em>"Cancelar o almoço de sexta"</em>
          </p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Carregando...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl">
          <p className="text-5xl mb-4">🗓️</p>
          <p className="text-slate-600 font-medium">Nenhum compromisso agendado</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo compromisso" ou envie pelo WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-3">
                <p className={`text-xs font-bold uppercase tracking-wide ${
                  group.color === "red" ? "text-red-500" :
                  group.color === "emerald" ? "text-emerald-600" :
                  group.color === "sky" ? "text-sky-600" :
                  group.color === "violet" ? "text-violet-600" :
                  "text-slate-500"
                }`}>
                  {group.label}
                </p>
                <div className={`flex-1 h-px ${
                  group.color === "red" ? "bg-red-100" :
                  group.color === "emerald" ? "bg-emerald-100" :
                  group.color === "sky" ? "bg-sky-100" :
                  group.color === "violet" ? "bg-violet-100" :
                  "bg-slate-100"
                }`} />
                <span className="text-xs text-slate-400 font-medium">{group.items.length}</span>
              </div>

              <div className="space-y-2">
                {group.items.map(apt => (
                  <AppointmentCard
                    key={apt.id}
                    apt={apt}
                    color={group.color}
                    onDone={handleDone}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    showFullDate={group.label !== groups.find(g => g.color === "emerald")?.label}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto max-h-[90vh]">
            <div className="p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? "Editar compromisso" : "Novo compromisso"}
              </h3>

              {/* Título */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Título *</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Reunião com cliente"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Data e hora início */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Data *</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Hora início</label>
                  <input
                    type="time"
                    value={form.startTime}
                    disabled={form.allDay}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Data e hora fim (opcional) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Data fim</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Hora fim</label>
                  <input
                    type="time"
                    value={form.endTime}
                    disabled={form.allDay || !form.endDate}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Dia inteiro */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={e => setForm(f => ({ ...f, allDay: e.target.checked, startTime: e.target.checked ? "" : f.startTime }))}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
                <span className="text-sm text-slate-700">Dia inteiro</span>
              </label>

              {/* Local */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Local</label>
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: Sala de reunião, Zoom..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Notas sobre o compromisso..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                />
              </div>

              {/* Repetição */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Repetição</label>
                <select
                  value={form.repeat}
                  onChange={e => setForm(f => ({ ...f, repeat: e.target.value as AppointmentRepeat }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                >
                  {(Object.entries(REPEAT_LABEL) as [AppointmentRepeat, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Botões */}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 transition">
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.startDate}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentCard({
  apt, color, onDone, onEdit, onDelete, showFullDate,
}: {
  apt: Appointment;
  color: string;
  onDone: (id: string) => void;
  onEdit: (a: Appointment) => void;
  onDelete: (id: string) => void;
  showFullDate: boolean;
}) {
  const timeStr = apt.allDay ? "Dia inteiro" : formatTimeSP(apt.startAt);
  const endTimeStr = apt.endAt && !apt.allDay ? ` – ${formatTimeSP(apt.endAt)}` : "";
  const fullDateStr = showFullDate ? formatDateTimeSP(apt.startAt) : timeStr + endTimeStr;

  const borderColor =
    color === "red" ? "border-red-200 bg-red-50/50" :
    color === "emerald" ? "border-emerald-200 bg-emerald-50/30" :
    color === "sky" ? "border-sky-200 bg-sky-50/30" :
    color === "violet" ? "border-violet-200 bg-violet-50/30" :
    "border-slate-200 bg-white";

  const timeColor =
    color === "red" ? "text-red-600" :
    color === "emerald" ? "text-emerald-700" :
    color === "sky" ? "text-sky-700" :
    color === "violet" ? "text-violet-700" :
    "text-slate-500";

  const repeatInfo = apt.repeat !== "none" ? `🔁 ${REPEAT_LABEL[apt.repeat]}` : null;

  return (
    <div className={`group flex items-start gap-4 p-4 rounded-xl border ${borderColor} transition hover:shadow-sm`}>
      {/* Time indicator */}
      <div className="shrink-0 text-right min-w-[3.5rem]">
        <p className={`text-sm font-bold ${timeColor}`}>{apt.allDay ? "Dia" : formatTimeSP(apt.startAt)}</p>
        {apt.endAt && !apt.allDay && (
          <p className="text-xs text-slate-400">{formatTimeSP(apt.endAt)}</p>
        )}
      </div>

      {/* Divider */}
      <div className={`w-px self-stretch rounded-full ${
        color === "red" ? "bg-red-300" :
        color === "emerald" ? "bg-emerald-300" :
        color === "sky" ? "bg-sky-300" :
        color === "violet" ? "bg-violet-300" :
        "bg-slate-200"
      }`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{apt.title}</p>
        {showFullDate && (
          <p className="text-xs text-slate-500 mt-0.5">{fullDateStr}</p>
        )}
        {apt.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{apt.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {apt.location && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <span>📍</span>{apt.location}
            </span>
          )}
          {repeatInfo && (
            <span className="text-xs text-slate-400">{repeatInfo}</span>
          )}
          {apt.source === "whatsapp" && (
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-1.5 py-0.5">WhatsApp</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={() => onDone(apt.id)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
          title="Marcar como feito"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          onClick={() => onEdit(apt)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          title="Editar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(apt.id)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
          title="Excluir"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
