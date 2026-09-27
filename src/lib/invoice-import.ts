export type InvoiceTransaction = {
  /** Data de competência usada nos filtros do dashboard. */
  date: string;
  /** Data impressa da compra, preservada para auditoria e deduplicação. */
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
  /** Vencimento completo impresso no documento, quando identificado. */
  dueDate?: string;
  /** Quantidade de linhas reais na seção de transações do documento,
   * incluindo pagamentos/créditos que não viram despesa. */
  sourceTransactionCount?: number;
  /** Linhas lidas corretamente, mas descartadas por não serem compras. */
  ignoredTransactionCount?: number;
  /** Mês de competência ao qual as cobranças desta fatura pertencem. */
  billingReferenceMonth?: string;
  /** Mês impresso de vencimento/pagamento da fatura. */
  statementReferenceMonth?: string;
  /** Total líquido impresso como valor final da fatura. */
  statementTotal?: number;
  /** Indica se a soma dos lançamentos líquidos confere com o total impresso. */
  reconciled?: boolean;
  /** Diferença, em reais, entre os lançamentos e o total impresso. */
  reconciliationDifference?: number;
};

function csvText(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function normalizeCsvHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function csvDelimiter(lines: string[]): string {
  const candidates = [";", "\t", ","];
  return candidates.sort((a, b) => {
    const score = (delimiter: string) => lines.slice(0, 20).reduce((sum, line) => sum + (line.split(delimiter).length - 1), 0);
    return score(b) - score(a);
  })[0];
}

function csvDate(value: string): string | undefined {
  const raw = value.trim();
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const parts = br ? [Number(br[3]), Number(br[2]), Number(br[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : null;
  if (!parts) return undefined;
  const [year, month, day] = parts;
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function moneyValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const negative = /^\s*-/.test(raw) || /^\s*\(/.test(raw);
  let cleaned = raw.replace(/[^\d,.-]/g, "").replace(/[()-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    cleaned = cleaned.replace(thousandsSeparator, "");
    if (decimalSeparator === ",") cleaned = cleaned.replace(",", ".");
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    cleaned = decimals >= 1 && decimals <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = cleaned.length - lastDot - 1;
    if (decimals < 1 || decimals > 2) cleaned = cleaned.replace(/\./g, "");
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -parsed : parsed;
}

function csvMoney(value: string): number | undefined {
  return moneyValue(value);
}

function csvInstallment(value: string): { current: number; total: number } | undefined {
  const match = value.match(/(?:\(|\b)(\d{1,3})\s*\/\s*(\d{1,3})(?:\)|\b)/);
  if (!match) return undefined;
  const current = Number(match[1]);
  const total = Number(match[2]);
  return current >= 1 && total >= current && total <= 120 ? { current, total } : undefined;
}

function csvCategory(description: string): string {
  const normalized = normalizeCsvHeader(description);
  if (/mercad|supermerc|condor|ifd|ifood|restaurante|lanch|esfih|acai|alimento/.test(normalized)) return "Alimentação";
  if (/farmac|hospital|clinica|diagnosti|medic|odont|laboratorio/.test(normalized)) return "Saúde";
  if (/academia|cinema|parque|viagem|hotel|show/.test(normalized)) return "Lazer";
  if (/uber|posto|combust|pedagio|estacion|transporte/.test(normalized)) return "Transporte";
  if (/havan|material|condominio|aluguel|energia|moveis/.test(normalized)) return "Moradia";
  if (/lojas|roupa|calcado|moda/.test(normalized)) return "Vestuário";
  if (/escola|curso|faculdade|livraria/.test(normalized)) return "Educação";
  if (/asaas|assinatura|mensalidade|servico/.test(normalized)) return "Serviços";
  if (/software|apple|google|microsoft|tecnologia/.test(normalized)) return "Tecnologia";
  return "Outros";
}

function findInvoiceCsvHeader(rows: string[][]): number {
  return rows.findIndex(row => {
    const headers = row.map(normalizeCsvHeader);
    return headers.includes("data")
      && headers.some(value => /descricao|historico|estabelecimento|merchant/.test(value))
      && headers.some(value => /^valor$|amount|valor da compra/.test(value));
  });
}

/** Detecta uma planilha textual de fatura pelo conteúdo, sem confiar apenas
 * na extensão/MIME enviados pelo WhatsApp. */
export function isLikelyInvoiceCsv(buffer: Buffer, mimeType = "", originalName = ""): boolean {
  const formatHint = /csv|text\/(?:plain|comma-separated-values)/i.test(mimeType) || /\.csv$/i.test(originalName);
  if (!formatHint) return false;
  const lines = csvText(buffer).split(/\r?\n/).filter(line => line.trim()).slice(0, 40);
  if (lines.length < 2) return false;
  const delimiter = csvDelimiter(lines);
  return findInvoiceCsvHeader(lines.map(line => parseCsvLine(line, delimiter))) >= 0;
}

/** Lê CSVs de fatura de forma determinística, linha por linha. Isso evita que
 * uma planilha seja confundida com um comprovante simples e vire apenas um
 * lançamento com o total final do documento. */
export function parseInvoiceCsv(
  buffer: Buffer,
  today: string,
  originalName = "",
): InvoiceExtraction | null {
  const lines = csvText(buffer).split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return null;
  const delimiter = csvDelimiter(lines);
  const rows = lines.map(line => parseCsvLine(line, delimiter));
  const headerIndex = findInvoiceCsvHeader(rows);
  if (headerIndex < 0) return null;

  const headers = rows[headerIndex].map(normalizeCsvHeader);
  const columnIndex = (patterns: RegExp[]) => headers.findIndex(header => patterns.some(pattern => pattern.test(header)));
  const dateIndex = columnIndex([/^data$/, /^date$/]);
  const descriptionIndex = columnIndex([/descricao/, /historico/, /estabelecimento/, /merchant/]);
  const amountIndex = columnIndex([/^valor$/, /amount/, /valor da compra/]);
  const installmentIndex = columnIndex([/parcela/, /cuota/, /installment/]);
  if (dateIndex < 0 || descriptionIndex < 0 || amountIndex < 0) return null;

  const metadata = rows.slice(0, headerIndex);
  const metadataValue = (pattern: RegExp) => metadata.find(row => pattern.test(normalizeCsvHeader(row[0] || "")))?.[1]?.trim();
  const dueDate = csvDate(metadataValue(/vencimento|due date|fecha de vencimiento/) || "");
  const statementTotal = csvMoney(metadataValue(/valor total|total da fatura|total factura|importe total/) || "");
  const contentSignature = normalizeCsvHeader(lines.slice(0, headerIndex + 1).join(" "));
  const bankName = /sicredi/i.test(originalName)
    || (/associado/.test(contentSignature) && /cooperativa/.test(contentSignature) && /conta corrente/.test(contentSignature))
    ? "Sicredi"
    : undefined;

  const transactions: Array<Record<string, unknown>> = [];
  const ignoredTransactions: Array<Record<string, unknown>> = [];
  let ignoredTransactionCount = 0;
  let sourceTransactionCount = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const rawDate = row[dateIndex] || "";
    const description = (row[descriptionIndex] || "").trim();
    const amount = csvMoney(row[amountIndex] || "");
    if (!rawDate.trim() && !description && amount === undefined) continue;
    const date = csvDate(rawDate);
    if (!date || !description || amount === undefined) continue;
    sourceTransactionCount += 1;

    const nonPurchase = amount <= 0 || /\b(?:pagamento|payment|pago|estorno|reembolso|refund|reversal|cashback|credito|cr[eé]dito|cancelad[oa])\b/i.test(description);
    if (nonPurchase) {
      ignoredTransactionCount += 1;
      ignoredTransactions.push({
        date,
        description,
        amount: Math.abs(amount),
        transactionKind: /pagamento|payment|pago/i.test(description) ? "payment" : "reversal",
      });
      continue;
    }

    const installment = installmentIndex >= 0 ? csvInstallment(row[installmentIndex] || "") : undefined;
    transactions.push({
      date,
      description,
      amount,
      category: csvCategory(description),
      ...(installment ? { installmentCurrent: installment.current, installmentTotal: installment.total } : {}),
      billingStatus: "current",
      transactionKind: "purchase",
    });
  }

  if (!transactions.length) return null;
  return normalizeInvoiceExtraction({
    isInvoice: true,
    bankName,
    dueDate,
    dueDay: dueDate ? Number(dueDate.slice(8, 10)) : undefined,
    sourceTransactionCount,
    ignoredTransactionCount,
    ignoredTransactions,
    statementTotal,
    statementReferenceMonth: dueDate?.slice(0, 7),
    transactions,
  }, today);
}

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

function normalizeIsoDate(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const [year, month, day] = raw.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return undefined;
  return raw;
}

function dateInReferenceMonth(purchaseDate: string, referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  const requestedDay = Number(purchaseDate.slice(8, 10));
  const lastDay = new Date(year, month, 0).getDate();
  return `${referenceMonth}-${String(Math.min(requestedDay, lastDay)).padStart(2, "0")}`;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizedMerchant(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\b(?:estorno|reembolso|refund|reversal|credito|credit|cancelad[oa]|ajuste)\b/g, " ")
    .replace(/\b(?:brasil|brazil|sao paulo|curitiba|rio de janeiro|br)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function merchantDescriptionsMatch(left: unknown, right: unknown): boolean {
  const a = normalizedMerchant(left);
  const b = normalizedMerchant(right);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const leftTokens = new Set(a.split(/\s+/).filter(token => token.length >= 3));
  const rightTokens = new Set(b.split(/\s+/).filter(token => token.length >= 3));
  if (!leftTokens.size || !rightTokens.size) return false;
  const overlap = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return overlap >= Math.min(2, leftTokens.size, rightTokens.size);
}

/** Remove a compra positiva quando a própria fatura também traz um estorno
 *  correspondente. Ignorar só a linha negativa faria o total ficar maior do
 *  que o valor realmente cobrado. */
function removeReversedPurchases(
  purchases: InvoiceTransaction[],
  ignoredTransactions: unknown,
): { purchases: InvoiceTransaction[]; removedCount: number } {
  if (!Array.isArray(ignoredTransactions) || ignoredTransactions.length === 0) {
    return { purchases, removedCount: 0 };
  }

  const removed = new Set<number>();
  for (const rawIgnored of ignoredTransactions) {
    const ignored = rawIgnored as Record<string, unknown> | null;
    const kind = String(ignored?.transactionKind ?? "").toLocaleLowerCase();
    const description = String(ignored?.description ?? "");
    const isPayment = /payment|pagamento|pago/.test(kind)
      || /pagamento\s+(?:da\s+)?fatura|payment\s+(?:of\s+)?statement/i.test(description);
    const canCancelPurchase = !isPayment && (/refund|reversal|estorno|reembolso|cancel|credit|credito/.test(kind)
      || /estorno|reembolso|refund|reversal|cancelad[oa]|cr[eé]dito/i.test(description));
    const amount = Math.abs(moneyValue(ignored?.amount) ?? 0);
    if (!canCancelPurchase || amount <= 0) continue;

    const sameAmount = purchases
      .map((purchase, index) => ({ purchase, index }))
      .filter(({ purchase, index }) => !removed.has(index) && Math.abs(purchase.amount - amount) <= 0.009);
    const matchingMerchant = sameAmount.filter(({ purchase }) => merchantDescriptionsMatch(purchase.description, description));
    const match = matchingMerchant[0] ?? (sameAmount.length === 1 ? sameAmount[0] : undefined);
    if (match) removed.add(match.index);
  }

  return {
    purchases: purchases.filter((_, index) => !removed.has(index)),
    removedCount: removed.size,
  };
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
    const amount = moneyValue(transaction?.amount);
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0) continue;

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

  const reversalResult = removeReversedPurchases(extracted, parsed.ignoredTransactions);
  const netPurchases = reversalResult.purchases;
  if (!netPurchases.length) return null;
  const explicitReferenceMonth = normalizeBillingReferenceMonth(parsed.billingReferenceMonth);
  const latestRegularPurchaseMonth = netPurchases
    .filter(transaction => !transaction.installmentCurrent)
    .map(transaction => transaction.purchaseDate!.slice(0, 7))
    .sort()
    .at(-1);
  const latestPurchaseMonth = netPurchases.map(transaction => transaction.purchaseDate!.slice(0, 7)).sort().at(-1);
  // O mês explicitamente impresso/extraído da fatura tem prioridade. Sem
  // ele, a compra não parcelada mais recente é a melhor evidência do ciclo.
  // Todas as parcelas atuais ficam nesse mês de competência; vencimento é
  // guardado separadamente e nunca muda a data contábil das compras.
  const billingReferenceMonth = explicitReferenceMonth || latestRegularPurchaseMonth || latestPurchaseMonth || today.slice(0, 7);
  const statementReferenceMonth = normalizeBillingReferenceMonth(parsed.statementReferenceMonth);
  const bankName = String(parsed.bankName || "").trim() || undefined;
  const rawClosingDay = positiveInteger(parsed.closingDay);
  const rawDueDay = positiveInteger(parsed.dueDay);
  const dueDate = normalizeIsoDate(parsed.dueDate);
  const transactions = netPurchases.map(transaction => ({
    ...transaction,
    date: dateInReferenceMonth(transaction.purchaseDate!, billingReferenceMonth),
  }));
  const closingDay = rawClosingDay && rawClosingDay <= 28 ? rawClosingDay : undefined;
  const dueDay = rawDueDay && rawDueDay <= 28 ? rawDueDay : undefined;
  const rawIgnoredCount = positiveInteger(parsed.ignoredTransactionCount);
  const ignoredFromList = Array.isArray(parsed.ignoredTransactions) ? parsed.ignoredTransactions.length : 0;
  const baseIgnoredCount = Math.max(rawIgnoredCount ?? 0, ignoredFromList);
  const rawSourceCount = positiveInteger(parsed.sourceTransactionCount);
  const ignoredTransactionCount = Math.max(
    baseIgnoredCount + reversalResult.removedCount,
    (rawSourceCount ?? 0) - transactions.length,
  ) || undefined;
  const sourceTransactionCount = Math.max(
    transactions.length + (ignoredTransactionCount ?? 0),
    rawSourceCount ?? 0,
  ) || undefined;
  const statementTotal = moneyValue(parsed.statementTotal ?? parsed.invoiceTotal ?? parsed.totalDue);
  const transactionTotal = roundCurrency(transactions.reduce((sum, transaction) => sum + transaction.amount, 0));
  const reconciliationDifference = statementTotal === undefined
    ? undefined
    : roundCurrency(transactionTotal - statementTotal);
  const reconciled = reconciliationDifference === undefined
    ? undefined
    : Math.abs(reconciliationDifference) <= 0.01;
  return {
    transactions,
    bankName,
    closingDay,
    dueDay,
    dueDate,
    sourceTransactionCount,
    ignoredTransactionCount,
    billingReferenceMonth,
    statementReferenceMonth: statementReferenceMonth || dueDate?.slice(0, 7),
    statementTotal: statementTotal === undefined ? undefined : roundCurrency(statementTotal),
    reconciled,
    reconciliationDifference,
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
