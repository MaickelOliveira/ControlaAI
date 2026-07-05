import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
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
};

const DATA_FILE = path.join(process.cwd(), "data", "agenda.json");

function load(): Appointment[] {
  try {
    if (!existsSync(DATA_FILE)) return [];
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch { return []; }
}

function save(items: Appointment[]) {
  writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

export function createAppointment(data: Omit<Appointment, "id" | "createdAt">): Appointment {
  const item: Appointment = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  const all = load();
  all.push(item);
  save(all);
  return item;
}

export function getAppointments(userId: string): Appointment[] {
  return load()
    .filter(a => a.userId === userId && a.status !== "cancelled")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function getAppointmentById(id: string, userId: string): Appointment | null {
  return load().find(a => a.id === id && a.userId === userId) ?? null;
}

export function updateAppointment(
  id: string,
  userId: string,
  patch: Partial<Omit<Appointment, "id" | "userId" | "createdAt">>
): Appointment | null {
  const all = load();
  const idx = all.findIndex(a => a.id === id && a.userId === userId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  save(all);
  return all[idx];
}

export function deleteAppointment(id: string, userId: string): boolean {
  const all = load();
  const idx = all.findIndex(a => a.id === id && a.userId === userId);
  if (idx < 0) return false;
  all.splice(idx, 1);
  save(all);
  return true;
}

export function findAppointmentByKeyword(userId: string, keyword: string): Appointment | null {
  const lower = keyword.toLowerCase();
  const all = load()
    .filter(a => a.userId === userId && a.status === "scheduled")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  return (
    all.find(a =>
      a.title.toLowerCase().includes(lower) ||
      a.description?.toLowerCase().includes(lower) ||
      a.location?.toLowerCase().includes(lower)
    ) ?? null
  );
}

/** Compromissos com Google Meet encerrados há 5-60 min sem ata ainda gerada */
export function getAppointmentsWithEndedMeet(): Appointment[] {
  const now = Date.now();
  const min5 = 5 * 60_000;
  const min60 = 60 * 60_000;
  return load().filter(a => {
    if (!a.meetLink || !a.endAt) return false;
    if (a.ataGenerated || a.ataNotifiedAt) return false;
    if (a.status !== "scheduled") return false;
    const endMs = new Date(a.endAt).getTime();
    return endMs < now - min5 && endMs > now - min60;
  });
}

export function getUpcomingAppointments(userId: string, days: number = 7): Appointment[] {
  const todaySP = todayStrBR();
  const startOfTodayUTC = new Date(todaySP + "T00:00:00-03:00");
  const cutoff = new Date(startOfTodayUTC);
  cutoff.setDate(cutoff.getDate() + days);

  return load()
    .filter(a =>
      a.userId === userId &&
      a.status === "scheduled" &&
      new Date(a.startAt) >= startOfTodayUTC &&
      new Date(a.startAt) < cutoff
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
