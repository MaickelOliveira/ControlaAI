"use client";
import PageTitle from "@/components/PageTitle";
import { useState, useMemo } from "react";
import {useGoogleAgenda} from "@/components/useGoogleAgenda";
import GoogleAgendaSyncStatus from "@/components/GoogleAgendaSyncStatus";
import {safeGoogleMeetHref,type GoogleAgendaAppointment} from "@/lib/google-agenda-client-contract";

type AppointmentRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

type Appointment = GoogleAgendaAppointment;

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
  withMeet: boolean;
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
    allDay: false, repeat: "none", withMeet: false,
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
  // Se meetLink está salvo, limpa o link da descrição (pode ter sido colocado como texto)
  const cleanDesc = a.meetLink
    ? (a.description || "").replace(/^Meet:\s*https?:\/\/meet\.google\.com\/\S*/im, "").trim()
    : (a.description || "");
  return {
    title: a.title, description: cleanDesc, location: a.location || "",
    startDate: sd, startTime: st ? st.slice(0, 5) : "",
    endDate: ed, endTime: et ? et.slice(0, 5) : "",
    allDay: a.allDay, repeat: a.repeat, withMeet: false,
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

  const {state:agenda,controller}=useGoogleAgenda();
  const appointments=agenda.appointments,loading=agenda.loading,saving=agenda.busy,googleConnected=agenda.googleConnected;
  const [formIntent,setFormIntent]=useState<string|null>(null);
  const [formError,setFormError]=useState(false);
  const [view, setView] = useState<ViewMode>("month");
  const [curYear, setCurYear] = useState(year);
  const [curMonth, setCurMonth] = useState(month);
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const editingDisplay=editing?appointments.find(row=>row.id===editing.id)??editing:null;
  const [form, setForm] = useState<FormState>(emptyForm());

  function openNew(date?: string) {
    if(!agenda.target||agenda.loading||agenda.busy)return;
    setFormIntent(controller.newIntent());setFormError(false);controller.clearError();
    setEditing(null);
    setForm(emptyForm(date));
    setShowModal(true);
  }

  function openEdit(a: Appointment) {
    if(agenda.busy)return;
    setFormIntent(controller.newIntent());setFormError(false);controller.clearError();
    setEditing(a);
    setForm(aptToForm(a));
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.startDate || !formIntent || saving) return;
    setFormError(false);
    try {
      const startAt = new Date(`${form.startDate}T${form.startTime || "00:00"}:00-03:00`).toISOString();
      const endAt = form.endDate ? new Date(`${form.endDate}T${form.endTime || "00:00"}:00-03:00`).toISOString() : undefined;
      const body = {title:form.title.trim(),description:form.description.trim()||undefined,location:form.location.trim()||undefined,startAt,endAt,allDay:form.allDay,repeat:form.repeat,withMeet:!editing&&form.withMeet&&!!endAt};
      const confirmed=editing?await controller.patch(formIntent,editing,body):await controller.create(formIntent,body);
      if(confirmed){setShowModal(false);setEditing(null);setFormIntent(null);}
    } catch {setFormError(true);}
  }
  async function handleDone(id:string){const record=appointments.find(row=>row.id===id);if(record)await controller.done(record);}
  async function handleDelete(id:string){
    const record=appointments.find(row=>row.id===id);if(!record||saving||!confirm("Excluir este compromisso?"))return;
    await controller.remove(record);
  }
  async function handleRetry(id:string){const record=appointments.find(row=>row.id===id);if(record)await controller.retry(record);}

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
    <div className="z-page">
      {/* Header */}
      <div className="z-page-heading flex items-center justify-between gap-3 flex-wrap">
        <div>
          <PageTitle icon="calendar">Agenda</PageTitle>
          <p className="text-subtle text-sm mt-0.5">
            {totalScheduled} compromisso{totalScheduled !== 1 ? "s" : ""} agendado{totalScheduled !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle view */}
          <div className="flex bg-surface-muted rounded-xl p-1 text-xs font-medium">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 rounded-lg transition ${view === "month" ? "bg-surface shadow-sm text-ink" : "text-muted hover:text-ink"}`}>
              Mês
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded-lg transition ${view === "list" ? "bg-surface shadow-sm text-ink" : "text-muted hover:text-ink"}`}>
              Lista
            </button>
          </div>
          <button
            disabled={saving||loading||!agenda.target}
            onClick={() => openNew(selectedDay || today)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary transition">
            <span className="text-base leading-none">+</span> Novo
          </button>
        </div>
      </div>

      {(agenda.errorCode||formError||!agenda.target)&&<p className="mb-3 text-sm text-red-ink" role="alert">{agenda.target?"Os dados mudaram ou não foi possível confirmar o pedido. Reabra o formulário para alterá-lo, ou tente novamente o mesmo pedido.":"Este espaço não está disponível. Atualize a página."}</p>}

      {view === "month" ? (
        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
          {/* Navegação */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-muted transition text-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-base font-bold text-ink w-44 text-center">
                {MONTH_NAMES[curMonth - 1]} {curYear}
              </h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-surface-muted transition text-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <button onClick={goToday} className="text-xs text-blue-ink border border-line rounded-lg px-3 py-1.5 hover:bg-blue-soft transition font-medium">
              Hoje
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7">
            {/* Cabeçalho dias da semana */}
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold text-subtle uppercase tracking-wide border-b border-line">
                {d}
              </div>
            ))}

            {/* Células dos dias */}
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={`empty-${i}`} className="min-h-[100px] bg-surface-muted/50 border-b border-r border-line last:border-r-0" />;
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
                  className={`min-h-[100px] p-1.5 border-b border-r border-line last:border-r-0 cursor-pointer transition-colors
                    ${isSelected ? "bg-blue-soft" : "hover:bg-surface-muted"}
                    ${(isSun || isSat) ? "bg-surface-muted/60" : ""}`}>
                  {/* Número do dia */}
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full transition
                      ${isToday ? "bg-blue-600 text-white" : isSelected ? "text-blue-ink" : (isSun || isSat) ? "text-subtle" : "text-ink"}`}>
                      {dayNum}
                    </span>
                    {events.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); openNew(cell); }}
                        className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-subtle hover:text-blue-500 text-lg leading-none transition">
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
                      <div className="text-[10px] text-muted font-medium pl-1">
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
            <div className="border-t border-line px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-ink">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long", day: "2-digit", month: "long",
                  })}
                  {selectedDay === today && (
                    <span className="ml-2 text-[10px] bg-blue-soft text-blue-ink rounded-full px-2 py-0.5 font-bold uppercase">Hoje</span>
                  )}
                </p>
                <button
                  onClick={() => openNew(selectedDay)}
                  className="text-xs text-blue-ink hover:underline font-medium">
                  + Adicionar
                </button>
              </div>

              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-subtle py-2">Nenhum compromisso neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(evt => (
                    <DayEventRow
                      key={evt.id}
                      evt={evt}
                      onEdit={openEdit}
                      onDone={handleDone}
                      onDelete={handleDelete}
          onRetry={handleRetry} busy={saving||loading}
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
          onRetry={handleRetry} busy={saving||loading}
          loading={loading}
        />
      )}

      {appointments.some(row=>row.googleCancellationPending)&&<section className="mb-4 rounded-xl border border-line bg-surface p-4"><h2 className="text-sm font-semibold text-ink">Cancelamentos aguardando o Google</h2>{appointments.filter(row=>row.googleCancellationPending).map(row=><div key={row.id} className="mt-3"><p className="text-sm text-ink">{row.title}</p><GoogleAgendaSyncStatus appointment={row} locale="pt-BR" onRetry={()=>void handleRetry(row.id)} busy={saving||loading}/></div>)}</section>}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md overflow-y-auto max-h-[90vh]">
            <fieldset disabled={saving} className="p-6 space-y-4">
              <h3 className="text-base font-bold text-ink">
                {editing ? "Editar compromisso" : "Novo compromisso"}
              </h3>
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Título *</label>
                <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Reunião com cliente"
                  className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Data *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Hora início</label>
                  <input type="time" value={form.startTime} disabled={form.allDay}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Data fim</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Hora fim</label>
                  <input type="time" value={form.endTime} disabled={form.allDay || !form.endDate}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40" />
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={form.allDay}
                  onChange={e => setForm(f => ({ ...f, allDay: e.target.checked, startTime: e.target.checked ? "" : f.startTime }))}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm text-ink">Dia inteiro</span>
              </label>

              {/* Toggle Google Meet — só para novos compromissos com horário fim */}
              {!editing && googleConnected && (
                <label className={`flex items-center gap-2.5 cursor-pointer select-none rounded-xl p-3 border transition
                  ${form.withMeet ? "bg-blue-soft border-line" : "bg-surface-muted border-line"}`}>
                  <input type="checkbox" checked={form.withMeet}
                    onChange={e => setForm(f => ({ ...f, withMeet: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-ink">🎥 Incluir link do Google Meet</p>
                    <p className="text-xs text-subtle">Cria um link de reunião automático no Google Calendar</p>
                    {form.withMeet && !form.endDate && (
                      <p className="text-xs text-amber-ink mt-0.5">⚠ Preencha a hora de fim para gerar o Meet</p>
                    )}
                  </div>
                </label>
              )}
              {!editing && !googleConnected && (
                <div className="flex items-center gap-2 text-xs text-subtle bg-surface-muted rounded-xl p-3 border border-line">
                  <span>🎥</span>
                  <span>Para incluir Google Meet, <a href="/dashboard/configuracoes" className="text-blue-500 underline">conecte sua conta Google</a></span>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Local</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: Sala de reunião, Zoom..."
                  className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {/* Botão Entrar no Meet — visível ao editar compromisso com meet link */}
              {safeGoogleMeetHref(editingDisplay?.meetLink) && (
                <a href={safeGoogleMeetHref(editingDisplay?.meetLink)??undefined} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary hover:bg-primary text-on-primary text-sm font-semibold transition">
                  🎥 Entrar no Google Meet
                </a>
              )}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Descrição</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Notas sobre o compromisso..."
                  rows={2}
                  className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Repetição</label>
                <select value={form.repeat} onChange={e => setForm(f => ({ ...f, repeat: e.target.value as AppointmentRepeat }))}
                  className="w-full border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-surface">
                  {(Object.entries(REPEAT_LABEL) as [AppointmentRepeat, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {editing&&<GoogleAgendaSyncStatus appointment={editingDisplay!} locale="pt-BR" onRetry={()=>void handleRetry(editing.id)} busy={saving||loading}/>}
              {(agenda.errorCode||formError)&&<p className="text-xs text-red-ink" role="alert">Os dados mudaram ou não foi possível confirmar o pedido. Reabra o formulário para alterá-lo, ou tente novamente o mesmo pedido.</p>}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => { setShowModal(false); setEditing(null); }}
                  className="px-4 py-2 text-sm text-muted hover:text-ink transition">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || loading || !form.title.trim() || !form.startDate}
                  className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary transition disabled:opacity-60">
                  {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </fieldset>
          </div>
        </div>
      )}
    </div>
  );
}

function DayEventRow({ evt, onEdit, onDone, onDelete,onRetry,busy }: {
  evt: Appointment;
  onEdit: (a: Appointment) => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id:string)=>void;
  busy:boolean;
}) {
  const color = colorForId(evt.id);
  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-muted transition cursor-pointer" onClick={() => onEdit(evt)}>
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{evt.title}</p>
        <p className="text-xs text-subtle">
          {evt.allDay ? "Dia inteiro" : formatTimeSP(evt.startAt)}
          {evt.endAt && !evt.allDay && ` – ${formatTimeSP(evt.endAt)}`}
          {evt.location && ` · 📍${evt.location}`}
        </p>
        <GoogleAgendaSyncStatus appointment={evt} locale="pt-BR" onRetry={()=>onRetry(evt.id)} busy={busy}/>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {safeGoogleMeetHref(evt.meetLink) && (
          <a href={safeGoogleMeetHref(evt.meetLink)??undefined} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-soft text-blue-ink hover:bg-blue-soft transition text-xs font-medium">
            🎥 Entrar
          </a>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button disabled={busy} onClick={() => onDone(evt.id)} title="Concluído"
            className="p-1 rounded text-subtle hover:text-amber-ink hover:bg-amber-soft transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button disabled={busy} onClick={() => onDelete(evt.id)} title="Excluir"
            className="p-1 rounded text-subtle hover:text-red-500 hover:bg-red-soft transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ListView({ appointments, today, onEdit, onDone, onDelete, loading,onRetry,busy }: {
  appointments: readonly Appointment[];
  today: string;
  onEdit: (a: Appointment) => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id:string)=>void;
  busy:boolean;
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

  if (loading) return <div className="text-center py-16 text-subtle text-sm">Carregando...</div>;
  if (grouped.length === 0) return (
    <div className="text-center py-16 bg-surface border border-dashed border-line rounded-2xl">
      <p className="text-5xl mb-4">🗓️</p>
      <p className="text-muted font-medium">Nenhum compromisso agendado</p>
      <p className="text-subtle text-sm mt-1">Clique em &quot;Novo&quot; ou envie pelo WhatsApp.</p>
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
          <div key={date} className="bg-surface rounded-2xl border border-line overflow-hidden">
            {/* Linha de data */}
            <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-line
              ${isToday ? "bg-blue-soft" : isPast ? "bg-surface-muted" : "bg-surface"}`}>
              <div className={`w-2 h-2 rounded-full ${isToday ? "bg-blue-500" : isPast ? "bg-slate-300" : "bg-slate-400"}`} />
              <p className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-blue-ink" : isPast ? "text-subtle" : "text-muted"}`}>
                {isToday ? `Hoje · ${dateLabel}` : dateLabel}
              </p>
              <span className="ml-auto text-xs text-subtle">{items.length}</span>
            </div>
            {/* Eventos do dia */}
            <div className="divide-y divide-slate-50">
              {items.map(evt => (
                <div key={evt.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition cursor-pointer" onClick={() => onEdit(evt)}>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorForId(evt.id)}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isPast ? "text-muted" : "text-ink"}`}>{evt.title}</p>
                    <p className="text-xs text-subtle">
                      {evt.allDay ? "Dia inteiro" : formatTimeSP(evt.startAt)}
                      {evt.endAt && !evt.allDay && ` – ${formatTimeSP(evt.endAt)}`}
                      {evt.location && ` · 📍${evt.location}`}
                      {evt.repeat !== "none" && ` · 🔁${REPEAT_LABEL[evt.repeat]}`}
                    </p>
                    <GoogleAgendaSyncStatus appointment={evt} locale="pt-BR" onRetry={()=>onRetry(evt.id)} busy={busy}/>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    {safeGoogleMeetHref(evt.meetLink) && (
                      <a href={safeGoogleMeetHref(evt.meetLink)??undefined} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-soft text-blue-ink hover:bg-blue-soft transition text-xs font-medium">
                        🎥 Entrar
                      </a>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button disabled={busy} onClick={() => onDone(evt.id)} title="Concluído"
                        className="p-1.5 rounded-lg text-subtle hover:text-amber-ink hover:bg-amber-soft transition">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button disabled={busy} onClick={() => onDelete(evt.id)} title="Excluir"
                        className="p-1.5 rounded-lg text-subtle hover:text-red-500 hover:bg-red-soft transition">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
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
