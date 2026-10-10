import type { PolpSnapshot } from "./polp-sandbox";

export type ExistingEntry = {
  id: string; type: string; amount: number; date: string; description: string;
  mode: string; source?: string; accountId?: string | null; cardInvoiceId?: string | null;
};
export type Reconciliation = {
  source: "account" | "card"; sourceId: string; status: "new" | "review" | "payment_or_transfer";
  reason: string; matchingFinanceIds: string[];
};

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(parcela|compra|cartao|credito|debito|lancamento)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function similar(a: string, b: string): boolean {
  const left = normalized(a); const right = normalized(b);
  if (!left || !right) return false;
  if (left === right || (Math.min(left.length, right.length) >= 5 && (left.includes(right) || right.includes(left)))) return true;
  const lt = left.split(" ").filter(token => token.length >= 3);
  const rt = new Set(right.split(" ").filter(token => token.length >= 3));
  return lt.filter(token => rt.has(token)).length >= 2;
}

function daysApart(a: string, b: string): number {
  const first = Date.parse(a.slice(0, 10) + "T12:00:00Z");
  const second = Date.parse(b.slice(0, 10) + "T12:00:00Z");
  return Number.isFinite(first) && Number.isFinite(second) ? Math.abs(first - second) / 86_400_000 : Infinity;
}

function effectiveDate(entry: ExistingEntry): string {
  const match = entry.description.match(/compra em\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : entry.date;
}

function matches(existing: ExistingEntry[], amount: number, date: string, description: string, mode: string, installment?: number | null) {
  return existing.filter(item => {
    if (item.type !== "expense" || item.mode !== mode || Math.abs(item.amount - amount) >= 0.01) return false;
    if (daysApart(effectiveDate(item), date) > 3 || !similar(item.description, description)) return false;
    const fraction = item.description.match(/(?:parcela\s*)?(\d{1,3})\s*\/\s*\d{1,3}/i);
    return !installment || !fraction || Number(fraction[1]) === installment;
  });
}

/** Prévia conservadora: coincidências pedem revisão, nunca são removidas automaticamente. */
export function reconcilePolpSnapshot(snapshot: PolpSnapshot, existing: ExistingEntry[] = [], mode = "personal"): Reconciliation[] {
  const seen = new Set<string>();
  const result: Reconciliation[] = [];
  for (const tx of snapshot.accountTransactions) {
    const sourceId = `account:${tx.accountId}:${tx.id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const transfer = /TRANSFER.*ACCOUNT_TRANSFER|CREDIT_CARD_PAYMENT|BILL_PAYMENT/i.test(tx.category_ref || "")
      || /pagamento\s+(de\s+)?fatura|fatura\s+(do\s+)?cart[aã]o/i.test(tx.transaction_name);
    const debit = tx.credit_debit_type === "DEBITO";
    const amount = Number(tx.transaction_amount?.amount);
    const found = debit && Number.isFinite(amount) ? matches(existing, amount, tx.transaction_date_time, tx.transaction_name, mode) : [];
    result.push({ source: "account", sourceId,
      status: transfer ? "payment_or_transfer" : found.length ? "review" : "new",
      reason: transfer ? "Pagamento de fatura ou transferência: não somar outra despesa" : found.length ? "Possível lançamento já feito pela IA ou manualmente" : "Sem coincidência; conferir antes de importar",
      matchingFinanceIds: found.map(item => item.id) });
  }
  for (const tx of snapshot.cardTransactions) {
    const sourceId = `card:${tx.cardId}:${tx.id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const payment = tx.transaction_type === "PAGAMENTO_FATURA";
    const credit = tx.credit_debit_type === "CREDITO";
    const amount = Number(tx.brazilian_amount?.amount);
    const found = !payment && !credit && Number.isFinite(amount)
      ? matches(existing, amount, tx.transaction_date_time, tx.transaction_name, mode, tx.charge_identificator) : [];
    result.push({ source: "card", sourceId,
      status: payment ? "payment_or_transfer" : credit ? "review" : found.length ? "review" : "new",
      reason: payment ? "Pagamento da fatura: não somar as compras outra vez"
        : credit ? "Crédito ou estorno no cartão: conferir o lançamento original"
        : found.length ? "Possível compra já lançada pela IA ou fatura" : "Sem coincidência; conferir antes de importar",
      matchingFinanceIds: found.map(item => item.id) });
  }
  return result;
}
