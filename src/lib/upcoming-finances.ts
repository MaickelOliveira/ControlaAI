import { formatCurrency, type Finance, type FinanceMode, type FinanceType } from "./finances";
import type { RecurringTransaction } from "./recurring";

export type UpcomingFinanceOrigin = "scheduled" | "undated" | "recurring" | "installment";

export type UpcomingFinanceItem = {
  id: string;
  type: FinanceType;
  description: string;
  amount: number;
  dueDate?: string;
  mode: FinanceMode;
  origin: UpcomingFinanceOrigin;
};

export type BalanceForecast = {
  mode: FinanceMode;
  currentBalance: number;
  upcomingIncome: number;
  upcomingExpense: number;
  projectedBalance: number;
};

type UpcomingRange = {
  from: string;
  to: string;
  mode?: FinanceMode;
  includeUndated?: boolean;
};

function normalizedDescription(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Junta compromissos financeiros de origem única e recorrente. Lançamentos
 * pendentes sem data continuam visíveis, mas ficam marcados como "sem data"
 * para não contaminarem a previsão temporal do saldo. */
export function collectUpcomingFinanceItems(
  pendingFinances: Finance[],
  recurringTransactions: RecurringTransaction[],
  range: UpcomingRange,
): UpcomingFinanceItem[] {
  const knownDateInRange = (date: string) => date >= range.from && date <= range.to;

  const pendingItems: UpcomingFinanceItem[] = pendingFinances
    .filter(item => item.status === "pending" && (!range.mode || item.mode === range.mode))
    .filter(item => Number.isFinite(item.amount) && item.amount > 0)
    .flatMap(item => {
      const hasKnownDate = item.autoPost !== false && /^\d{4}-\d{2}-\d{2}$/.test(item.date);
      if (!hasKnownDate && !range.includeUndated) return [];
      if (hasKnownDate && !knownDateInRange(item.date)) return [];
      return [{
        id: item.id,
        type: item.type,
        description: item.description,
        amount: item.amount,
        dueDate: hasKnownDate ? item.date : undefined,
        mode: item.mode,
        origin: hasKnownDate ? "scheduled" as const : "undated" as const,
      }];
    });

  const recurringItems: UpcomingFinanceItem[] = recurringTransactions
    .filter(item => item.status === "active" && (!range.mode || item.mode === range.mode))
    .filter(item => Number.isFinite(item.amount) && item.amount > 0)
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.nextDueDate) && knownDateInRange(item.nextDueDate))
    .map(item => ({
      id: item.id,
      type: item.type,
      description: item.description,
      amount: item.amount,
      dueDate: item.nextDueDate,
      mode: item.mode,
      origin: item.recurrenceType === "installment" ? "installment" : "recurring",
    }));

  const unique = new Map<string, UpcomingFinanceItem>();
  for (const item of [...pendingItems, ...recurringItems]) {
    const key = [
      item.type,
      item.mode,
      item.dueDate || "undated",
      item.amount.toFixed(2),
      normalizedDescription(item.description),
    ].join("|");
    if (!unique.has(key)) unique.set(key, item);
  }

  return [...unique.values()].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.description.localeCompare(b.description, "pt-BR");
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description, "pt-BR");
  });
}

export function buildBalanceForecast(
  mode: FinanceMode,
  currentBalance: number,
  items: UpcomingFinanceItem[],
): BalanceForecast {
  const dated = items.filter(item => item.mode === mode && !!item.dueDate);
  const upcomingIncome = dated
    .filter(item => item.type === "income")
    .reduce((total, item) => total + item.amount, 0);
  const upcomingExpense = dated
    .filter(item => item.type === "expense")
    .reduce((total, item) => total + item.amount, 0);
  return {
    mode,
    currentBalance,
    upcomingIncome,
    upcomingExpense,
    projectedBalance: currentBalance + upcomingIncome - upcomingExpense,
  };
}

function dateLabel(item: UpcomingFinanceItem, today: string, locale?: string): string {
  if (!item.dueDate) {
    if (locale === "es") return "sin fecha definida";
    return "sem data definida";
  }
  const formatted = new Date(item.dueDate + "T12:00:00").toLocaleDateString(
    locale === "es" ? "es-419" : locale === "pt-PT" ? "pt-PT" : "pt-BR",
  );
  if (item.dueDate < today) return locale === "es" ? `pendiente desde el ${formatted}` : `pendente desde ${formatted}`;
  if (item.dueDate === today) return locale === "es" ? "previsto para hoy" : "previsto para hoje";
  return locale === "es" ? `previsto para el ${formatted}` : `previsto para ${formatted}`;
}

