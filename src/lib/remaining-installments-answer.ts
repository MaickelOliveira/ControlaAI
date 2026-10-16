import { bankAmountWithoutCurrency, bankMoney } from "./open-finance-display";
import { bankInstallmentProgress, type BankAgendaItem } from "./open-finance-schedules";
import type { RecurringTransaction } from "./recurring";

type ManualInstallment = Pick<RecurringTransaction, "description" | "type" | "recurrenceType"> & Partial<Pick<RecurringTransaction, "amount" | "totalInstallments" | "paidInstallments">>;
const safe = (value: string) => value.replace(/[\r\n*`_~<>]/g, " ").slice(0, 100);
function cents(value: string | number | null): number | null {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(String(value))) return null;
  const parsed = Math.round(Number(value) * 100);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function money(totalCents: number, currency: string | null): string {
  const value = (totalCents / 100).toFixed(2);
  return currency ? bankMoney(value, currency) : `${bankAmountWithoutCurrency(value)} (moeda não informada)`;
}

/** Bank observations estimate future installments; they are not proof of paid installments or a debt balance. */
export function formatRemainingKnownInstallments(
  manual: readonly ManualInstallment[],
  bank: readonly BankAgendaItem[],
  modeLabel: string,
  bankIncomplete: boolean,
  bankAvailable: boolean,
): string {
  const manualRows = manual.flatMap(item => {
    const count = item.totalInstallments;
    const paid = item.paidInstallments;
    const unit = cents(item.amount ?? null);
    if (item.type !== "expense" || item.recurrenceType !== "installment" || !Number.isInteger(count)
      || !Number.isInteger(paid) || !count || count < 2 || paid === undefined || paid < 0 || paid >= count || !unit) return [];
    return [{ description: item.description, remaining: count - paid, totalCents: unit * (count - paid) }];
  });
  const bankRows = bank.flatMap(item => {
    const progress = bankInstallmentProgress(item);
    const unit = cents(item.amount);
    if (!progress?.remaining || !unit) return [];
    const totalCents = unit * progress.remaining;
    if (!Number.isSafeInteger(totalCents)) return [];
    return [{ description: item.description, remaining: progress.remaining, totalCents,
      currency: item.currency && /^[A-Z]{3}$/.test(item.currency) ? item.currency : null }];
  });
  const manualCents = manualRows.reduce((sum, item) => sum + item.totalCents, 0);
  const byCurrency = new Map<string | null, number>();
  for (const row of bankRows) if (row.currency) byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.totalCents);
  const lines = [`💳 *Parcelas restantes com valor e quantidade conhecidos · ${safe(modeLabel)}*`];
  lines.push(manualRows.length
    ? `Cadastradas na Zelo: *${money(manualCents, "BRL")}* (${manualRows.length} compra(s)).${manualRows.slice(0, 5).map(row => `\n• ${safe(row.description)}: ${row.remaining} restante(s), ${money(row.totalCents, "BRL")}`).join("")}${manualRows.length > 5 ? `\nMais ${manualRows.length - 5} item(ns) incluídos no subtotal.` : ""}`
    : "Nenhuma parcela manual com valor e quantidade restantes conhecidos.");
  if (!bankAvailable) {
    lines.push("Não consegui consultar os bancos nesta resposta; o valor manual não inclui parcelas bancárias.");
  } else if (!bankRows.length) {
    lines.push("Bancos: nenhuma parcela futura com valor e quantidade suficientes nos dados recebidos.");
  } else {
    const totals = [...byCurrency].map(([currency, total]) => money(total, currency)).join("; ");
    lines.push(`Bancos: ${totals ? `*${totals}* em moeda informada` : "não há subtotal em moeda informada"} (${bankRows.length} compra(s) com parcelas futuras estimadas).${bankRows.slice(0, 8).map(row => `\n• ${safe(row.description)}: ${row.remaining} após a última parcela identificada, ${money(row.totalCents, row.currency)}`).join("")}${bankRows.length > 8 ? `\nMais ${bankRows.length - 8} item(ns) incluídos na análise.` : ""}`);
  }
  if (bankAvailable) lines.push("O banco informa a última parcela identificada, mas isso não confirma pagamento. A conta bancária considera só as parcelas posteriores à observada; a parcela observada pode ainda estar em aberto. Os valores são previsões, não saldo devedor confirmado.");
  if (manualRows.length && bankRows.length) lines.push("Não somei cadastros da Zelo aos bancos porque a mesma compra pode existir nas duas fontes.");
  if (bankRows.some(row=>!row.currency)) lines.push("O banco não informou a moeda de alguns valores; mostrei a projeção de cada um sem incluí-los em qualquer subtotal monetário.");
  if (bankIncomplete) lines.push("A consulta bancária está incompleta; podem faltar compras ou parcelas.");
  return lines.join("\n\n");
}
