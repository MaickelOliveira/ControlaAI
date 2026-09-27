export type InvoiceTransaction = {
  /** Data contábil usada nos filtros do dashboard (mês da fatura). */
  date: string;
  /** Data impressa da compra, preservada quando difere da competência. */
  purchaseDate?: string;
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
  /** Quantidade de linhas reais na seção de transações do documento,
   * incluindo pagamentos/créditos que não viram despesa. */
  sourceTransactionCount?: number;
  /** Linhas lidas corretamente, mas descartadas por não serem compras. */
  ignoredTransactionCount?: number;
  /** Mês ao qual todas as cobranças desta fatura pertencem. */
  billingReferenceMonth?: string;
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

function subtractOneYear(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${String(year - 1).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Faturas podem trazer compras parceladas de nov/dez numa fatura do ano
 * seguinte. Modelos às vezes aplicam o ano da fatura a todas as linhas e
 * acabam criando datas futuras. Compra já presente numa fatura nunca pode
 * estar depois do dia em que o documento foi processado. */
function normalizeInvoiceDate(rawDate: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return today;
  let date = rawDate;
  while (date > today) date = subtractOneYear(date);
  return date;
}

function normalizeBillingReferenceMonth(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(raw) && Number(raw.slice(5, 7)) >= 1 && Number(raw.slice(5, 7)) <= 12) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  return undefined;
}

function dateInReferenceMonth(purchaseDate: string, referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  const requestedDay = Number(purchaseDate.slice(8, 10));
  const lastDay = new Date(year, month, 0).getDate();
  return `${referenceMonth}-${String(Math.min(requestedDay, lastDay)).padStart(2, "0")}`;
}

/** Normaliza o JSON retornado pelo modelo e mantém apenas cobranças válidas.
 *  Uma compra parcelada continua sendo UM lançamento: somente a parcela que
 *  aparece na fatura atual, nunca o histórico pago ou as parcelas futuras. */
export function normalizeInvoiceExtraction(
  parsed: Record<string, unknown>,
  today: string,
): InvoiceExtraction | null {
  if (!parsed.isInvoice || !Array.isArray(parsed.transactions)) return null;

  const extracted: InvoiceTransaction[] = [];
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
    const date = normalizeInvoiceDate(rawDate, today);
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

    extracted.push({
      date,
      purchaseDate: date,
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

  if (!extracted.length) return null;
  const explicitReferenceMonth = normalizeBillingReferenceMonth(parsed.billingReferenceMonth);
  const latestRegularPurchaseMonth = extracted
    .filter(transaction => !transaction.installmentCurrent)
    .map(transaction => transaction.purchaseDate!.slice(0, 7))
    .sort()
    .at(-1);
  const latestPurchaseMonth = extracted.map(transaction => transaction.purchaseDate!.slice(0, 7)).sort().at(-1);
  // A data mais recente de uma compra não parcelada é a evidência mais
  // confiável do ciclo. Alguns modelos confundem "fatura de setembro" com
  // competência setembro, embora a lista de compras feche em agosto.
  const billingReferenceMonth = latestRegularPurchaseMonth || explicitReferenceMonth || latestPurchaseMonth || today.slice(0, 7);
  const transactions = extracted.map(transaction => ({
    ...transaction,
    date: dateInReferenceMonth(transaction.purchaseDate!, billingReferenceMonth),
  }));
  const bankName = String(parsed.bankName || "").trim() || undefined;
  const rawClosingDay = positiveInteger(parsed.closingDay);
  const rawDueDay = positiveInteger(parsed.dueDay);
  const closingDay = rawClosingDay && rawClosingDay <= 28 ? rawClosingDay : undefined;
  const dueDay = rawDueDay && rawDueDay <= 28 ? rawDueDay : undefined;
  const rawIgnoredCount = positiveInteger(parsed.ignoredTransactionCount);
  const ignoredFromList = Array.isArray(parsed.ignoredTransactions) ? parsed.ignoredTransactions.length : 0;
  const ignoredTransactionCount = rawIgnoredCount ?? (ignoredFromList || undefined);
  const rawSourceCount = positiveInteger(parsed.sourceTransactionCount);
  const sourceTransactionCount = Math.max(
    transactions.length + (ignoredTransactionCount ?? 0),
    rawSourceCount ?? 0,
  ) || undefined;
  return {
    transactions,
    bankName,
    closingDay,
    dueDay,
    sourceTransactionCount,
    ignoredTransactionCount,
    billingReferenceMonth,
  };
}

/** Se quase toda a fatura já existe, o caso mais provável é o mesmo PDF
 * reenviado, não dezenas de compras feitas duas vezes. Mantemos a pergunta
 * de confirmação para conflitos isolados, mas nunca para uma fatura inteira. */
export function isProbableRepeatedInvoice(duplicateFlags: boolean[]): boolean {
  if (duplicateFlags.length < 10) return false;
  const matched = duplicateFlags.filter(Boolean).length;
  return matched / duplicateFlags.length >= 0.8;
}

/** Texto persistido no histórico. A informação fica visível mesmo sem abrir
 *  a prévia da importação e funciona em português e espanhol. */
export function invoiceTransactionDescription(transaction: InvoiceTransaction): string {
  const base = transaction.description.trim() || "Lançamento da fatura";
  const current = transaction.installmentCurrent;
  const total = transaction.installmentTotal;
  const purchaseDate = transaction.purchaseDate && transaction.purchaseDate !== transaction.date
    ? ` · compra em ${transaction.purchaseDate.split("-").reverse().join("/")}`
    : "";
  if (!current || !total || current > total) return `${base}${purchaseDate}`.slice(0, 180);

  const remaining = Math.max(0, transaction.installmentsRemaining ?? total - current);
  const alreadyHasFraction = new RegExp(`\\b0?${current}\\s*\\/\\s*0?${total}\\b`).test(base);
  const installment = alreadyHasFraction ? "" : ` · Parcela ${current}/${total}`;
  return `${base}${installment} · restantes ${remaining}${purchaseDate}`.slice(0, 180);
}
