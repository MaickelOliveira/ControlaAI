export type PdfIgnoredTransaction = {
  date: string;
  description: string;
  amount: number;
  transactionKind: "payment" | "refund" | "reversal" | "credit" | "cancelled";
};

export type PdfTransactionInventory = {
  sourceTransactionCount: number;
  ignoredTransactions: PdfIgnoredTransaction[];
};

const MONTHS: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

function currencyValue(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/-/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.abs(value) : undefined;
}

function transactionDate(raw: string, today: string): string | undefined {
  const match = raw.match(/^\s*(\d{1,2})\s*[\/.\-]\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?\b/i);
  if (!match) return undefined;
  const day = Number(match[1]);
  const monthToken = match[2].toLocaleLowerCase();
  const month = MONTHS[monthToken] ?? Number(monthToken);
  let year = match[3]
    ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    : Number(today.slice(0, 4));
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined;
  if (!Number.isInteger(day) || day < 1 || day > new Date(year, month, 0).getDate()) return undefined;
  let date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!match[3] && date > today) {
    year -= 1;
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return date;
}

function ignoredKind(line: string): PdfIgnoredTransaction["transactionKind"] {
  if (/pagamento|payment|pago\b/i.test(line)) return "payment";
  if (/estorno|reversal/i.test(line)) return "reversal";
  if (/reembolso|refund/i.test(line)) return "refund";
  if (/cancelad[oa]/i.test(line)) return "cancelled";
  return "credit";
}

/**
 * Faz o inventário das linhas reais de transação que têm data e valor.
 * A IA continua responsável por nomes/categorias, mas pagamentos e créditos
 * com sinal negativo passam a ser evidência determinística para a conciliação.
 */
export function parsePdfTransactionLines(lines: string[], today: string): PdfTransactionInventory {
  const transactionLines = lines
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => transactionDate(line, today) && /R\$\s*-?\s*[\d.]+,\d{2}|-\s*R\$\s*[\d.]+,\d{2}/i.test(line));

  const ignoredTransactions: PdfIgnoredTransaction[] = [];
  for (const line of transactionLines) {
    const negative = line.match(/(?:-\s*R\$|R\$\s*-)\s*([\d.]+,\d{2})/i);
    if (!negative) continue;
    const amount = currencyValue(negative[1]);
    const date = transactionDate(line, today);
    if (!amount || !date) continue;
    const description = line
      .replace(/^\s*\d{1,2}\s*[\/.\-]\s*(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{1,2})(?:\s*[\/.\-]\s*\d{2,4})?\s*/i, "")
      .replace(/(?:-\s*R\$|R\$\s*-)\s*[\d.]+,\d{2}/i, "")
      .replace(/\s+/g, " ")
      .trim() || "Crédito/estorno da fatura";
    ignoredTransactions.push({
      date,
      description,
      amount,
      transactionKind: ignoredKind(line),
    });
  }

  return {
    sourceTransactionCount: transactionLines.length,
    ignoredTransactions,
  };
}

/** Extrai texto por coordenadas para preservar uma linha da tabela por vez. */
export async function extractPdfTransactionInventory(
  buffer: Buffer,
  today: string,
): Promise<PdfTransactionInventory | null> {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) return null;

  try {
    const { getDocument, VerbosityLevel } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      verbosity: VerbosityLevel.ERRORS,
    });
    const pdf = await loadingTask.promise;
    const lines: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const byY = new Map<number, Array<{ x: number; text: string }>>();
        for (const item of content.items) {
          if (!("str" in item) || !("transform" in item)) continue;
          const y = Math.round(item.transform[5] * 2) / 2;
          const current = byY.get(y) ?? [];
          current.push({ x: item.transform[4], text: item.str });
          byY.set(y, current);
        }
        for (const [, row] of [...byY].sort((left, right) => right[0] - left[0])) {
          lines.push(row
            .sort((left, right) => left.x - right.x)
            .map(item => item.text)
            .join(" "));
        }
      }
    } finally {
      await pdf.destroy();
    }
    const inventory = parsePdfTransactionLines(lines, today);
    return inventory.sourceTransactionCount > 0 ? inventory : null;
  } catch {
    // PDFs escaneados ou protegidos continuam no fluxo visual da IA.
    return null;
  }
}

function comparableAmount(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : undefined;
  return currencyValue(String(value ?? ""));
}

function ignoredGroup(value: unknown): "payment" | "adjustment" {
  return /payment|pagamento|pago/i.test(String(value ?? "")) ? "payment" : "adjustment";
}

/** Une a leitura visual da IA com a evidência textual sem duplicar a mesma linha. */
export function mergePdfInventory(
  parsed: Record<string, unknown>,
  inventory: PdfTransactionInventory | null,
): Record<string, unknown> {
  if (!inventory) return parsed;
  const existing = Array.isArray(parsed.ignoredTransactions)
    ? [...parsed.ignoredTransactions] as Array<Record<string, unknown>>
    : [];

  for (const item of inventory.ignoredTransactions) {
    const duplicate = existing.some(candidate => {
      const candidateAmount = comparableAmount(candidate.amount);
      return candidate.date === item.date
        && candidateAmount !== undefined
        && Math.abs(candidateAmount - item.amount) <= 0.009
        && ignoredGroup(candidate.transactionKind) === ignoredGroup(item.transactionKind);
    });
    if (!duplicate) existing.push(item);
  }

  return {
    ...parsed,
    ignoredTransactions: existing,
    ignoredTransactionCount: existing.length,
    // Contagem feita diretamente nas linhas do PDF tem prioridade sobre um
    // número estimado pelo modelo e não varia entre reenvios do mesmo arquivo.
    sourceTransactionCount: inventory.sourceTransactionCount,
    sourceTransactionCountVerified: true,
  };
}
