export type InvoiceTransaction = {
  date: string;
  description: string;
  amount: number;
  category: string;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentsRemaining?: number;
};

export type InvoiceExtraction = {
  transactions: InvoiceTransaction[];
  bankName?: string;
  closingDay?: number;
  dueDay?: number;
};

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function installmentFromDescription(description: string): { current: number; total: number } | null {
  // Só usa o texto como fallback quando a fração está explicitamente marcada
  // como parcela/cuota. Uma fração solta (ex.: HOTEL 05/09) pode ser uma data.
  const match = description.match(/\b(?:parcela|parcel|cuota)\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\b/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  return current >= 1 && total >= current && total <= 120 ? { current, total } : null;
}

/** Normaliza o JSON retornado pelo modelo e mantém apenas cobranças válidas.
 *  Uma compra parcelada continua sendo UM lançamento: somente a parcela que
 *  aparece na fatura atual, nunca o histórico pago ou as parcelas futuras. */
export function normalizeInvoiceExtraction(
  parsed: Record<string, unknown>,
  today: string,
): InvoiceExtraction | null {
  if (!parsed.isInvoice || !Array.isArray(parsed.transactions)) return null;

  const transactions: InvoiceTransaction[] = [];
  for (const rawTransaction of parsed.transactions) {
    const transaction = rawTransaction as Record<string, unknown> | null;
    const billingStatus = String(transaction?.billingStatus || "current").toLocaleLowerCase();
    const transactionKind = String(transaction?.transactionKind || "purchase").toLocaleLowerCase();
    const rawDescription = String(transaction?.description || "").trim();
    if (/past|paid|paga|future|futura|projected|projetada|refund|reversal|estorno|reembolso|cancel/.test(billingStatus)) continue;
    if (/refund|reversal|estorno|reembolso|credit|credito|payment|pagamento|cancel/.test(transactionKind)) continue;
    if (/\b(?:estorno|reembolso|cashback|compra\s+cancelada|lan[cç]amento\s+cancelado|cr[eé]dito\s+recebido|ajuste\s+credor|pagamento\s+(?:recebido|efetuado))\b/i.test(rawDescription)) continue;
    const rawAmount = String(transaction?.amount ?? "0")
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}[,.])/g, "")
      .replace(",", ".");
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const rawDate = String(transaction?.date || "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
    const description = rawDescription.slice(0, 120) || "Lançamento da fatura";
    const category = String(transaction?.category || "Outros");

    let installmentCurrent = positiveInteger(transaction?.installmentCurrent);
    let installmentTotal = positiveInteger(transaction?.installmentTotal);
    if (!installmentCurrent || !installmentTotal) {
      const fallback = installmentFromDescription(description);
      installmentCurrent = installmentCurrent || fallback?.current;
      installmentTotal = installmentTotal || fallback?.total;
    }

    if (!installmentCurrent || !installmentTotal || installmentCurrent > installmentTotal || installmentTotal > 120) {
      installmentCurrent = undefined;
      installmentTotal = undefined;
    }

    transactions.push({
      date,
      description,
      amount,
      category,
      ...(installmentCurrent && installmentTotal ? {
        installmentCurrent,
        installmentTotal,
        installmentsRemaining: installmentTotal - installmentCurrent,
      } : {}),
    });
  }

  if (!transactions.length) return null;
  const bankName = String(parsed.bankName || "").trim() || undefined;
  const rawClosingDay = positiveInteger(parsed.closingDay);
  const rawDueDay = positiveInteger(parsed.dueDay);
  const closingDay = rawClosingDay && rawClosingDay <= 28 ? rawClosingDay : undefined;
  const dueDay = rawDueDay && rawDueDay <= 28 ? rawDueDay : undefined;
  return { transactions, bankName, closingDay, dueDay };
}

/** Texto persistido no histórico. A informação fica visível mesmo sem abrir
 *  a prévia da importação e funciona em português e espanhol. */
export function invoiceTransactionDescription(transaction: InvoiceTransaction): string {
  const base = transaction.description.trim() || "Lançamento da fatura";
  const current = transaction.installmentCurrent;
  const total = transaction.installmentTotal;
  if (!current || !total || current > total) return base;

  const remaining = Math.max(0, transaction.installmentsRemaining ?? total - current);
  const alreadyHasFraction = new RegExp(`\\b0?${current}\\s*\\/\\s*0?${total}\\b`).test(base);
  const installment = alreadyHasFraction ? "" : ` · Parcela ${current}/${total}`;
  return `${base}${installment} · restantes ${remaining}`.slice(0, 180);
}
