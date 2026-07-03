import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskMode = "personal" | "business";

export type Task = {
  id: string;
  userId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  projectId?: string;
  mode: TaskMode;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "tasks.json");

function load(): Task[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}
function save(items: Task[]) {
  writeFileSync(FILE, JSON.stringify(items, null, 2));
}

export function createTask(data: Omit<Task, "id" | "createdAt">): Task {
  const items = load();
  const task: Task = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  items.push(task);
  save(items);
  return task;
}

export function getTasksByUser(userId: string, mode?: TaskMode): Task[] {
  return load().filter(t => t.userId === userId && (!mode || t.mode === mode));
}

export function getPendingTasks(userId: string, mode?: TaskMode): Task[] {
  return getTasksByUser(userId, mode)
    .filter(t => t.status !== "completed")
    .sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });
}

export function getOverdueTasks(userId: string, mode?: TaskMode): Task[] {
  const today = new Date().toISOString().slice(0, 10);
  return getPendingTasks(userId, mode)
    .filter(t => t.dueDate && t.dueDate < today);
}

export function updateTaskStatus(id: string, userId: string, status: TaskStatus): Task | null {
  const items = load();
  const idx = items.findIndex(t => t.id === id && t.userId === userId);
  if (idx < 0) return null;
  items[idx].status = status;
  save(items);
  return items[idx];
}

export function findTaskByTitle(userId: string, title: string, mode?: TaskMode): Task | null {
  const lower = title.toLowerCase();
  return getTasksByUser(userId, mode)
    .find(t => t.title.toLowerCase().includes(lower)) ?? null;
}

export function findTaskByNumber(userId: string, num: number, mode?: TaskMode): Task | null {
  const pending = getPendingTasks(userId, mode);
  return pending[num - 1] ?? null;
}

export function deleteTask(id: string, userId: string): boolean {
  const items = load();
  const filtered = items.filter(t => !(t.id === id && t.userId === userId));
  if (filtered.length === items.length) return false;
  save(filtered);
  return true;
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "⚡ Alta",
  medium: "🟡 Média",
  low: "⚪ Baixa",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
};

export function formatDueDate(dateStr?: string): string {
  if (!dateStr) return "Sem prazo";
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const d = new Date(dateStr);
  if (d.toDateString() === today.toDateString()) return "hoje";
  if (d.toDateString() === tomorrow.toDateString()) return "amanhã";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
