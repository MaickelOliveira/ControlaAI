"use client";
import { useEffect, useState, useMemo } from "react";

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

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Cores para eventos (cicla entre elas)
const EVENT_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-sky-500", "bg-indigo-500", "bg-teal-500",
];

function todaySP(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

function aptDateSP(a: Appointment): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(a.startAt));
}

function formatTimeSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

function getYearMonth(ymd: string): [number, number] {
  const [y, m] = ymd.split("-").map(Number);
  return [y, m];
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
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

const emptyForm = (defaultDate?: string): FormState => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const spNow = now.toLocaleString("sv-SE", { timeZone: TZ });
  const [date, time] = spNow.split(" ");
  return {
    title: "", description: "", location: "",
    startDate: defaultDate || date,
    startTime: time.slice(0, 5),
    endDate: "", endTime: "",
    allDay: false, repeat: "none",
  };
};

function aptToForm(a: Appointment): FormState {
  const spStart = new Date(a.startAt).toLocaleString("sv-SE", { timeZone: TZ });
  const [sd, st] = spStart.split(" ");
  let ed = "", et = "";
  if (a.endAt) {
    const spEnd = new Date(a.endAt).toLocaleString("sv-SE", { timeZone: TZ });
    [ed, et] = spEnd.split(" ");
  }
  return {
    title: a.title, description: a.description || "", location: a.location || "",
    startDate: sd, startTime: st ? st.slice(0, 5) : "",
    endDate: ed, endTime: et ? et.slice(0, 5) : "",
    allDay: a.allDay, repeat: a.repeat,
  };
}

// Mapeia appointment.id → cor fixa
function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}

type ViewMode = "month" | "list";

