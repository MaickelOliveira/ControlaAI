import { formatCurrency, type Finance, type FinanceMode } from "./finances";

export function isFinanceCreatedTodayQuery(message: string): boolean {
  const text = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(?:lancamentos?|movimentos?)\b/.test(text)
    && /\b(?:criad[oa]s?|cadastrad[oa]s?|registrad[oa]s?)\b/.test(text)
    && /\bhoje\b/.test(text)
    && !/\b(?:despesas?|gastos?|saidas?|receitas?|entradas?|recebimentos?)\b/.test(text);
}

export function createdDayBoundsBR(day: string): { from: string; to: string } {
  const [year, month, date] = day.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
  return {
    from: new Date(`${day}T00:00:00-03:00`).toISOString(),
    to: new Date(`${nextDay}T00:00:00-03:00`).toISOString(),
  };
}

export function replyFinancesCreatedToday(items: Finance[], mode: FinanceMode, keyword?: string, locale?: string): string {
  const spanish = locale === "es";
  const location = mode === "business" ? "Empresa" : (spanish ? "Personal" : "Pessoal");
  if (!items.length) return spanish
    ? `No encontré movimientos creados hoy${keyword ? ` con “${keyword}”` : ""} en ${location}.`
    : `Não encontrei lançamentos criados hoje${keyword ? ` com “${keyword}”` : ""} em ${location}.`;
  const parts = [spanish
    ? `📋 *Movimientos creados hoy — ${location} (${items.length})*`
    : `📋 *Lançamentos criados hoje — ${location} (${items.length})*`];
  for (const type of ["expense", "income"] as const) {
    const matching = items.filter(item => item.type === type);
    if (!matching.length) continue;
    const title = type === "expense" ? (spanish ? "Gastos" : "Despesas") : (spanish ? "Ingresos" : "Receitas");
    const lines = matching.slice(0, 30).map(item => {
      const date = item.date.split("-").reverse().join("/");
      const status = item.status === "pending" ? (spanish ? "pendiente" : "pendente") : (spanish ? "realizado" : "realizado");
      return `• ${item.description} — ${formatCurrency(item.amount)} · ${item.category} · ${date} (${status})`;
    });
    if (matching.length > 30) lines.push(spanish ? `• Y ${matching.length - 30} más.` : `• E mais ${matching.length - 30}.`);
    parts.push(`${type === "expense" ? "💸" : "💰"} *${title} (${matching.length})*\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}
