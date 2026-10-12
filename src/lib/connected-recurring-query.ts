import "server-only";
import type { AIResult } from "./ai-processor";
import { getOpenFinanceAccess, type OpenFinanceIdentity } from "./open-finance-access";
import { readBankAgenda } from "./financial-agenda";
import { formatBankSchedules } from "./bank-schedule-answer";
import { normalizeBankText } from "./bank-question-parser";
import { expandMerchantAliases, merchantDescriptionMatchesTerms } from "./finances";

/** Every manual recurring answer receives the same bank appendix, including empty/forecast branches. */
export async function connectedRecurringAppendix(user: OpenFinanceIdentity, mode: "personal" | "business", ai: AIResult, message: string, today: string): Promise<string> {
  if (process.env.OPEN_FINANCE_WHATSAPP_ENABLED !== "true") return "";
  try {
    const scope = await getOpenFinanceAccess(user, mode, { throwOnStorageError: true });
    if (!scope) return "";
    const shift = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const agenda = await readBankAgenda(user, mode, { from: shift(-365), to: shift(365), includeUndated: true, includeObservedInstallments: true });
    const terms = ai.keyword ? expandMerchantAliases(ai.keyword) : null;
    const selected = { ...agenda, items: agenda.items.filter(item => !terms || merchantDescriptionMatchesTerms(`${item.description} ${item.institution_name} ${item.resource_name}`, terms)) };
    const text = normalizeBankText(message);
    const installmentsOnly = /\b(parcel\w*|prestacoes?)\b/.test(text) && !/\b(recorrentes?|assinaturas?)\b/.test(text);
    const recurringOnly = /\b(recorrentes?|assinaturas?)\b/.test(text) && !/\b(parcel\w*|prestacoes?)\b/.test(text);
    const label = mode === "business" ? `Empresa${scope.companyName ? ` · ${scope.companyName}` : ""}` : "Pessoal";
    const result = [!recurringOnly ? formatBankSchedules(selected, "installments", label) : "", !installmentsOnly ? formatBankSchedules(selected, "recurring", label) : ""].filter(Boolean).join("\n\n");
    return result + (ai.installmentForecast ? "\nNão projetei o mês de término dos parcelamentos bancários: parcelas observadas não identificam parcelas pagas nem datas futuras." : "");
  } catch {
    return "🏦 Não consegui consultar os parcelamentos/recorrentes dos bancos agora. A lista manual abaixo não representa todos os seus compromissos bancários; tente novamente em Contas.";
  }
}
