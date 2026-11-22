export type Schedule = {
  nextDueDate: string;
  repeatUnit?: string;
  dayOfMonth?: number;
  startDate?: string;
  totalInstallments?: number;
  paidInstallments?: number;
};

const dayMs = 86_400_000;

export function occurrenceDate(schedule: Schedule, offset: number): string {
  const {nextDueDate, repeatUnit} = schedule;
  if (!offset) return nextDueDate;
  const base = new Date(nextDueDate + "T00:00:00Z");
  if (repeatUnit === "daily" || repeatUnit === "weekly") {
    base.setUTCDate(base.getUTCDate() + offset * (repeatUnit === "weekly" ? 7 : 1));
  } else {
    const day = schedule.dayOfMonth || base.getUTCDate();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + offset * (repeatUnit === "yearly" ? 12 : 1));
    const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(day, last));
  }
  return base.toISOString().slice(0, 10);
}

export function firstMonthlyDue(start: string, day: number) {
  const first = {nextDueDate: start.slice(0, 7) + "-01", repeatUnit: "monthly", dayOfMonth: day};
  const lastDay = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).getUTCDate();
  const candidate = start.slice(0, 8) + String(Math.min(day, lastDay)).padStart(2, "0");
  return candidate >= start ? candidate : occurrenceDate(first, 1);
}

/** The stored next due date is occurrence zero. Skip directly to the requested
 * window, retaining the original day across short months and the finite term. */
export function scheduledDates(schedule: Schedule, from: string, to: string): string[] {
  const first = schedule.nextDueDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || first > to || from > to) return [];
  const max = schedule.totalInstallments == null ? Infinity : schedule.totalInstallments - (schedule.paidInstallments ?? 0);
  if (!["daily","weekly","monthly","yearly"].includes(schedule.repeatUnit ?? "")) return max > 0 && first >= from ? [first] : [];
  const months = (Number(from.slice(0,4)) - Number(first.slice(0,4))) * 12 + Number(from.slice(5,7)) - Number(first.slice(5,7));
  const step = schedule.repeatUnit === "weekly" ? 7 : 1;
  const index = schedule.repeatUnit === "monthly" ? months : schedule.repeatUnit === "yearly" ? Math.floor(months / 12)
    : Math.floor((Date.parse(from) - Date.parse(first)) / (dayMs * step));
  const dates: string[] = [];
  for (let n = Math.max(0, index); n < max; n++) {
    const date = occurrenceDate(schedule, n);
    if (date > to) break;
    if (date >= from && (!schedule.startDate || date >= schedule.startDate)) dates.push(date);
    if (date === to) break;
  }
  return dates;
}

/** Generic meal benefit labels can refer to different benefits. Use this only
 * to ask the user to distinguish them, never to merge their records. */
export function similarBenefit(a:string,b:string) {
  const generic = new Set(["vale refeicao","vale alimentacao"]);
  return generic.has(recurrenceName(a)) && generic.has(recurrenceName(b));
}

export function recurrenceName(name: string) {
  const normal = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/^(?:vr|vale refeicao)$/.test(normal)) return "vale refeicao";
  if (/^(?:va|vale alimentacao)$/.test(normal)) return "vale alimentacao";
  return normal;
}
