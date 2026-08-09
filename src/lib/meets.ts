import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type MeetAttendee = { name: string; phone?: string; email?: string };

export type MeetStatus = "scheduled" | "ended" | "cancelled";

export type Meet = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  startAt: string;          // ISO UTC
  endAt: string;            // ISO UTC
  meetLink: string;
  calendarEventId: string;
  attendees: MeetAttendee[];
  ataGenerated: boolean;
  ataContent?: string;
  ataNotifiedAt?: string;
  status: MeetStatus;
  source: "whatsapp" | "web";
  createdAt: string;
};

type Row = {
  id: string; user_id: string; title: string; description: string | null; start_at: string; end_at: string;
  meet_link: string; calendar_event_id: string; attendees: MeetAttendee[]; ata_generated: boolean;
  ata_content: string | null; ata_notified_at: string | null; status: MeetStatus; source: "whatsapp" | "web"; created_at: string;
};

function fromRow(r: Row): Meet {
  return {
    id: r.id, userId: r.user_id, title: r.title, description: r.description ?? undefined,
    startAt: r.start_at, endAt: r.end_at, meetLink: r.meet_link, calendarEventId: r.calendar_event_id,
    attendees: r.attendees, ataGenerated: r.ata_generated, ataContent: r.ata_content ?? undefined,
    ataNotifiedAt: r.ata_notified_at ?? undefined, status: r.status, source: r.source, createdAt: r.created_at,
  };
}

function toRowPatch(patch: Partial<Omit<Meet, "id" | "userId" | "createdAt">>): Record<string, unknown> {
  const map: Record<string, string> = {
    title: "title", description: "description", startAt: "start_at", endAt: "end_at",
    meetLink: "meet_link", calendarEventId: "calendar_event_id", attendees: "attendees",
    ataGenerated: "ata_generated", ataContent: "ata_content", ataNotifiedAt: "ata_notified_at",
    status: "status", source: "source",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const col = map[key];
    if (col) out[col] = value;
  }
  return out;
}

export async function createMeet(data: Omit<Meet, "id" | "createdAt">): Promise<Meet> {
  const row = {
    id: randomUUID(), user_id: data.userId, title: data.title, description: data.description,
    start_at: data.startAt, end_at: data.endAt, meet_link: data.meetLink, calendar_event_id: data.calendarEventId,
    attendees: data.attendees, ata_generated: data.ataGenerated, ata_content: data.ataContent,
    ata_notified_at: data.ataNotifiedAt, status: data.status, source: data.source,
  };
  const { data: inserted, error } = await getSupabase().from("meets").insert(row).select("*").single();
  if (error) throw new Error(`[meets] createMeet falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getMeetsByUser(userId: string): Promise<Meet[]> {
  const { data, error } = await getSupabase().from("meets").select("*").eq("user_id", userId).neq("status", "cancelled");
  if (error) { console.error("[meets] getMeetsByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function getMeetById(id: string, userId: string): Promise<Meet | null> {
  const { data, error } = await getSupabase().from("meets").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function updateMeet(id: string, userId: string, patch: Partial<Omit<Meet, "id" | "userId" | "createdAt">>): Promise<Meet | null> {
  const { data, error } = await getSupabase().from("meets").update(toRowPatch(patch)).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function deleteMeet(id: string, userId: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("meets").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
}

// Retorna meets que encerraram há 5-60 min, sem ata, sem notificação enviada
// — varre TODOS os usuários (usado pelo cron).
export async function getMeetsEndedWithoutAta(): Promise<Meet[]> {
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60_000;
  const sixtyMinAgo = now - 60 * 60_000;

  const { data, error } = await getSupabase().from("meets").select("*").eq("status", "scheduled").eq("ata_generated", false).is("ata_notified_at", null);
  if (error || !data) return [];
  return (data as Row[]).map(fromRow).filter(m => {
    const endMs = new Date(m.endAt).getTime();
    return endMs <= fiveMinAgo && endMs >= sixtyMinAgo;
  });
}