export default function AgendaPage() {
  const today = todaySP();
  const [year, month] = getYearMonth(today);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("month");
  const [curYear, setCurYear] = useState(year);
  const [curMonth, setCurMonth] = useState(month);
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
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

  function openNew(date?: string) {
    setEditing(null);
    setForm(emptyForm(date));
    setShowModal(true);
  }

  function openEdit(a: Appointment) {
    setEditing(a);
    setForm(aptToForm(a));
    setShowModal(true);
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
        startAt, endAt, allDay: form.allDay, repeat: form.repeat,
      };
      if (editing) {
        const res = await fetch(`/api/agenda/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = await res.json();
          setAppointments(prev => prev.map(a => a.id === editing.id ? updated : a));
        }
      } else {
        const res = await fetch("/api/agenda", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (res.ok) {
          const created = await res.json();
          setAppointments(prev => [...prev, created].sort((a, b) => a.startAt.localeCompare(b.startAt)));
        }
      }
      setShowModal(false); setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDone(id: string) {
    const res = await fetch(`/api/agenda/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    if (res.ok) setAppointments(prev => prev.filter(a => a.id !== id));
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este compromisso?")) return;
    const res = await fetch(`/api/agenda/${id}`, { method: "DELETE" });
    if (res.ok) setAppointments(prev => prev.filter(a => a.id !== id));
  }

  function prevMonth() {
    if (curMonth === 1) { setCurYear(y => y - 1); setCurMonth(12); }
    else setCurMonth(m => m - 1);
  }
  function nextMonth() {
    if (curMonth === 12) { setCurYear(y => y + 1); setCurMonth(1); }
    else setCurMonth(m => m + 1);
  }
  function goToday() {
    setCurYear(year); setCurMonth(month); setSelectedDay(today);
  }

  // Agrupar appointments por data SP
  const byDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      if (a.status !== "scheduled") continue;
      const d = aptDateSP(a);
      if (!map[d]) map[d] = [];
      map[d].push(a);
    }
    return map;
  }, [appointments]);

  // Células do calendário
  const firstDow = firstWeekday(curYear, curMonth);
  const daysCount = daysInMonth(curYear, curMonth);
  const cells: Array<string | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysCount }, (_, i) => {
      const d = i + 1;
      return `${curYear}-${String(curMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];
  // Preencher para múltiplos de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDayEvents = selectedDay ? (byDate[selectedDay] || []) : [];
  const totalScheduled = appointments.filter(a => a.status === "scheduled").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🗓️ Agenda</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {totalScheduled} compromisso{totalScheduled !== 1 ? "s" : ""} agendado{totalScheduled !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle view */}
          <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-medium">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 rounded-lg transition ${view === "month" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
              Mês
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded-lg transition ${view === "list" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
              Lista
            </button>
          </div>
          <button
            onClick={() => openNew(selectedDay || today)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition">
            <span className="text-base leading-none">+</span> Novo
          </button>
        </div>
      </div>

      {view === "month" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Navegação */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-base font-bold text-slate-900 w-44 text-center">
                {MONTH_NAMES[curMonth - 1]} {curYear}
              </h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <button onClick={goToday} className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition font-medium">
              Hoje
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7">
            {/* Cabeçalho dias da semana */}
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                {d}
              </div>
            ))}

            {/* Células dos dias */}
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={`empty-${i}`} className="min-h-[100px] bg-slate-50/50 border-b border-r border-slate-100 last:border-r-0" />;
              }
              const isToday = cell === today;
              const isSelected = cell === selectedDay;
              const dayNum = parseInt(cell.split("-")[2]);
              const events = byDate[cell] || [];
              const isSun = i % 7 === 0;
              const isSat = i % 7 === 6;

              return (
                <div
                  key={cell}
                  onClick={() => setSelectedDay(cell)}
                  className={`min-h-[100px] p-1.5 border-b border-r border-slate-100 last:border-r-0 cursor-pointer transition-colors
                    ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}
                    ${(isSun || isSat) ? "bg-slate-50/60" : ""}`}>
                  {/* Número do dia */}
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full transition
                      ${isToday ? "bg-blue-600 text-white" : isSelected ? "text-blue-700" : (isSun || isSat) ? "text-slate-400" : "text-slate-700"}`}>
                      {dayNum}
                    </span>
                    {events.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); openNew(cell); }}
                        className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-slate-300 hover:text-blue-500 text-lg leading-none transition">
                        +
                      </button>
                    )}
                  </div>

                  {/* Eventos */}
                  <div className="space-y-0.5">
                    {events.slice(0, 3).map(evt => (
                      <div
                        key={evt.id}
                        onClick={e => { e.stopPropagation(); setSelectedDay(cell); openEdit(evt); }}
                        className={`${colorForId(evt.id)} text-white text-[10px] font-medium px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition`}>
                        {!evt.allDay && <span className="opacity-80">{formatTimeSP(evt.startAt)} </span>}
                        {evt.title}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <div className="text-[10px] text-slate-500 font-medium pl-1">
                        +{events.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Painel do dia selecionado */}
          {selectedDay && (
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-800">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long", day: "2-digit", month: "long",
                  })}
                  {selectedDay === today && (
                    <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-bold uppercase">Hoje</span>
                  )}
                </p>
                <button
                  onClick={() => openNew(selectedDay)}
                  className="text-xs text-blue-600 hover:underline font-medium">
                  + Adicionar
                </button>
              </div>

              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">Nenhum compromisso neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(evt => (
                    <DayEventRow
                      key={evt.id}
                      evt={evt}
                      onEdit={openEdit}
                      onDone={handleDone}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Vista Lista ── */
        <ListView
          appointments={appointments}
          today={today}
          onEdit={openEdit}
          onDone={handleDone}
          onDelete={handleDelete}
          onNew={openNew}
          loading={loading}
        />
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto max-h-[90vh]">
            <div className="p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? "Editar compromisso" : "Novo compromisso"}
              </h3>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Título *</label>
                <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Reunião com cliente"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Data *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Hora início</label>
                  <input type="time" value={form.startTime} disabled={form.allDay}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Data fim</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Hora fim</label>
                  <input type="time" value={form.endTime} disabled={form.allDay || !form.endDate}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40" />
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={form.allDay}
                  onChange={e => setForm(f => ({ ...f, allDay: e.target.checked, startTime: e.target.checked ? "" : f.startTime }))}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm text-slate-700">Dia inteiro</span>
              </label>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Local</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: Sala de reunião, Zoom..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Descrição</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Notas sobre o compromisso..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Repetição</label>
                <select value={form.repeat} onChange={e => setForm(f => ({ ...f, repeat: e.target.value as AppointmentRepeat }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  {(Object.entries(REPEAT_LABEL) as [AppointmentRepeat, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => { setShowModal(false); setEditing(null); }}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 transition">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.startDate}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60">
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

function DayEventRow({ evt, onEdit, onDone, onDelete }: {
  evt: Appointment;
  onEdit: (a: Appointment) => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const color = colorForId(evt.id);
  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition cursor-pointer" onClick={() => onEdit(evt)}>
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{evt.title}</p>
        <p className="text-xs text-slate-400">
          {evt.allDay ? "Dia inteiro" : formatTimeSP(evt.startAt)}
          {evt.endAt && !evt.allDay && ` – ${formatTimeSP(evt.endAt)}`}
          {evt.location && ` · 📍${evt.location}`}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
        <button onClick={() => onDone(evt.id)} title="Concluído"
          className="p-1 rounded text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button onClick={() => onDelete(evt.id)} title="Excluir"
          className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ListView({ appointments, today, onEdit, onDone, onDelete, onNew, loading }: {
  appointments: Appointment[];
  today: string;
  onEdit: (a: Appointment) => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: (date?: string) => void;
  loading: boolean;
}) {
  const scheduled = appointments.filter(a => a.status === "scheduled");

  const grouped = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of scheduled) {
      const d = aptDateSP(a);
      if (!map[d]) map[d] = [];
      map[d].push(a);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [scheduled]);

  if (loading) return <div className="text-center py-16 text-slate-400 text-sm">Carregando...</div>;
  if (grouped.length === 0) return (
    <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl">
      <p className="text-5xl mb-4">🗓️</p>
      <p className="text-slate-600 font-medium">Nenhum compromisso agendado</p>
      <p className="text-slate-400 text-sm mt-1">Clique em "Novo" ou envie pelo WhatsApp.</p>
    </div>
  );

  return (
    <div className="space-y-1">
      {grouped.map(([date, items]) => {
        const isToday = date === today;
        const isPast = date < today;
        const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
          weekday: "short", day: "2-digit", month: "short",
        });
        return (
          <div key={date} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {/* Linha de data */}
            <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-100
              ${isToday ? "bg-blue-50" : isPast ? "bg-slate-50" : "bg-white"}`}>
              <div className={`w-2 h-2 rounded-full ${isToday ? "bg-blue-500" : isPast ? "bg-slate-300" : "bg-slate-400"}`} />
              <p className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-blue-700" : isPast ? "text-slate-400" : "text-slate-600"}`}>
                {isToday ? `Hoje · ${dateLabel}` : dateLabel}
              </p>
              <span className="ml-auto text-xs text-slate-300">{items.length}</span>
            </div>
            {/* Eventos do dia */}
            <div className="divide-y divide-slate-50">
              {items.map(evt => (
                <div key={evt.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition cursor-pointer" onClick={() => onEdit(evt)}>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorForId(evt.id)}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isPast ? "text-slate-500" : "text-slate-800"}`}>{evt.title}</p>
                    <p className="text-xs text-slate-400">
                      {evt.allDay ? "Dia inteiro" : formatTimeSP(evt.startAt)}
                      {evt.endAt && !evt.allDay && ` – ${formatTimeSP(evt.endAt)}`}
                      {evt.location && ` · 📍${evt.location}`}
                      {evt.repeat !== "none" && ` · 🔁${REPEAT_LABEL[evt.repeat]}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onDone(evt.id)} title="Concluído"
                      className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button onClick={() => onDelete(evt.id)} title="Excluir"
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
