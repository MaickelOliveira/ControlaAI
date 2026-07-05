import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

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

const DATA_FILE = path.join(process.cwd(), "data", "meets.json");

function load(): Meet[] {
  try {
    if (!existsSync(DATA_FILE)) return [];
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch { return []; }
}

function save(items: Meet[]) {
  writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

export function createMeet(data: Omit<Meet, "id" | "createdAt">): Meet {
  const item: Meet = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  const all = load();
  all.push(item);
  save(all);
  return item;
}

export function getMeetsByUser(userId: string): Meet[] {
  return load()
    .filter(m => m.userId === userId && m.status !== "cancelled")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function getMeetById(id: string, userId: string): Meet | null {
  return load().find(m => m.id === id && m.userId === userId) ?? null;
}

export function updateMeet(id: string, userId: string, patch: Partial<Omit<Meet, "id" | "userId" | "createdAt">>): Meet | null {
  const all = load();
  const idx = all.findIndex(m => m.id === id && m.userId === userId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  save(all);
  return all[idx];
}

export function deleteMeet(id: string, userId: string): boolean {
  const all = load();
  const idx = all.findIndex(m => m.id === id && m.userId === userId);
  if (idx < 0) return false;
  all.splice(idx, 1);
  save(all);
  return true;
}

// Retorna meets que encerraram há 5-60 min, sem ata, sem notificação enviada
export function getMeetsEndedWithoutAta(): Meet[] {
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60_000;
  const sixtyMinAgo = now - 60 * 60_000;

  return load().filter(m => {
    if (m.status !== "scheduled") return false;
    if (m.ataGenerated) return false;
    if (m.ataNotifiedAt) return false;
    const endMs = new Date(m.endAt).getTime();
    return endMs <= fiveMinAgo && endMs >= sixtyMinAgo;
  });
}
