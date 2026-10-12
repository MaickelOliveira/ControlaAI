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
    const period = bankPeriod(ai.period?.from ?? `${today.slice(0, 7)}-01`, ai.period?.to ?? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10));
    if (isBankPositionKind(query.kind) && ai.period && (period.from.slice(0, 7) !== today.slice(0, 7) || period.to.slice(0, 7) !== today.slice(0, 7) || period.to < today || period.from > today)) return BANK_QUERY_GUIDANCE;
    const scope = await getOpenFinanceAccess(user, requested, { throwOnStorageError: true });
    if (!scope) return "A consulta bancária não está disponível nesse modo. Confira seu plano e a conexão em Contas; nenhum valor foi calculado.";
    const label = requested === "business" ? `Empresa${scope.companyName ? ` · ${scope.companyName}` : ""}` : "Pessoal";
    if (isBankPositionKind(query.kind) || query.kind === "installments" || query.kind === "recurring") {
      const data = await openFinanceRpc(scope, "zelo_of_overview", { p_environment: scope.environment }) as BankOverview;
      if (query.kind !== "installments" && query.kind !== "recurring") return formatBankQuestion(data, { ...query, ...period } as BankQuestion, label);
      const banks = query.bankName ? matchingBankNames(data.connections.filter(c => c.status === "active" && !c.archived_at).map(c => c.institution_name), query.bankName) : null;
      if (banks && !banks.length) return "Não encontrei esse banco conectado no modo e na empresa selecionados. Confira Contas.";
      const cards = query.last4 ? data.resources.filter(r => r.resource_type === "card" && r.identification_last4 === query.last4).map(r => r.id) : null;
      if (cards && !cards.length) return "Não encontrei esse final de cartão nos dados recebidos. Confira Contas.";
      const agenda = data.agenda ?? { items: [], incomplete: true };
      const selected = agenda.items.filter(item => (!banks || banks.includes(item.institution_name)) && (!cards || !!item.resource_id && cards.includes(item.resource_id)) && (!query.keyword || item.description.toLocaleLowerCase().includes(query.keyword.toLocaleLowerCase())));
      const undated = ai.period ? selected.filter(item => !item.due_date).length : 0;
      const items = ai.period ? selected.filter(item => item.due_date && item.due_date >= period.from && item.due_date <= period.to) : selected;
      return formatBankSchedules({ ...agenda, incomplete: agenda.incomplete || undated > 0, items }, query.kind, label) + (undated ? `\n${undated} item(ns) sem vencimento informado ficaram fora do filtro de datas; não é possível determinar quando serão cobrados.` : "");
    }
    const { entries, bank } = await readUnifiedFinances(user, requested, period.from, period.to);
    if (!bank?.overview.connections.length) return "Nenhum banco conectado neste modo. A conexão fica na aba Contas.";
    const banks = query.bankName ? matchingBankNames(bank.overview.connections.map(c => c.institution_name), query.bankName) : null;
    if (banks && !banks.length) return "Não encontrei esse banco no histórico recebido deste modo. Confira Contas.";
    const selected = entries.filter(entry => entry.source === "bank" && (!banks || banks.includes(entry.bank?.institution_name ?? "")));
    return summarizeFinanceQuery(selected, { ...period, type: query.kind === "income" ? "income" : query.kind === "spending" ? "expense" : "result", source: query.source, category: query.category, keywords: query.keyword ? expandMerchantAliases(query.keyword) : undefined, detail: query.kind === "transactions" }, requested) + financeCoverageNotice(bank, selected) + "\nEsta consulta bancária inclui somente os movimentos recebidos dos bancos; os registros manuais ficam fora.";
  } catch {
    return "Não consegui consultar os dados bancários salvos agora. Confira o período e tente novamente em Contas; não vou informar zero nem um resultado parcial como completo.";
  }
}
