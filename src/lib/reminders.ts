import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type ReminderRepeat = "none" | "daily" | "weekly" | "monthly";

export type Reminder = {
  id: string;
  userId: string;
  message: string;
  phone: string;
  scheduledAt: string;
  repeat: ReminderRepeat;
  sent: boolean;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "reminders.json");

function load(): Reminder[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}
function save(items: Reminder[]) {
  writeFileSync(FILE, JSON.stringify(items, null, 2));
}

export function createReminder(data: Omit<Reminder, "id" | "sent" | "createdAt">): Reminder {
  const items = load();
  const r: Reminder = { ...data, id: randomUUID(), sent: false, createdAt: new Date().toISOString() };
  items.push(r);
  save(items);
  return r;
}

export function getDueReminders(): Reminder[] {
  const now = new Date();
  return load().filter(r => !r.sent && new Date(r.scheduledAt) <= now);
}

export function markReminderSent(id: string, repeat: ReminderRepeat): void {
  const items = load();
  const idx = items.findIndex(r => r.id === id);
  if (idx < 0) return;

  if (repeat === "none") {
    items[idx].sent = true;
  } else {
    const next = new Date(items[idx].scheduledAt);
    if (repeat === "daily") next.setDate(next.getDate() + 1);
    else if (repeat === "weekly") next.setDate(next.getDate() + 7);
    else if (repeat === "monthly") next.setMonth(next.getMonth() + 1);
    items[idx].scheduledAt = next.toISOString();
    items[idx].sent = false;
  }
  save(items);
}

export function getRemindersByUser(userId: string): Reminder[] {
  return load().filter(r => r.userId === userId && !r.sent);
}

export function deleteReminder(id: string, userId: string): boolean {
  const items = load();
  const filtered = items.filter(r => !(r.id === id && r.userId === userId));
  if (filtered.length === items.length) return false;
  save(filtered);
  return true;
}
