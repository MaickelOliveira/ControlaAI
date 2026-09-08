import { formatCurrency, translateCategory, type Finance, type FinanceMode, type FinanceType } from "./finances";
import type { UpcomingFinanceItem } from "./upcoming-finances";

type DetailOptions = {
  type: FinanceType;
  mode: FinanceMode;
  periodLabel: string;
  locale?: string;
  keyword?: string;
};

function labels(type: FinanceType, locale?: string) {
  if (locale === "es") {
    return type === "income"
      ? { plural: "Ingresos", singular: "ingreso", realizedItem: "recibido", realizedTotal: "recibido", scheduled: "por cobrar" }
      : { plural: "Gastos", singular: "gasto", realizedItem: "pagado", realizedTotal: "pagado", scheduled: "por pagar" };
  }
  return type === "income"
    ? { plural: "Receitas", singular: "receita", realizedItem: "recebida", realizedTotal: "recebido", scheduled: "a receber" }
    : { plural: "Despesas", singular: "despesa", realizedItem: "paga", realizedTotal: "pago", scheduled: "a pagar" };
}

function modeLabel(mode: FinanceMode, locale?: string): string {
  if (mode === "business") return "Empresa";
  return locale === "es" ? "Personal" : "Pessoal";
}

function originLabel(origin: UpcomingFinanceItem["origin"], locale?: string): string {
  if (locale === "es") {
    return { scheduled: "programado", undated: "sin fecha", recurring: "recurrente", installment: "cuota" }[origin];
  }
  if (locale === "pt-PT") {
    return { scheduled: "agendada", undated: "sem data", recurring: "recorrente", installment: "prestação" }[origin];
  }
  return { scheduled: "agendada", undated: "sem data", recurring: "recorrente", installment: "parcela" }[origin];
}

function dateLabel(date: string | undefined, locale?: string): string {
  if (!date) return locale === "es" ? "sin fecha definida" : "sem data definida";
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale === "es" ? "es-419" : locale === "pt-PT" ? "pt-PT" : "pt-BR");
}

/** Monta o extrato realizado e, separadamente, os valores já programados.
 * Assim um recorrente futuro não some da resposta nem é apresentado como se
 * já tivesse entrado no saldo. */
export function replyFinanceDetail(
  posted: Finance[],
  upcoming: UpcomingFinanceItem[],
  options: DetailOptions,
): string {
  const text = labels(options.type, options.locale);
  const mode = modeLabel(options.mode, options.locale);
  const subject = options.keyword ? `: ${options.keyword}` : "";

  if (!posted.length && !upcoming.length) {
    if (options.locale === "es") {
      return `📋 No hay ningún ${text.singular} registrado ni programado${subject} en *${options.periodLabel}* (${mode}).`;
    }
    return `📋 Nenhuma ${text.singular} registrada ou programada${subject} em *${options.periodLabel}* (${mode}).`;
  }

  let message = `📋 *${text.plural}${subject} — ${options.periodLabel}*\n_(${mode})_\n\n`;

  if (posted.length) {
    const byCategory = new Map<string, { items: Finance[]; total: number }>();
    for (const item of posted) {
      const category = translateCategory(item.category, item.type, options.locale);
      const group = byCategory.get(category) ?? { items: [], total: 0 };
      group.items.push(item);
      group.total += item.amount;
      byCategory.set(category, group);
    }

    for (const [category, group] of [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total)) {
      message += `${options.type === "income" ? "🟢" : "🔴"} *${category}* — ${formatCurrency(group.total)}\n`;
      for (const item of group.items) {
        message += `   • ${item.description} — ${formatCurrency(item.amount)} _(${dateLabel(item.date, options.locale)})_\n`;
      }
      message += "\n";
    }
    const total = posted.reduce((sum, item) => sum + item.amount, 0);
    message += `${options.type === "income" ? "💰" : "💸"} *Total ${text.realizedTotal}: ${formatCurrency(total)}*`;
  } else {
    message += options.locale === "es"
      ? `_No hay ningún ${text.singular} ya ${text.realizedItem} en este período._`
      : `_Nenhuma ${text.singular} já ${text.realizedItem} neste período._`;
  }

  if (upcoming.length) {
    message += options.locale === "es"
      ? `\n\n⏳ *Programados / ${text.scheduled}*\n`
      : `\n\n⏳ *Programadas / ${text.scheduled}*\n`;
    for (const item of upcoming.slice(0, 20)) {
      message += `• *${item.description}* — ${formatCurrency(item.amount)}\n`;
      message += `  📅 ${dateLabel(item.dueDate, options.locale)} · ${originLabel(item.origin, options.locale)}\n`;
    }
    if (upcoming.length > 20) {
      message += options.locale === "es"
        ? `_Mostré los primeros 20 de ${upcoming.length}._\n`
        : `_Mostrei os primeiros 20 de ${upcoming.length}._\n`;
    }
    const upcomingTotal = upcoming.reduce((sum, item) => sum + item.amount, 0);
    message += `\n${options.type === "income" ? "💰" : "💸"} *${options.locale === "es" ? "Total" : "Total"} ${text.scheduled}: ${formatCurrency(upcomingTotal)}*`;
    message += options.locale === "es"
      ? "\n_Estos valores todavía no forman parte del saldo realizado._"
      : "\n_Esses valores ainda não fazem parte do saldo realizado._";
  }

  return message.trim();
}
