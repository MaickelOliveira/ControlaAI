import { bankDate, bankMoney, bankAmountWithoutCurrency } from "./open-finance-display";
import type { BankAgenda } from "./open-finance-schedules";
import { bankAmountTotals } from "./bank-question-answer";
const safe = (text: string) => text.replace(/[\r\n*`_~<>]/g, " ").slice(0, 180);

/** An observed card charge is not proof that its bill was paid. */
export function formatBankSchedules(agenda: BankAgenda, kind: "installments" | "recurring", modeLabel: string): string {
  const items = agenda.items.filter(item => item.kind === (kind === "installments" ? "installment" : "recurring"));
  let result = `🏦 *${kind === "installments" ? "Parcelamentos" : "Recorrentes"} recebidos dos bancos · ${safe(modeLabel)}*`;
  if (!items.length) result += "\nNenhum dado correspondente recebido nesta consulta. Isso não confirma ausência de parcelas ou cobranças nos bancos.";
  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(item.institution_name, [...(groups.get(item.institution_name) ?? []), item]);
  for (const [name, rows] of groups) {
    result += `\n\n*${safe(name)}* · ${rows.length} compra(s)/cobrança(s) recebida(s)\n`;
    result += rows.slice(0, 10).map(item => {
      const value = item.currency ? bankMoney(item.amount, item.currency) : `${bankAmountWithoutCurrency(item.amount)} (moeda não informada)`;
      const observations = kind === "installments" ? `\n${item.observed_installments ?? "?"}/${item.total_installments ?? "?"} parcelas observadas; não confirmam pagamento.` : "\nCobrança recorrente estimada pelo banco.";
      return `• ${safe(item.description)} · ${safe(item.resource_name)}\n${value}${kind === "installments" ? "/parcela" : ""}${observations}\n${item.due_date ? `Vencimento informado: ${bankDate(item.due_date)}` : "Vencimento não informado"} · recebido em ${bankDate(item.synced_at)}.`;
    }).join("\n\n");
    if (kind === "installments") {
      const totals = bankAmountTotals(rows.map(item => ({ amount: item.amount, currency: item.currency })), agenda.incomplete);
      if (totals.length) result += `\nValor de uma parcela de cada compra recebida (não é saldo devedor):\n${totals.join("\n")}`;
    }
    if (rows.length > 10) result += `\nMais ${rows.length - 10} item(ns); consulte Contas. Os subtotais incluem todos os itens recebidos.`;
  }
  if (agenda.incomplete) result += "\nConsulta bancária incompleta: há dados em atualização ou indisponíveis.";
  return result + "\nPagamento, parcelas restantes e data de término só podem ser confirmados com informações do banco. Faturas, parcelas e obrigações manuais não são somadas entre si nem aos gastos realizados.";
}
