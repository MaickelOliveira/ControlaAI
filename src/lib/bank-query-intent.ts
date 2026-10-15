import type { BankQuestion } from "./bank-question-parser";

export type StructuredBankQuery = {
  kind: BankQuestion["kind"] | "income" | "transactions" | "result" | "installments" | "recurring" | "bill_due";
  bankName?: string;
  last4?: string;
  source?: "card" | "account";
  operation?: "list" | "max";
  direction?: "debit" | "credit";
  movementClass?: "bank_fee";
  category?: string;
  keyword?: string;
};
const positions = new Set(["loans", "financings", "limits", "balances", "investments", "bills"]);
export const isBankPositionKind = (kind: string) => positions.has(kind);
const kinds = new Set([...positions, "spending", "income", "transactions", "result", "installments", "recurring", "bill_due"]);

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
  if (raw.operation != null) {
    if (raw.kind !== "transactions" || (raw.operation !== "list" && raw.operation !== "max")) return null;
    result.operation = raw.operation;
  }
  if (raw.direction != null) {
    if (raw.kind !== "transactions" || (raw.direction !== "debit" && raw.direction !== "credit")) return null;
    result.direction = raw.direction;
  }
  if (raw.movementClass != null) {
    if (raw.kind !== "transactions" || raw.movementClass !== "bank_fee") return null;
    result.movementClass = "bank_fee";
  }
  if (raw.last4 != null) {
    if (typeof raw.last4 !== "string" || !/^\d{4}$/.test(raw.last4)) return null;
    result.last4 = raw.last4;
  }
  if (isBankPositionKind(result.kind) && (result.category || (result.keyword && !["loans", "financings"].includes(result.kind)))) return null;
  if (["installments", "recurring"].includes(result.kind) && result.category) return null; // Schedule DTO has no authoritative category.
  if (["spending", "income", "transactions", "result"].includes(result.kind) && result.last4) return null; // Movement DTO has no card ID.
  if (result.source && !["spending", "income", "transactions", "result"].includes(result.kind)) return null;
  if (result.kind === "bill_due" && (result.category || result.keyword || result.source || result.last4)) return null;
  if (result.movementClass && (result.source && result.source !== "account" || result.direction && result.direction !== "debit")) return null;
  if (result.operation === "max" && !result.direction) return null;
  return result;
}

export const BANK_QUERY_GUIDANCE = "Posso consultar saldos bancários, crédito disponível/total/utilizado, empréstimos, financiamentos, investimentos, faturas, parcelas, recorrentes e movimentações recebidas. Diga o banco/cartão e o período quando quiser filtrar. Posições de saldo, limite e dívida mostram o dado atual recebido; não há histórico dessas posições. Não vou substituir essa consulta por um resumo de gastos.";

/** A narrow read-only guard for unmistakable bank requests the model may classify too broadly. */
export function explicitBankQueryPlan(message: string): StructuredBankQuery | null {
  const text = message.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/\b(?:registr|cadastr|cri[ae]|exclu|apag|alter|edit|corrig|paguei)\w*/.test(text)) return null;
  if (/\b(?:maior|mais alto|mais alta)\b/.test(text) && /\b(?:bancari[oa]|conta bancaria|extrato bancario)\b/.test(text)) {
    const direction = /\bdebito\b/.test(text) ? "debit" : /\bcredito\b/.test(text) ? "credit" : null;
    if (direction) return { kind: "transactions", operation: "max", direction, source: "account" };
  }
  if (/\b(?:mostre|liste|quais|qual|consulte|ver)\b/.test(text) && /\b(?:tarifas? bancarias?|taxas? bancarias?)\b/.test(text))
    return { kind: "transactions", operation: "list", direction: "debit", source: "account", movementClass: "bank_fee" };
  if (/\b(?:quais|qual|mostre|liste)\b/.test(text) && /\bfaturas?\b/.test(text) && /\bvenc\w*/.test(text))
    return { kind: "bill_due" };
  return null;
}
