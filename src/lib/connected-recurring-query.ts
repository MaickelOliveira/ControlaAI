import "server-only";
import type { AIResult } from "./ai-processor";
import { getOpenFinanceAccess, type OpenFinanceIdentity } from "./open-finance-access";
import { readBankAgenda } from "./financial-agenda";
import { formatBankSchedules } from "./bank-schedule-answer";
import { formatBankAgenda,visibleBankSchedules } from "./open-finance-schedules";
import {recurringQueryKind,isUnregisteredBankRecurringRequest} from "./recurring-query-kind";
import {descriptionsLikelyMatch,type RecurringTransaction} from "./recurring";
import { expandMerchantAliases, merchantDescriptionMatchesTerms } from "./finances";

/** Every manual recurring answer receives the same bank appendix, including empty/forecast branches. */
export async function connectedRecurringAppendix(user: OpenFinanceIdentity, mode: "personal" | "business", ai: AIResult, message: string, today: string, registered:ReadonlyArray<Pick<RecurringTransaction,"description"|"type"|"recurrenceType">>): Promise<string> {
  if (process.env.OPEN_FINANCE_WHATSAPP_ENABLED !== "true") return "";
  try {
    const scope = await getOpenFinanceAccess(user, mode, { throwOnStorageError: true });
    if (!scope) return "";
    const shift = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const agenda = await readBankAgenda(user, mode, { from: shift(-365), to: shift(365), includeUndated: true, includeObservedInstallments: true });
    const terms = ai.keyword ? expandMerchantAliases(ai.keyword) : null;
    const requestedKind=recurringQueryKind(message);
    const wantsBills=/\b(?:faturas?|facturas?)\b/i.test(message);
    const schedules=ai.period?.to&&ai.period.to<today?agenda.items:visibleBankSchedules(agenda.items,today);
    const comparingManual=isUnregisteredBankRecurringRequest(message);
    const matches=schedules.filter(item=>(!requestedKind||item.kind===requestedKind)&&(!terms||merchantDescriptionMatchesTerms(`${item.description} ${item.institution_name} ${item.resource_name}`,terms)))
      .filter(item=>!comparingManual||item.kind==="recurring"&&!registered.some(manual=>manual.type==="expense"&&manual.recurrenceType==="recurring"&&descriptionsLikelyMatch(item.description,manual.description)));
    const bills=wantsBills?agenda.items.filter(item=>item.kind==="bill"&&(!terms||merchantDescriptionMatchesTerms(`${item.description} ${item.institution_name} ${item.resource_name}`,terms))):[];
    const undated=ai.period?[...matches,...bills].filter(item=>!item.due_date).length:0;
    const selected={...agenda,items:ai.period?matches.filter(item=>item.due_date&&(!ai.period?.from||item.due_date>=ai.period.from)&&(!ai.period?.to||item.due_date<=ai.period.to)):matches,incomplete:agenda.incomplete||undated>0};
    const selectedBills=ai.period?bills.filter(item=>item.due_date&&(!ai.period?.from||item.due_date>=ai.period.from)&&(!ai.period?.to||item.due_date<=ai.period.to)):bills;
    const label = mode === "business" ? `Empresa${scope.companyName ? ` · ${scope.companyName}` : ""}` : "Pessoal";
    if(comparingManual&&!selected.items.length)return `🏦 Não encontrei assinatura bancária sem cadastro manual semelhante nos dados recebidos. Isso não confirma que todas foram cadastradas.${agenda.incomplete?" A consulta bancária está incompleta.":""}`;
    const result = [requestedKind!=="recurring" ? formatBankSchedules(selected, "installments", label) : "", requestedKind!=="installment" ? formatBankSchedules(selected, "recurring", label) : "", wantsBills?formatBankAgenda(selectedBills,agenda.incomplete):""].filter(Boolean).join("\n\n");
    const comparisonNote=comparingManual?"\nNão encontrei cadastro manual semelhante para os itens listados. Nomes diferentes podem impedir a correspondência; confira antes de cadastrar novamente.":"";
    return result + comparisonNote + (undated?`\n\n${undated} item(ns) sem vencimento informado ficaram fora do filtro de datas.`:"") + (ai.installmentForecast ? "\nNão projetei o mês de término dos parcelamentos bancários: parcelas observadas não identificam parcelas pagas nem datas futuras." : "");
  } catch {
    return "🏦 Não consegui consultar os parcelamentos/recorrentes dos bancos agora. A lista manual abaixo não representa todos os seus compromissos bancários; tente novamente em Contas.";
  }
}
