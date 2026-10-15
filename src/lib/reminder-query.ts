import { nextReminderOccurrenceAfter, type Reminder } from "./reminders";

export type ReminderListScope = "all" | "next_week";

export function reminderListScope(message: string): ReminderListScope {
  const text = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(?:proxima semana|semana que vem|semana seguinte|semana que viene)\b/.test(text)
    ? "next_week" : "all";
}

/** Próxima semana = segunda-feira seguinte até o começo da outra segunda, em São Paulo. */
function nextWeekBounds(now: Date): [Date, Date] {
  const localDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(now);
  const [year, month, day] = localDay.split("-").map(Number);
  const localCalendarDay = new Date(Date.UTC(year, month - 1, day));
  const daysToMonday = ((8 - localCalendarDay.getUTCDay()) % 7) || 7;
  localCalendarDay.setUTCDate(localCalendarDay.getUTCDate() + daysToMonday);
  const startDay = localCalendarDay.toISOString().slice(0, 10);
  localCalendarDay.setUTCDate(localCalendarDay.getUTCDate() + 7);
  const endDay = localCalendarDay.toISOString().slice(0, 10);
  return [new Date(`${startDay}T00:00:00-03:00`), new Date(`${endDay}T00:00:00-03:00`)];
}

export function filterRemindersForNextWeek(reminders: Reminder[], now = new Date()): Reminder[] {
  const [start, end] = nextWeekBounds(now);
  return reminders.flatMap(reminder => {
    const scheduled = new Date(reminder.scheduledAt);
    if (Number.isNaN(scheduled.getTime()) || scheduled >= end) return [];
    const occurrence = scheduled < start
      ? nextReminderOccurrenceAfter(reminder.scheduledAt, reminder.repeat, new Date(start.getTime() - 1))
      : reminder.scheduledAt;
    if (!occurrence || new Date(occurrence) < start || new Date(occurrence) >= end) return [];
    return [{ ...reminder, scheduledAt: new Date(occurrence).toISOString() }];
  }).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
