import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { addFinance } from "./finances";

const FILE = path.join(process.cwd(), "data", "recurring.json");
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

function load(): RecurringTransaction[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}

function save(data: RecurringTransaction[]) {
  try { writeFileSync(FILE, JSON.stringify(data, null, 2)); } catch {}
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

export function createRecurring(data: CreateRecurringInput): RecurringTransaction {
  const nextDueDate = data.nextDueDate || calcFirstDueDate(data.startDate, data.dayOfMonth);
  const rec: RecurringTransaction = {
    ...data,
    id: randomUUID(),
    paidInstallments: 0,
    status: "active",
    nextDueDate,
    createdAt: new Date().toISOString(),
  };
  const all = load();
  all.push(rec);
  save(all);
  return rec;
}

export function getRecurringByUser(userId: string, mode?: string, status?: string): RecurringTransaction[] {
  return load().filter(r =>
    r.userId === userId &&
    (!mode || r.mode === mode) &&
    (!status || r.status === status)
  );
}

export function getRecurringDueToday(): RecurringTransaction[] {
  const today = todaySP();
  return load().filter(r =>
    r.status === "active" &&
    r.nextDueDate <= today &&
    r.lastNotifiedDate !== today
  );
}

export function confirmRecurring(id: string, userId: string): { updated: RecurringTransaction; finance: ReturnType<typeof addFinance> } | null {
  const all = load();
  const idx = all.findIndex(r => r.id === id && r.userId === userId);
  if (idx === -1) return null;
  const rec = { ...all[idx] };

  const today = todaySP();
  const installmentLabel = rec.recurrenceType === "installment"
    ? ` (${rec.paidInstallments + 1}/${rec.totalInstallments})`
    : "";
  const finance = addFinance({
    userId,
    type: rec.type,
    amount: rec.amount,
    category: rec.category,
    description: rec.description + installmentLabel,
    date: today,
    mode: rec.mode,
    source: "whatsapp",
  });

  rec.paidInstallments += 1;
  if (rec.recurrenceType === "installment" && rec.totalInstallments && rec.paidInstallments >= rec.totalInstallments) {
    rec.status = "completed";
  } else {
    rec.nextDueDate = calcNextDueDate(rec.nextDueDate, rec.repeatUnit, rec.dayOfMonth);
    rec.lastNotifiedDate = undefined;
  }

  all[idx] = rec;
  save(all);
  return { updated: rec, finance };
}

export function cancelRecurring(id: string, userId: string): RecurringTransaction | null {
  const all = load();
  const idx = all.findIndex(r => r.id === id && r.userId === userId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], status: "cancelled" };
  save(all);
  return all[idx];
}

export function updateRecurring(
  id: string,
  userId: string,
  patch: Partial<Pick<RecurringTransaction, "amount" | "description" | "category" | "dayOfMonth" | "repeatUnit" | "totalInstallments">>
): RecurringTransaction | null {
  const all = load();
  const idx = all.findIndex(r => r.id === id && r.userId === userId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save(all);
  return all[idx];
}

export function markNotified(id: string): void {
  const all = load();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], lastNotifiedDate: todaySP() };
  save(all);
}

export function findRecurringByDescription(userId: string, keyword: string): RecurringTransaction | null {
  const lower = keyword.toLowerCase();
  return load().find(r =>
    r.userId === userId &&
    r.status === "active" &&
    r.description.toLowerCase().includes(lower)
  ) ?? null;
}

export function getRecurringById(id: string, userId: string): RecurringTransaction | null {
  return load().find(r => r.id === id && r.userId === userId) ?? null;
}

export function deleteRecurring(id: string, userId: string): boolean {
  const all = load();
  const idx = all.findIndex(r => r.id === id && r.userId === userId);
  if (idx === -1) return false;
  all.splice(idx, 1);
  save(all);
  return true;
}
