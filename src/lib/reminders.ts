import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type ReminderRepeat = "none" | "daily" | "weekly" | "monthly";
export type ReminderRecipientType = "self" | "customer" | "employee" | "other";

// Depois de MAX_FAILED_ATTEMPTS tentativas seguidas sem sucesso (ex: número
// inválido, WhatsApp fora do ar por horas), getDueReminders() para de
// devolver o lembrete — sem isso, ele ficava tentando de novo a cada tick
// do cron pra sempre, indefinidamente.
export const MAX_FAILED_ATTEMPTS = 5;

export type Reminder = {
  id: string;
  userId: string;
  message: string;
  phone: string;
  scheduledAt: string;
  repeat: ReminderRepeat;
  mode: "personal" | "business";
  sent: boolean;
  failedAttempts: number;
  recipientType: ReminderRecipientType;
  recipientName?: string;
  createdAt: string;
};

type Row = {
  id: string; user_id: string; message: string; phone: string; scheduled_at: string;
  repeat: ReminderRepeat; mode: "personal" | "business"; sent: boolean; failed_attempts: number;
  recipient_type: ReminderRecipientType | null; recipient_name: string | null; created_at: string;
};

function fromRow(r: Row): Reminder {
  return {
    id: r.id, userId: r.user_id, message: r.message, phone: r.phone, scheduledAt: r.scheduled_at,
    repeat: r.repeat, mode: r.mode, sent: r.sent, failedAttempts: r.failed_attempts ?? 0,
    recipientType: r.recipient_type || "self", recipientName: r.recipient_name ?? undefined, createdAt: r.created_at,
  };
}

export async function createReminder(data: Omit<Reminder, "id" | "sent" | "failedAttempts" | "createdAt">): Promise<Reminder> {
  let scheduledAt = data.scheduledAt;

  // Se o horário já passou, avança para o próximo futuro
  if (new Date(scheduledAt) <= new Date()) {
    const d = new Date(scheduledAt);
    if (data.repeat === "daily" || data.repeat === "none") {
      d.setDate(d.getDate() + 1);
    } else if (data.repeat === "weekly") {
      d.setDate(d.getDate() + 7);
    } else if (data.repeat === "monthly") {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 1);
    }
    scheduledAt = d.toISOString();
  }

  const row = {
    id: randomUUID(), user_id: data.userId, message: data.message, phone: data.phone, scheduled_at: scheduledAt,
    repeat: data.repeat, mode: data.mode, sent: false,
    recipient_type: data.recipientType || "self", recipient_name: data.recipientName || null,
  };
  const { data: inserted, error } = await getSupabase().from("reminders").insert(row).select("*").single();
  if (error) throw new Error(`[reminders] createReminder falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getDueReminders(): Promise<Reminder[]> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase().from("reminders").select("*")
    .eq("sent", false).lte("scheduled_at", now).lt("failed_attempts", MAX_FAILED_ATTEMPTS);
  if (error) { console.error("[reminders] getDueReminders erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function markReminderSent(id: string, repeat: ReminderRepeat): Promise<void> {
  if (repeat === "none") {
    await getSupabase().from("reminders").update({ sent: true, failed_attempts: 0 }).eq("id", id);
    return;
  }
  const { data, error } = await getSupabase().from("reminders").select("scheduled_at").eq("id", id).maybeSingle();
  if (error || !data) return;
  const next = new Date((data as { scheduled_at: string }).scheduled_at);
  if (repeat === "daily") next.setDate(next.getDate() + 1);
  else if (repeat === "weekly") next.setDate(next.getDate() + 7);
  else if (repeat === "monthly") next.setMonth(next.getMonth() + 1);
  await getSupabase().from("reminders").update({ scheduled_at: next.toISOString(), sent: false, failed_attempts: 0 }).eq("id", id);
}

/** Chamado quando o envio falha (WhatsApp indisponível, número inválido,
 *  etc.) — o lembrete continua "não enviado" e será tentado de novo no
 *  próximo tick do cron, até bater em MAX_FAILED_ATTEMPTS. */
export async function markReminderFailed(id: string): Promise<void> {
  const { data } = await getSupabase().from("reminders").select("failed_attempts").eq("id", id).maybeSingle();
  const current = (data as { failed_attempts: number } | null)?.failed_attempts ?? 0;
  await getSupabase().from("reminders").update({ failed_attempts: current + 1 }).eq("id", id);
}

/** Registros antigos, de antes do campo mode existir, tratam como "personal"
 *  por padrão — evita que lembretes já criados somem da lista de ninguém. */
export async function getRemindersByUser(userId: string, mode?: "personal" | "business"): Promise<Reminder[]> {
  let query = getSupabase().from("reminders").select("*").eq("user_id", userId).eq("sent", false);
  if (mode) query = query.eq("mode", mode);
  const { data, error } = await query;
  if (error) { console.error("[reminders] getRemindersByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function getAllRemindersByUser(userId: string, mode?: "personal" | "business"): Promise<Reminder[]> {
  let query = getSupabase().from("reminders").select("*").eq("user_id", userId);
  if (mode) query = query.eq("mode", mode);
  const { data, error } = await query;
  if (error) { console.error("[reminders] getAllRemindersByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function updateReminder(id: string, userId: string, patch: Partial<Pick<Reminder, "message" | "scheduledAt" | "repeat" | "phone" | "recipientType" | "recipientName">>): Promise<Reminder | null> {
  const rowPatch: Record<string, unknown> = { sent: false };
  if (patch.message !== undefined) rowPatch.message = patch.message;
  if (patch.scheduledAt !== undefined) rowPatch.scheduled_at = patch.scheduledAt;
  if (patch.repeat !== undefined) rowPatch.repeat = patch.repeat;
  if (patch.phone !== undefined) rowPatch.phone = patch.phone;
  if (patch.recipientType !== undefined) rowPatch.recipient_type = patch.recipientType;
  if (patch.recipientName !== undefined) rowPatch.recipient_name = patch.recipientName || null;
  const { data, error } = await getSupabase().from("reminders").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** Busca um lembrete ainda não disparado por palavra-chave na mensagem —
 *  usado por reminder_update/reminder_delete pra identificar qual. */
export async function findReminderByKeyword(userId: string, keyword: string, mode?: "personal" | "business"): Promise<Reminder | null> {
  const lower = keyword.toLowerCase();
  return (await getRemindersByUser(userId, mode)).find(r => r.message.toLowerCase().includes(lower)) ?? null;
}

export async function deleteReminder(id: string, userId: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("reminders").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
}