function originLabel(origin: UpcomingFinanceOrigin, locale?: string): string {
  const labels = locale === "es"
    ? { scheduled: "programado", undated: "pendiente", recurring: "recurrente", installment: "cuota" }
    : locale === "pt-PT"
      ? { scheduled: "agendada", undated: "pendente", recurring: "recorrente", installment: "prestação" }
      : { scheduled: "agendada", undated: "pendente", recurring: "recorrente", installment: "parcela" };
  return labels[origin];
}

function modeLabel(mode: FinanceMode, locale?: string): string {
  if (mode === "business") return "🏢 Empresa";
  return locale === "es" ? "👤 Personal" : "👤 Pessoal";
}

/** Resposta curta, acionável e com projeção explícita. A previsão usa apenas
 * compromissos com data conhecida; pendências sem vencimento aparecem na
 * lista e são declaradas fora do cálculo para não criar falsa precisão. */
export function replyUpcomingFinances(
  items: UpcomingFinanceItem[],
  requestedType: FinanceType,
  forecasts: BalanceForecast[],
  periodLabel: string,
  today: string,
  locale?: string,
): string {
  const requested = items.filter(item => item.type === requestedType);
  const isIncome = requestedType === "income";
  const noun = locale === "es"
    ? (isIncome
      ? (requested.length === 1 ? "ingreso por cobrar" : "ingresos por cobrar")
      : (requested.length === 1 ? "gasto por pagar" : "gastos por pagar"))
    : locale === "pt-PT"
      ? (isIncome
        ? (requested.length === 1 ? "receita a receber" : "receitas a receber")
        : (requested.length === 1 ? "despesa a pagar" : "despesas a pagar"))
      : (isIncome
        ? (requested.length === 1 ? "receita a receber" : "receitas a receber")
        : (requested.length === 1 ? "despesa para pagar" : "despesas para pagar"));

  let message = requested.length
    ? (locale === "es"
      ? `Encontré *${requested.length} ${noun}* en ${periodLabel}:\n\n`
      : `Encontrei *${requested.length} ${noun}* em ${periodLabel}:\n\n`)
    : (locale === "es"
      ? `No encontré ${noun} en *${periodLabel}*.`
      : `Não encontrei ${noun} em *${periodLabel}*.`);

  requested.slice(0, 20).forEach((item, index) => {
    message += `${index + 1}. ${isIncome ? "💰" : "💸"} *${item.description}* — ${formatCurrency(item.amount)}\n`;
    message += `   📅 ${dateLabel(item, today, locale)} · ${modeLabel(item.mode, locale)} · ${originLabel(item.origin, locale)}\n`;
  });
  if (requested.length > 20) {
    message += locale === "es" ? `\n_Mostré los primeros 20 de ${requested.length}._\n` : `\n_Mostrei os primeiros 20 de ${requested.length}._\n`;
  }

  const requestedTotal = requested.reduce((total, item) => total + item.amount, 0);
  if (requested.length) {
    const totalLabel = locale === "es" ? (isIncome ? "Total por cobrar" : "Total por pagar") : (isIncome ? "Total a receber" : "Total a pagar");
    message += `\n${isIncome ? "💰" : "💸"} *${totalLabel}: ${formatCurrency(requestedTotal)}*`;
  }

  message += locale === "es" ? `\n\n📊 *Previsión para ${periodLabel}*` : `\n\n📊 *Previsão para ${periodLabel}*`;
  for (const forecast of forecasts) {
    message += `\n\n${modeLabel(forecast.mode, locale)}`;
    message += locale === "es"
      ? `\n• Saldo actual del período: ${formatCurrency(forecast.currentBalance)}\n• Por cobrar: ${formatCurrency(forecast.upcomingIncome)}\n• Por pagar: ${formatCurrency(forecast.upcomingExpense)}\n• *Saldo previsto: ${formatCurrency(forecast.projectedBalance)}*`
      : `\n• Saldo atual do período: ${formatCurrency(forecast.currentBalance)}\n• A receber: ${formatCurrency(forecast.upcomingIncome)}\n• A pagar: ${formatCurrency(forecast.upcomingExpense)}\n• *Saldo previsto: ${formatCurrency(forecast.projectedBalance)}*`;
  }

  const undated = requested.filter(item => !item.dueDate);
  if (undated.length) {
    message += locale === "es"
      ? `\n\n_${undated.length} pendiente${undated.length === 1 ? "" : "s"} sin fecha ${undated.length === 1 ? "aparece" : "aparecen"} en la lista, pero no ${undated.length === 1 ? "entra" : "entran"} en la previsión._`
      : `\n\n_${undated.length} pendência${undated.length === 1 ? "" : "s"} sem data aparece${undated.length === 1 ? "" : "m"} na lista, mas não entra${undated.length === 1 ? "" : "m"} na previsão._`;
  }
  return message.trim();
}
