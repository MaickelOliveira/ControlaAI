import type { BankQuestion } from "./bank-question-parser";

export type StructuredBankQuery = {
  kind: BankQuestion["kind"] | "income" | "transactions" | "result" | "installments" | "recurring";
  bankName?: string;
  last4?: string;
  source?: "card" | "account";
  category?: string;
  keyword?: string;
};
const positions = new Set(["loans", "financings", "limits", "balances", "investments", "bills"]);
export const isBankPositionKind = (kind: string) => positions.has(kind);
const kinds = new Set([...positions, "spending", "income", "transactions", "result", "installments", "recurring"]);

/** Model output is untrusted: retain filters only, never tenant IDs or financial values. */
export function validateBankQuery(value: unknown): StructuredBankQuery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.kind !== "string" || !kinds.has(raw.kind)) return null;
  const result: StructuredBankQuery = { kind: raw.kind as StructuredBankQuery["kind"] };
  for (const key of ["bankName", "category", "keyword"] as const) {
    if (raw[key] == null) continue;
    if (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > 80 || /[\u0000-\u001f<>*`~]/.test(raw[key])) return null;
    result[key] = raw[key].trim();
  }
  if (raw.source != null) {
    if (raw.source !== "card" && raw.source !== "account") return null;
    result.source = raw.source;
  }
  if (raw.last4 != null) {
    if (typeof raw.last4 !== "string" || !/^\d{4}$/.test(raw.last4)) return null;
    result.last4 = raw.last4;
  }
  if (isBankPositionKind(result.kind) && (result.category || result.keyword)) return null;
  if (["installments", "recurring"].includes(result.kind) && result.category) return null; // Schedule DTO has no authoritative category.
  if (["spending", "income", "transactions", "result"].includes(result.kind) && result.last4) return null; // Movement DTO has no card ID.
  if (result.source && !["spending", "income", "transactions", "result"].includes(result.kind)) return null;
  return result;
}

export const BANK_QUERY_GUIDANCE = "Posso consultar saldos bancários, crédito disponível/total/utilizado, empréstimos, financiamentos, investimentos, faturas, parcelas, recorrentes e movimentações recebidas. Diga o banco/cartão e o período quando quiser filtrar. Posições de saldo, limite e dívida mostram o dado atual recebido; não há histórico dessas posições. Não vou substituir essa consulta por um resumo de gastos.";
