function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Intervalo fechado do mês civil local. O último dia é calculado pelo
 * calendário (28/29/30/31), sem somar uma quantidade fixa de dias. */
export function monthRange(offsetMonths: number, now = new Date()): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return {
    from: ymd(first.getFullYear(), first.getMonth() + 1, 1),
    to: ymd(last.getFullYear(), last.getMonth() + 1, last.getDate()),
  };
}

export function last3MonthsRange(now = new Date()): { from: string; to: string } {
  const current = monthRange(0, now);
  const first = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return {
    from: ymd(first.getFullYear(), first.getMonth() + 1, 1),
    to: current.to,
  };
}

/** A month/year selector can read any stored month, without a rolling cutoff. */
export function selectedMonthRange(value: string): { from: string; to: string } | null {
  if (!/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return {from: `${value}-01`, to: ymd(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate())};
}
