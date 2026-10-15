import type { Task, TaskMode } from "./tasks";
import { formatDueDate } from "./tasks";

export type TaskQueryScope = "pending" | "created_today" | "due_today" | "completed_today";

const SAO_PAULO = "America/Sao_Paulo";

function localDay(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: SAO_PAULO }).format(date);
}

export function parseTaskQueryScope(message: string): TaskQueryScope {
  const text = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/\bhoje\b/.test(text)) return "pending";
  if (/\b(concluid[ao]s?|conclui|finalizad[ao]s?|finalizei|terminei)\b/.test(text)) return "completed_today";
  if (/\b(criad[ao]s?|criei|cadastrei|cadastrad[ao]s?|adicionei|adicionad[ao]s?)\b/.test(text)) {
    return "created_today";
  }
  return "due_today";
}

export function selectTasksForQuery(tasks: Task[], scope: Exclude<TaskQueryScope, "completed_today">, now = new Date()): Task[] {
  const today = localDay(now);
  if (scope === "created_today") {
    return tasks.filter(task => {
      const created = new Date(task.createdAt);
      return !Number.isNaN(created.getTime()) && localDay(created) === today;
    });
  }
  if (scope === "due_today") return tasks.filter(task => task.status !== "completed" && task.dueDate === today);
  return tasks.filter(task => task.status !== "completed");
}

export function replyScopedTaskList(tasks: Task[], scope: Exclude<TaskQueryScope, "pending">, mode: TaskMode, locale?: string): string {
  const spanish = locale === "es";
  if (scope === "completed_today") return spanish
    ? "Todavía no registro cuándo se completó cada tarea, por eso no puedo decir cuáles se finalizaron hoy."
    : "Ainda não registro a data em que cada tarefa foi concluída. Por isso, não consigo dizer quais foram concluídas hoje.";
  const business = mode === "business";
  const heading = scope === "created_today"
    ? (spanish ? "Tareas creadas hoy" : "Tarefas criadas hoje")
    : (spanish ? "Tareas pendientes para hoy" : "Tarefas pendentes para hoje");
  const location = business ? "Empresa" : (spanish ? "Personal" : "Pessoal");
  if (!tasks.length) return spanish
    ? `No encontré ${scope === "created_today" ? "tareas creadas hoy" : "tareas pendientes para hoy"} en ${location}.`
    : `Não encontrei ${scope === "created_today" ? "tarefas criadas hoje" : "tarefas pendentes para hoje"} em ${location}.`;
  const lines = tasks.slice(0, 20).map((task, index) => {
    const status = task.status === "completed" ? "✅" : task.status === "in_progress" ? "🔄" : "⬜";
    const due = task.dueDate ? ` — ${formatDueDate(task.dueDate, locale)}` : "";
    return `${index + 1}. ${status} ${task.title}${due}`;
  });
  const remainder = tasks.length > 20 ? `\n${spanish ? "Y" : "E"} ${tasks.length - 20} ${spanish ? "más" : "mais"}.` : "";
  return `📋 *${heading} — ${location} (${tasks.length}):*\n\n${lines.join("\n")}${remainder}`;
}
