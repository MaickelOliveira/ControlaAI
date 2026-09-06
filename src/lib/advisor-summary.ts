import type { Appointment } from "./agenda";
import { formatCurrency, type FinanceMode } from "./finances";
import type { Task } from "./tasks";
import type { BalanceForecast, UpcomingFinanceItem } from "./upcoming-finances";

const TZ = "America/Sao_Paulo";

function localeTag(locale?: string): string {
  if (locale === "es") return "es-419";
  if (locale === "pt-PT") return "pt-PT";
  return "pt-BR";
}

function modeLabel(mode: FinanceMode, locale?: string): string {
  if (mode === "business") return "🏢 Empresa";
  return locale === "es" ? "👤 Personal" : "👤 Pessoal";
}

function appointmentLabel(appointment: Appointment, locale?: string): string {
  const date = new Date(appointment.startAt);
  const day = date.toLocaleDateString(localeTag(locale), {
    timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit",
  });
  if (appointment.allDay) return day;
  const time = date.toLocaleTimeString(localeTag(locale), {
    timeZone: TZ, hour: "2-digit", minute: "2-digit",
  });
  return locale === "es" ? `${day} a las ${time}` : `${day} às ${time}`;
}

function simpleDate(date: string, locale?: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(localeTag(locale), { day: "2-digit", month: "2-digit" });
}

function taskDueLabel(task: Task, today: string, locale?: string): string {
  if (!task.dueDate) return locale === "es" ? "sin plazo" : "sem prazo";
  if (task.dueDate < today) return locale === "es" ? `atrasada desde ${simpleDate(task.dueDate, locale)}` : `atrasada desde ${simpleDate(task.dueDate, locale)}`;
  if (task.dueDate === today) return locale === "es" ? "para hoy" : "para hoje";
  return locale === "es" ? `hasta ${simpleDate(task.dueDate, locale)}` : `até ${simpleDate(task.dueDate, locale)}`;
}

function financeDueLabel(item: UpcomingFinanceItem, locale?: string): string {
  if (!item.dueDate) return locale === "es" ? "sin fecha" : "sem data";
  return simpleDate(item.dueDate, locale);
}

/** Briefing operacional do Zelo: agenda, tarefas e compromissos financeiros.
 * O saldo previsto continua separado por modo e nunca inclui pendências sem
 * data, embora elas possam aparecer no resumo semanal para não serem esquecidas. */
export function replyAdvisorSummary(
  kind: "daily" | "weekly",
  periodLabel: string,
  appointments: Appointment[],
  tasks: Task[],
  finances: UpcomingFinanceItem[],
  forecasts: BalanceForecast[],
  today: string,
  locale?: string,
): string {
  const title = locale === "es"
    ? (kind === "daily" ? "Resumen del día" : "Resumen de la semana")
    : locale === "pt-PT"
      ? (kind === "daily" ? "Resumo do dia" : "Resumo da semana")
      : (kind === "daily" ? "Resumo do dia" : "Resumo da semana");
  let message = `🧭 *${title}*\n_${periodLabel}_`;

  message += locale === "es" ? "\n\n📅 *Agenda*" : "\n\n📅 *Compromissos*";
  if (!appointments.length) {
    message += locale === "es" ? "\n• No hay eventos programados." : "\n• Nenhum compromisso agendado.";
  } else {
    appointments.slice(0, 8).forEach(item => {
      const location = item.location ? ` · ${item.location}` : "";
      message += `\n• *${item.title}* — ${appointmentLabel(item, locale)}${location}`;
    });
  }

  message += locale === "es" ? "\n\n✅ *Tareas*" : "\n\n✅ *Tarefas*";
  if (!tasks.length) {
    message += locale === "es" ? "\n• No hay tareas pendientes para este período." : "\n• Nenhuma tarefa pendente para este período.";
  } else {
    tasks.slice(0, 10).forEach(item => {
      const priority = item.priority === "high" ? "⚡ " : "";
      const taskMode = forecasts.length > 1 ? ` · ${modeLabel(item.mode, locale)}` : "";
      message += `\n• ${priority}*${item.title}* — ${taskDueLabel(item, today, locale)}${taskMode}`;
    });
  }

  const expenses = finances.filter(item => item.type === "expense");
  const incomes = finances.filter(item => item.type === "income");
  const appendFinances = (items: UpcomingFinanceItem[], type: "expense" | "income") => {
    const isExpense = type === "expense";
    const heading = locale === "es"
      ? (isExpense ? "💸 *Por pagar*" : "💰 *Por cobrar*")
      : (isExpense ? "💸 *A pagar*" : "💰 *A receber*");
    message += `\n\n${heading}`;
    if (!items.length) {
      message += locale === "es" ? "\n• Nada registrado." : "\n• Nada registrado.";
      return;
    }
    items.slice(0, 10).forEach(item => {
      const itemMode = forecasts.length > 1 ? ` · ${modeLabel(item.mode, locale)}` : "";
      message += `\n• *${item.description}* — ${formatCurrency(item.amount)} · ${financeDueLabel(item, locale)}${itemMode}`;
    });
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const totalLabel = locale === "es"
      ? (isExpense ? "Total por pagar" : "Total por cobrar")
      : (isExpense ? "Total a pagar" : "Total a receber");
    message += `\n  *${totalLabel}: ${formatCurrency(total)}*`;
  };
  appendFinances(expenses, "expense");
  appendFinances(incomes, "income");

  message += locale === "es" ? "\n\n📊 *Previsión de saldo*" : "\n\n📊 *Previsão de saldo*";
  forecasts.forEach(forecast => {
    message += `\n${modeLabel(forecast.mode, locale)}`;
    message += locale === "es"
      ? `\n• Saldo del período hasta ahora: ${formatCurrency(forecast.currentBalance)}\n• Saldo previsto: *${formatCurrency(forecast.projectedBalance)}*`
      : `\n• Saldo do período até agora: ${formatCurrency(forecast.currentBalance)}\n• Saldo previsto: *${formatCurrency(forecast.projectedBalance)}*`;
  });

  if (finances.some(item => !item.dueDate)) {
    message += locale === "es"
      ? "\n\n_Las pendientes sin fecha aparecen arriba, pero no entran en la previsión._"
      : "\n\n_Pendências sem data aparecem acima, mas não entram na previsão._";
  }
  return message;
}
