import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { todayStrBR } from "./date-br";

export type AppointmentRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type AppointmentStatus = "scheduled" | "done" | "cancelled";

export type Appointment = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;        // ISO UTC
  endAt?: string;         // ISO UTC, optional
  allDay: boolean;
  repeat: AppointmentRepeat;
  status: AppointmentStatus;
  source: "whatsapp" | "web";
  createdAt: string;      // ISO UTC
  // Google Meet
  meetLink?: string;
  calendarEventId?: string;
  ataGenerated?: boolean;
  ataContent?: string;
  ataNotifiedAt?: string;
  reminderSentAt?: string;
};

type Row = {
  id: string; user_id: string; title: string; description: string | null; location: string | null;
  start_at: string; end_at: string | null; all_day: boolean; repeat: AppointmentRepeat;
  status: AppointmentStatus; source: "whatsapp" | "web"; created_at: string;
  meet_link: string | null; calendar_event_id: string | null; ata_generated: boolean;
  ata_content: string | null; ata_notified_at: string | null; reminder_sent_at: string | null;
};

function fromRow(r: Row): Appointment {
  return {
    id: r.id, userId: r.user_id, title: r.title, description: r.description ?? undefined,
    location: r.location ?? undefined, startAt: r.start_at, endAt: r.end_at ?? undefined,
    allDay: r.all_day, repeat: r.repeat, status: r.status, source: r.source, createdAt: r.created_at,
    meetLink: r.meet_link ?? undefined, calendarEventId: r.calendar_event_id ?? undefined,
    ataGenerated: r.ata_generated, ataContent: r.ata_content ?? undefined,
    ataNotifiedAt: r.ata_notified_at ?? undefined, reminderSentAt: r.reminder_sent_at ?? undefined,
  };
}

function toRowPatch(patch: Partial<Omit<Appointment, "id" | "userId" | "createdAt">>): Record<string, unknown> {
  const map: Record<string, string> = {
    title: "title", description: "description", location: "location", startAt: "start_at",
    endAt: "end_at", allDay: "all_day", repeat: "repeat", status: "status", source: "source",
    meetLink: "meet_link", calendarEventId: "calendar_event_id", ataGenerated: "ata_generated",
    ataContent: "ata_content", ataNotifiedAt: "ata_notified_at", reminderSentAt: "reminder_sent_at",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const col = map[key];
    if (col) out[col] = value;
  }
  return out;
}

export async function createAppointment(data: Omit<Appointment, "id" | "createdAt">): Promise<Appointment> {
  const row = {
    id: randomUUID(), user_id: data.userId, title: data.title, description: data.description,
    location: data.location, start_at: data.startAt, end_at: data.endAt, all_day: data.allDay,
    repeat: data.repeat, status: data.status, source: data.source, meet_link: data.meetLink,
    calendar_event_id: data.calendarEventId, ata_generated: data.ataGenerated ?? false,
    ata_content: data.ataContent, ata_notified_at: data.ataNotifiedAt, reminder_sent_at: data.reminderSentAt,
  };
  const { data: inserted, error } = await getSupabase().from("appointments").insert(row).select("*").single();
  if (error) throw new Error(`[agenda] createAppointment falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getAppointments(userId: string): Promise<Appointment[]> {
  const { data, error } = await getSupabase().from("appointments").select("*").eq("user_id", userId).neq("status", "cancelled");
  if (error) { console.error("[agenda] getAppointments erro:", error.message); return []; }
  return (data as Row[]).map(fromRow).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function getAppointmentById(id: string, userId: string): Promise<Appointment | null> {
  const { data, error } = await getSupabase().from("appointments").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function updateAppointment(
  id: string,
  userId: string,
  patch: Partial<Omit<Appointment, "id" | "userId" | "createdAt">>
): Promise<Appointment | null> {
  const { data, error } = await getSupabase().from("appointments").update(toRowPatch(patch)).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function deleteAppointment(id: string, userId: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("appointments").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
}

/** Retorna TODOS os compromissos agendados cujo título/descrição/local bate
 *  com a palavra-chave — call-sites (reagendar/cancelar/concluir/add_meet)
 *  precisam saber quando há mais de um candidato (ex: duas "reunião" na
 *  mesma semana) pra desambiguar com o usuário, em vez de agir na primeira
 *  que aparecer (mesma classe de bug corrigida em findGoalsByTitle). */
export async function findAppointmentsByKeyword(userId: string, keyword: string): Promise<Appointment[]> {
  const lower = keyword.toLowerCase();
  const { data, error } = await getSupabase().from("appointments").select("*").eq("user_id", userId).eq("status", "scheduled");
  if (error || !data) return [];
  return (data as Row[]).map(fromRow)
    .filter(a =>
      a.title.toLowerCase().includes(lower) ||
      a.description?.toLowerCase().includes(lower) ||
      a.location?.toLowerCase().includes(lower)
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function findAppointmentByKeyword(userId: string, keyword: string): Promise<Appointment | null> {
  return (await findAppointmentsByKeyword(userId, keyword))[0] ?? null;
}

/** Compromissos com Google Meet encerrados há 5-60 min sem ata ainda gerada
 *  — varre TODOS os usuários (usado pelo cron), não só um. */
export async function getAppointmentsWithEndedMeet(): Promise<Appointment[]> {
  const now = Date.now();
  const min5 = 5 * 60_000;
  const min60 = 60 * 60_000;
  const { data, error } = await getSupabase().from("appointments").select("*").eq("status", "scheduled").eq("ata_generated", false).is("ata_notified_at", null).not("meet_link", "is", null).not("end_at", "is", null);
  if (error || !data) return [];
  return (data as Row[]).map(fromRow).filter(a => {
    if (!a.endAt) return false;
    const endMs = new Date(a.endAt).getTime();
    return endMs < now - min5 && endMs > now - min60;
  });
}

/** Compromissos agendados que começam em até 2h e ainda não receberam o
 *  lembrete — varre TODOS os usuários (usado pelo cron). */
export async function getAppointmentsNeedingReminder(): Promise<Appointment[]> {
  const now = Date.now();
  const hours2 = 2 * 60 * 60_000;
  const { data, error } = await getSupabase().from("appointments").select("*").eq("status", "scheduled").is("reminder_sent_at", null);
  if (error || !data) return [];
  return (data as Row[]).map(fromRow).filter(a => {
    const startMs = new Date(a.startAt).getTime();
    const diff = startMs - now;
    return diff > 0 && diff <= hours2;
  });
}

export async function getUpcomingAppointments(userId: string, days: number = 7): Promise<Appointment[]> {
  const todaySP = todayStrBR();
  const startOfTodayUTC = new Date(todaySP + "T00:00:00-03:00");
  const cutoff = new Date(startOfTodayUTC);
  cutoff.setDate(cutoff.getDate() + days);

  const { data, error } = await getSupabase()
    .from("appointments").select("*").eq("user_id", userId).eq("status", "scheduled")
    .gte("start_at", startOfTodayUTC.toISOString()).lt("start_at", cutoff.toISOString());
  if (error || !data) return [];
  return (data as Row[]).map(fromRow).sort((a, b) => a.startAt.localeCompare(b.startAt));
}
