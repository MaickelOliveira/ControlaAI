import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { addFinance } from "./finances";

const TZ = "America/Sao_Paulo";

export type RecurringTransaction = {
  id: string;
  userId: string;
  type: "income" | "expense";
  amount: number;
  totalAmount?: number;
  category: string;
  description: string;
  mode: "personal" | "business";
  recurrenceType: "installment" | "recurring";
  /**
   * Número total de ocorrências.
   * • recurrenceType "installment": nº de parcelas — rotulado "(3/12)" no lançamento gerado.
   * • recurrenceType "recurring": prazo OPCIONAL (ex: academia por 12 meses).
   *   Encerra o acompanhamento ao atingir o total, SEM rótulo de parcela.
   *   Ausente = perpétuo (comportamento padrão, retrocompatível com registros antigos).
   */
  totalInstallments?: number;
  paidInstallments: number;
  repeatUnit: "daily" | "weekly" | "monthly" | "yearly";
  dayOfMonth?: number;
  startDate: string;
  nextDueDate: string;
  status: "active" | "completed" | "cancelled";
  lastNotifiedDate?: string;
  source: "whatsapp" | "web";
  createdAt: string;
};

type Row = {
  id: string; user_id: string; type: "income" | "expense"; amount: number; total_amount: number | null;
  category: string; description: string; mode: "personal" | "business"; recurrence_type: "installment" | "recurring";
  total_installments: number | null; paid_installments: number; repeat_unit: RecurringTransaction["repeatUnit"];
  day_of_month: number | null; start_date: string; next_due_date: string; status: RecurringTransaction["status"];
  last_notified_date: string | null; source: "whatsapp" | "web"; created_at: string;
};

function fromRow(r: Row): RecurringTransaction {
  return {
    id: r.id, userId: r.user_id, type: r.type, amount: Number(r.amount),
    totalAmount: r.total_amount !== null ? Number(r.total_amount) : undefined,
    category: r.category, description: r.description, mode: r.mode, recurrenceType: r.recurrence_type,
    totalInstallments: r.total_installments ?? undefined, paidInstallments: r.paid_installments,
    repeatUnit: r.repeat_unit, dayOfMonth: r.day_of_month ?? undefined, startDate: r.start_date,
    nextDueDate: r.next_due_date, status: r.status, lastNotifiedDate: r.last_notified_date ?? undefined,
    source: r.source, createdAt: r.created_at,
  };
}

