import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskMode = "personal" | "business";
export type TaskUpdateInput = Partial<Pick<Task, "title" | "status" | "priority" | "mode">> & { dueDate?: string | null };

export type Task = {
  id: string;
  userId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  mode: TaskMode;
  createdAt: string;
};

type Row = {
  id: string; user_id: string; title: string; status: TaskStatus; priority: TaskPriority;
  due_date: string | null; mode: TaskMode; created_at: string;
};

function fromRow(r: Row): Task {
  return {
    id: r.id, userId: r.user_id, title: r.title, status: r.status,
    priority: r.priority, dueDate: r.due_date ?? undefined, mode: r.mode, createdAt: r.created_at,
  };
}

export async function createTask(data: Omit<Task, "id" | "createdAt">): Promise<Task> {
  const row = { id: randomUUID(), user_id: data.userId, title: data.title, status: data.status, priority: data.priority, due_date: data.dueDate, mode: data.mode };
  const { data: inserted, error } = await getSupabase().from("tasks").insert(row).select("*").single();
  if (error) throw new Error(`[tasks] createTask falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

/** Insere a lista numa única operação para evitar confirmar um lote pela
 * metade caso o banco rejeite algum registro. */
export async function createTasks(items: Array<Omit<Task, "id" | "createdAt">>): Promise<Task[]> {
  if (!items.length) return [];
  const rows = items.map(data => ({
    id: randomUUID(), user_id: data.userId, title: data.title, status: data.status,
    priority: data.priority, due_date: data.dueDate, mode: data.mode,
  }));
  const { data: inserted, error } = await getSupabase().from("tasks").insert(rows).select("*");
  if (error) throw new Error(`[tasks] createTasks falhou: ${error.message}`);
  return (inserted as Row[]).map(fromRow);
}

export async function getTasksByUser(userId: string, mode?: TaskMode): Promise<Task[]> {
  let query = getSupabase().from("tasks").select("*").eq("user_id", userId);
  if (mode) query = query.eq("mode", mode);
  const { data, error } = await query;
  if (error) { console.error("[tasks] getTasksByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function getPendingTasks(userId: string, mode?: TaskMode): Promise<Task[]> {
  return (await getTasksByUser(userId, mode))
    .filter(t => t.status !== "completed")
    .sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });
}

export async function getOverdueTasks(userId: string, mode?: TaskMode): Promise<Task[]> {
  const today = new Date().toISOString().slice(0, 10);
  return (await getPendingTasks(userId, mode))
    .filter(t => t.dueDate && t.dueDate < today);
}

export async function updateTask(id: string, userId: string, patch: TaskUpdateInput): Promise<Task | null> {
  const rowPatch: Partial<Row> = {};
  if (patch.title !== undefined) rowPatch.title = patch.title;
  if (patch.status !== undefined) rowPatch.status = patch.status;
  if (patch.priority !== undefined) rowPatch.priority = patch.priority;
  if (patch.dueDate !== undefined) rowPatch.due_date = patch.dueDate;
  if (patch.mode !== undefined) rowPatch.mode = patch.mode;
  if (!Object.keys(rowPatch).length) return null;
  const { data, error } = await getSupabase().from("tasks").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function updateTaskStatus(id: string, userId: string, status: TaskStatus): Promise<Task | null> {
  return updateTask(id, userId, { status });
}

export async function findTaskByTitle(userId: string, title: string, mode?: TaskMode): Promise<Task | null> {
  const lower = title.toLowerCase();
  return (await getTasksByUser(userId, mode))
    .find(t => t.title.toLowerCase().includes(lower)) ?? null;
}

export async function findTaskByNumber(userId: string, num: number, mode?: TaskMode): Promise<Task | null> {
  const pending = await getPendingTasks(userId, mode);
  return pending[num - 1] ?? null;
}

export async function deleteTask(id: string, userId: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("tasks").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
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

export function formatDueDate(dateStr?: string, locale = "pt-BR"): string {
  if (!dateStr) return locale === "es" ? "Sin fecha límite" : "Sem prazo";
  // "YYYY-MM-DD" sem hora é interpretado pelo Date como meia-noite UTC — em
  // fuso atrás de UTC (Brasil) isso volta pro dia anterior ao converter pra
  // hora local, fazendo "amanhã" ser exibido como "hoje". Ancorar ao meio-dia
  // evita cruzar a virada de dia em qualquer fuso razoável.
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return locale === "es" ? "hoy" : "hoje";
  if (date.toDateString() === tomorrow.toDateString()) return locale === "es" ? "mañana" : "amanhã";
  return date.toLocaleDateString(locale === "es" ? "es-419" : locale, { day: "2-digit", month: "2-digit" });
}
