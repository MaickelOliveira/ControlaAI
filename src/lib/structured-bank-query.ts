import "server-only";
import type { AIResult } from "./ai-processor";
import { getOpenFinanceAccess, type OpenFinanceIdentity } from "./open-finance-access";
import { openFinanceRpc } from "./open-finance-http";
import type { BankOverview } from "./open-finance-display";
import { bankPeriod } from "./open-finance-report";
import { formatBankQuestion, matchingBankNames } from "./bank-question-answer";
import type { BankQuestion } from "./bank-question-parser";
import { BANK_QUERY_GUIDANCE, isBankPositionKind, validateBankQuery } from "./bank-query-intent";
import { readUnifiedFinances } from "./unified-finances";
import { financeCoverageNotice, summarizeFinanceQuery } from "./finance-query";
import { formatBankSchedules } from "./bank-schedule-answer";
import { expandMerchantAliases } from "./finances";
import { bankDate, bankMoney } from "./open-finance-display";
import { financeOrigin, ledgerAmount, type LedgerEntry } from "./finance-ledger";
import { visibleBankSchedules, type BankAgenda } from "./open-finance-schedules";
import { readBankOverview } from "./finance-ledger-storage";

const safe = (value: string) => value.replace(/[\r\n*`_~<>]/g, " ").slice(0, 160);
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const isBankFee = (entry: LedgerEntry) => {
  const category = entry.bank?.source_category ?? "";
  const description = normalize(entry.description);
  return !/\b(?:iof|imposto|tributo|juros?|interest|multa|fine)\b/.test(description)
    && (category === "BANK_FEES" || category.startsWith("BANK_FEES_") || /\b(?:tarifa|anuidade|cesta de servicos|pacote de servicos|taxa bancaria)\b/.test(description));
};

/** Interpretive model supplies query arguments; authenticated storage supplies every value. */
export async function answerStructuredBankQuery(user: OpenFinanceIdentity, mode: "personal" | "business", phoneAccess: string, ai: AIResult, today: string): Promise<string | null> {
  if (ai.intent !== "bank_query") return null;
  if (process.env.OPEN_FINANCE_WHATSAPP_ENABLED !== "true") return "As consultas bancárias pelo WhatsApp estão indisponíveis. Confira Contas no painel.";
  const query = validateBankQuery(ai.bankQuery);
  if (!query || !Number.isFinite(ai.confidence) || ai.confidence < .75) return BANK_QUERY_GUIDANCE;
  const requested = ai.mode ?? mode;
  if (!["personal", "business"].includes(requested) || (phoneAccess !== "both" && phoneAccess !== requested)) return "Este número não tem acesso a esse modo da Zelo.";
  if (ai.personName) return "O banco não identifica qual pessoa da família fez cada compra. Posso consultar os movimentos do banco ou os registros de uma pessoa feitos pela Zelo.";
  if (ai.period != null && (typeof ai.period !== "object" || Array.isArray(ai.period))) return BANK_QUERY_GUIDANCE;
  try {
    const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
    const period = bankPeriod(ai.period?.from ?? (query.kind === "bill_due" ? today : `${today.slice(0, 7)}-01`), ai.period?.to ?? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10));
    if (isBankPositionKind(query.kind) && ai.period && (period.from.slice(0, 7) !== today.slice(0, 7) || period.to.slice(0, 7) !== today.slice(0, 7) || period.to < today || period.from > today)) return BANK_QUERY_GUIDANCE;
    const scope = await getOpenFinanceAccess(user, requested, { throwOnStorageError: true });
    if (!scope) return "A consulta bancária não está disponível nesse modo. Confira seu plano e a conexão em Contas; nenhum valor foi calculado.";
    const label = requested === "business" ? `Empresa${scope.companyName ? ` · ${scope.companyName}` : ""}` : "Pessoal";
    if (query.kind === "bill_due") {
      const agenda = await openFinanceRpc(scope, "zelo_of_agenda", { p_from: period.from, p_to: period.to, p_undated: false }) as BankAgenda;
      if (!agenda || !Array.isArray(agenda.items) || typeof agenda.incomplete !== "boolean") throw Error("BANK_AGENDA_UNAVAILABLE");
      const bankNames = query.bankName ? matchingBankNames(agenda.items.map(item => item.institution_name), query.bankName) : null;
      const items = agenda.items.filter(item => item.kind === "bill" && item.due_date && item.due_date >= period.from && item.due_date <= period.to && (!bankNames || bankNames.includes(item.institution_name)));
      const lines = items.slice(0, 20).map(item => `• ${bankDate(item.due_date)} · ${safe(item.institution_name)} · ${safe(item.resource_name)} · ${bankMoney(item.amount, item.currency)} · ${item.payment_evidence ? "há pagamento informado; confira o saldo" : "pagamento não confirmado"}`);
      return `Faturas com vencimento informado de ${bankDate(period.from)} a ${bankDate(period.to)} · ${safe(label)}\n${lines.join("\n") || "Não recebi faturas com vencimento informado nesse intervalo; isso não confirma ausência de cobrança."}${items.length > 20 ? `\nMostrando 20 de ${items.length}; confira Contas.` : ""}\nOs valores são os recebidos dos bancos; confira se foram pagos.${agenda.incomplete ? " A consulta bancária está incompleta." : ""}`;
    }
    if (isBankPositionKind(query.kind) || query.kind === "installments" || query.kind === "recurring") {
      const data: BankOverview = await readBankOverview(scope);
      if (query.kind !== "installments" && query.kind !== "recurring") return formatBankQuestion(data, { ...query, ...period } as BankQuestion, label);
      const banks = query.bankName ? matchingBankNames(data.connections.filter(c => c.status === "active" && !c.archived_at).map(c => c.institution_name), query.bankName) : null;
      if (banks && !banks.length) return "Não encontrei esse banco conectado no modo e na empresa selecionados. Confira Contas.";
      const cards = query.last4 ? data.resources.filter(r => r.resource_type === "card" && r.identification_last4 === query.last4).map(r => r.id) : null;
      if (cards && !cards.length) return "Não encontrei esse final de cartão nos dados recebidos. Confira Contas.";
      const agenda = data.agenda ?? { items: [], incomplete: true };
      const schedules = visibleBankSchedules(agenda.items, ai.period ? period.from : today);
      const selected = schedules.filter(item => (!banks || banks.includes(item.institution_name)) && (!cards || !!item.resource_id && cards.includes(item.resource_id)) && (!query.keyword || item.description.toLocaleLowerCase().includes(query.keyword.toLocaleLowerCase())));
      const undated = ai.period ? selected.filter(item => !item.due_date).length : 0;
      const items = ai.period ? selected.filter(item => item.due_date && item.due_date >= period.from && item.due_date <= period.to) : selected;
      return formatBankSchedules({ ...agenda, incomplete: agenda.incomplete || undated > 0, items }, query.kind, label) + (undated ? `\n${undated} item(ns) sem vencimento informado ficaram fora do filtro de datas; não é possível determinar quando serão cobrados.` : "");
    }
    const { entries, bank } = await readUnifiedFinances(user, requested, period.from, period.to);
    if (!bank?.overview.connections.length) return "Nenhum banco conectado neste modo. A conexão fica na aba Contas.";
    const banks = query.bankName ? matchingBankNames(bank.overview.connections.map(c => c.institution_name), query.bankName) : null;
    if (banks && !banks.length) return "Não encontrei esse banco no histórico recebido deste modo. Confira Contas.";
    const selected = entries.filter(entry => entry.source === "bank" && (!banks || banks.includes(entry.bank?.institution_name ?? "")));
    if (query.kind === "transactions" && (query.operation || query.direction || query.movementClass)) {
      const matches = selected.filter(entry => entry.mode === requested && entry.status !== "pending" && entry.date >= period.from && entry.date <= period.to
        && (!query.source || entry.bank?.resource_type === query.source)
        && (!query.direction || entry.bank?.direction === query.direction)
        && (!query.category || normalize(entry.category) === normalize(query.category))
        && (!query.keyword || expandMerchantAliases(query.keyword).some(term => normalize(entry.description).includes(normalize(term))))
        && (!query.movementClass || isBankFee(entry)));
      const ordered = query.operation === "max"
        ? matches.filter(entry => entry.bank?.currency === "BRL" && ledgerAmount(entry.bank.amount) !== null).sort((a, b) => Math.abs(ledgerAmount(b.bank!.amount)!) - Math.abs(ledgerAmount(a.bank!.amount)!))
        : matches.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      const shown = ordered.slice(0, query.operation === "max" ? 1 : 20);
      const title = query.movementClass ? "Tarifas bancárias identificadas"
        : query.operation === "max" ? `Maior ${query.direction === "credit" ? "crédito" : "débito"} bancário`
        : `Movimentações bancárias${query.direction ? ` · ${query.direction === "credit" ? "créditos" : "débitos"}` : ""}`;
      const lines = shown.map(entry => `• ${bankDate(entry.date)} · ${safe(entry.description)} · ${bankMoney(entry.bank?.amount, entry.bank?.currency)} · ${safe(financeOrigin(entry))}${entry.included ? "" : " · fora dos totais de gastos/receitas"}`);
      const maxNotice = query.operation === "max" ? "\nMaior entre os movimentos em reais com valor informado; outros valores ou moedas não foram comparados." : "";
      return `${title} · ${bankDate(period.from)} a ${bankDate(period.to)} · ${safe(label)}\n${lines.join("\n") || "Nenhum movimento correspondente recebido no período; isso não confirma que não ocorreu."}${ordered.length > shown.length ? `\nMostrando ${shown.length} de ${ordered.length}; confira Finanças.` : ""}${maxNotice}${financeCoverageNotice(bank, selected)}\nSomente movimentos recebidos dos bancos; registros manuais não entram.`;
    }
    return summarizeFinanceQuery(selected, { ...period, type: query.kind === "income" ? "income" : query.kind === "spending" ? "expense" : "result", source: query.source, category: query.category, keywords: query.keyword ? expandMerchantAliases(query.keyword) : undefined, detail: query.kind === "transactions" }, requested) + financeCoverageNotice(bank, selected) + "\nEsta consulta bancária inclui somente os movimentos recebidos dos bancos; os registros manuais ficam fora.";
  } catch {
    return "Não consegui consultar os dados bancários salvos agora. Confira o período e tente novamente em Contas; não vou informar zero nem um resultado parcial como completo.";
  }
}