function todaySP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function calcNextDueDate(from: string, repeatUnit: RecurringTransaction["repeatUnit"], dayOfMonth?: number): string {
  const d = new Date(from + "T12:00:00");
  if (repeatUnit === "monthly") {
    d.setMonth(d.getMonth() + 1);
    if (dayOfMonth) d.setDate(dayOfMonth);
  } else if (repeatUnit === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (repeatUnit === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (repeatUnit === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function calcFirstDueDate(startDate: string, dayOfMonth?: number): string {
  if (!dayOfMonth) return startDate;
  const today = todaySP();
  const ref = new Date(today + "T12:00:00");
  const candidate = new Date(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  const candidateStr = candidate.toISOString().slice(0, 10);
  if (candidateStr >= today) return candidateStr;
  const next = new Date(ref.getFullYear(), ref.getMonth() + 1, dayOfMonth);
  return next.toISOString().slice(0, 10);
}

export type CreateRecurringInput = Omit<RecurringTransaction, "id" | "paidInstallments" | "status" | "createdAt" | "nextDueDate"> & { nextDueDate?: string };

export async function createRecurring(data: CreateRecurringInput): Promise<RecurringTransaction> {
  const nextDueDate = data.nextDueDate || calcFirstDueDate(data.startDate, data.dayOfMonth);
  const row = {
    id: randomUUID(), user_id: data.userId, type: data.type, amount: data.amount, total_amount: data.totalAmount,
    category: data.category, description: data.description, mode: data.mode, recurrence_type: data.recurrenceType,
    total_installments: data.totalInstallments, paid_installments: 0, repeat_unit: data.repeatUnit,
    day_of_month: data.dayOfMonth, start_date: data.startDate, next_due_date: nextDueDate, status: "active",
    source: data.source,
  };
  const { data: inserted, error } = await getSupabase().from("recurring_transactions").insert(row).select("*").single();
  if (error) throw new Error(`[recurring] createRecurring falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getRecurringByUser(userId: string, mode?: string, status?: string): Promise<RecurringTransaction[]> {
  let query = getSupabase().from("recurring_transactions").select("*").eq("user_id", userId);
  if (mode) query = query.eq("mode", mode);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) { console.error("[recurring] getRecurringByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

/** Varre TODOS os usuários (usado pelo cron) — recorrentes ativos vencidos
 *  hoje que ainda não foram notificados hoje. */
export async function getRecurringDueToday(): Promise<RecurringTransaction[]> {
  const today = todaySP();
  const { data, error } = await getSupabase().from("recurring_transactions").select("*").eq("status", "active").lte("next_due_date", today);
  if (error || !data) return [];
  return (data as Row[]).map(fromRow).filter(r => r.lastNotifiedDate !== today);
}

export async function confirmRecurring(id: string, userId: string): Promise<{ updated: RecurringTransaction; finance: Awaited<ReturnType<typeof addFinance>> } | null> {
  const { data: current, error: readError } = await getSupabase().from("recurring_transactions").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (readError || !current) return null;
  const rec = fromRow(current as Row);

  const today = todaySP();
  const installmentLabel = rec.recurrenceType === "installment"
    ? ` (${rec.paidInstallments + 1}/${rec.totalInstallments})`
    : "";
  const finance = await addFinance({
    userId,
    type: rec.type,
    amount: rec.amount,
    category: rec.category,
    description: rec.description + installmentLabel,
    date: today,
    mode: rec.mode,
    source: "whatsapp",
  });

  const paidInstallments = rec.paidInstallments + 1;
  const rowPatch: Record<string, unknown> = { paid_installments: paidInstallments };
  // Encerra quando atinge o total, tanto em parcelamento quanto em recorrente
  // com prazo definido (ex: "academia por 12 meses"). Recorrente sem
  // totalInstallments continua perpétuo — compatível com registros antigos.
  if (rec.totalInstallments && paidInstallments >= rec.totalInstallments) {
    rowPatch.status = "completed";
  } else {
    rowPatch.next_due_date = calcNextDueDate(rec.nextDueDate, rec.repeatUnit, rec.dayOfMonth);
    rowPatch.last_notified_date = null;
  }

  const { data: updated, error } = await getSupabase().from("recurring_transactions").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !updated) return null;
  return { updated: fromRow(updated as Row), finance };
}

export async function cancelRecurring(id: string, userId: string): Promise<RecurringTransaction | null> {
  const { data, error } = await getSupabase().from("recurring_transactions").update({ status: "cancelled" }).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function updateRecurring(
  id: string,
  userId: string,
  patch: Partial<Pick<RecurringTransaction, "amount" | "description" | "category" | "dayOfMonth" | "repeatUnit" | "totalInstallments">>
): Promise<RecurringTransaction | null> {
  const rowPatch: Record<string, unknown> = {};
  if (patch.amount !== undefined) rowPatch.amount = patch.amount;
  if (patch.description !== undefined) rowPatch.description = patch.description;
  if (patch.category !== undefined) rowPatch.category = patch.category;
  if (patch.dayOfMonth !== undefined) rowPatch.day_of_month = patch.dayOfMonth;
  if (patch.repeatUnit !== undefined) rowPatch.repeat_unit = patch.repeatUnit;
  if (patch.totalInstallments !== undefined) rowPatch.total_installments = patch.totalInstallments;
  const { data, error } = await getSupabase().from("recurring_transactions").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function markNotified(id: string): Promise<void> {
  await getSupabase().from("recurring_transactions").update({ last_notified_date: todaySP() }).eq("id", id);
}

export async function findRecurringByDescription(userId: string, keyword: string): Promise<RecurringTransaction | null> {
  const lower = keyword.toLowerCase();
  const { data, error } = await getSupabase().from("recurring_transactions").select("*").eq("user_id", userId).eq("status", "active");
  if (error || !data) return null;
  return (data as Row[]).map(fromRow).find(r => r.description.toLowerCase().includes(lower)) ?? null;
}

export async function getRecurringById(id: string, userId: string): Promise<RecurringTransaction | null> {
  const { data, error } = await getSupabase().from("recurring_transactions").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** Ocorrências restantes de um recorrente com prazo, ou null se perpétuo. */
export function recurringRemaining(r: RecurringTransaction): number | null {
  return r.totalInstallments ? Math.max(0, r.totalInstallments - r.paidInstallments) : null;
}

export async function deleteRecurring(id: string, userId: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("recurring_transactions").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
}
