import { describe, expect, it } from "vitest";
import { invoiceTransactionDescription, isLikelyInvoiceCsv, isProbableRepeatedInvoice, normalizeInvoiceExtraction, parseInvoiceCsv } from "./invoice-import";

const SICREDI_CSV = `\uFEFF Associado ;Cliente Teste;;;;
 Cooperativa ;0726;;;;
 Conta Corrente ;00000-0;;;;
 Cartão Mastercard Gold;;;;;

 Data de Vencimento ;10/11/2026;;;;
 Valor Total ;"R$ 2.260,04";;;;

 Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ; Adicional ; Nome;
27/09/2026;CONDOR CPO MOURAO LJ41;;"R$ 277,58";;;Cliente Teste
27/09/2026;AMAZONAS MERCAD;;"R$ 179,60";;;Cliente Teste
26/09/2026;AMAZONAS MERCAD;;"R$ 16,90";;;Cliente Teste
26/09/2026;23.215.713 EDER FRANCI;;"R$ 50,00";;;Cliente Teste
26/09/2026;AMAZONAS MERCAD;;"R$ 49,77";;;Cliente Teste
26/09/2026;AMAZONAS MERCAD;;"R$ 54,65";;;Cliente Teste
26/09/2026;IFD*KARMUS ESFIHARIA E;;"R$ 106,38";;;Cliente Teste
25/09/2026;AMAZONAS MERCAD;;"R$ 135,14";;;Cliente Teste
31/08/2026;CENTRO DE DIAGNOSTI;(02/04);"R$ 423,00";;;Cliente Teste
06/08/2026;LOJAS G;(03/10);"R$ 74,77";;;Cliente Teste
29/07/2026;ACADEMIA PARQUE DO;(03/06);"R$ 283,33";;;Cliente Teste
15/06/2026;HAVAN CAMPO MOURAO;(05/05);"R$ 309,92";;;Cliente Teste
27/11/2025;ASAAS *Tintim;(11/12);"R$ 299,00";;5912;Cliente Teste`;

describe("parseInvoiceCsv", () => {
  it("imports every Sicredi row instead of treating the invoice total as one expense", () => {
    const buffer = Buffer.from(SICREDI_CSV);
    expect(isLikelyInvoiceCsv(buffer, "text/csv", "sicredi_atualizada.csv")).toBe(true);

    const result = parseInvoiceCsv(buffer, "2026-09-27", "sicredi_atualizada.csv");
    expect(result).toMatchObject({
      bankName: "Sicredi",
      dueDate: "2026-11-10",
      sourceTransactionCount: 13,
    });
    expect(result?.transactions).toHaveLength(13);
    expect(result?.transactions.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(2260.04, 2);
    expect(result?.transactions.map(item => item.date)).toEqual(Array(13).fill("2026-11-10"));
    expect(result?.transactions.some(item => item.description.includes("Valor Total"))).toBe(false);
  });

  it("preserves installments and calculates the exact September Amazonas spend", () => {
    const result = parseInvoiceCsv(Buffer.from(SICREDI_CSV), "2026-09-27", "sicredi.csv");
    const amazonas = result!.transactions.filter(item => item.description === "AMAZONAS MERCAD" && item.purchaseDate?.startsWith("2026-09"));
    expect(amazonas).toHaveLength(5);
    expect(amazonas.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(436.06, 2);
    expect(result?.transactions.find(item => item.description === "LOJAS G")).toMatchObject({
      purchaseDate: "2026-08-06",
      installmentCurrent: 3,
      installmentTotal: 10,
      installmentsRemaining: 7,
    });
  });
});

describe("normalizeInvoiceExtraction", () => {
  it("keeps only the installment billed now and calculates how many remain", () => {
    const result = normalizeInvoiceExtraction({
      isInvoice: true,
      bankName: "Nubank",
      closingDay: 8,
      dueDay: 15,
      dueDate: "2026-09-15",
      transactions: [
        { date: "2026-09-10", description: "Mercado Central", amount: "89,90", category: "Alimentação", installmentCurrent: 3, installmentTotal: 10, billingStatus: "current" },
        { date: "2026-08-10", description: "Mercado Central", amount: 89.9, category: "Alimentação", installmentCurrent: 2, installmentTotal: 10, billingStatus: "past_paid" },
        { date: "2026-10-10", description: "Mercado Central", amount: 89.9, category: "Alimentação", installmentCurrent: 4, installmentTotal: 10, billingStatus: "future_projected" },
        { date: "2026-09-12", description: "Estorno Mercado Central", amount: 89.9, category: "Alimentação", transactionKind: "reversal", billingStatus: "current" },
      ],
    }, "2026-09-27");

    expect(result).toMatchObject({ bankName: "Nubank", closingDay: 8, dueDay: 15 });
    expect(result?.transactions).toEqual([expect.objectContaining({
      date: "2026-09-15",
      purchaseDate: "2026-09-10",
      amount: 89.9,
      installmentCurrent: 3,
      installmentTotal: 10,
      installmentsRemaining: 7,
    })]);
  });

  it("persists the installment and remaining count in the visible description", () => {
    expect(invoiceTransactionDescription({
      date: "2026-09-10",
      description: "Loja Exemplo",
      amount: 50,
      category: "Vestuário",
      installmentCurrent: 2,
      installmentTotal: 6,
      installmentsRemaining: 4,
    })).toBe("Loja Exemplo · Parcela 2/6 · restantes 4");
  });

  it("moves an impossible future installment date to the previous year", () => {
    const result = normalizeInvoiceExtraction({
      isInvoice: true,
      bankName: "Sicredi",
      transactions: [
        { date: "2026-12-30", description: "Compra parcelada", amount: 100, category: "Outros", installmentCurrent: 6, installmentTotal: 6 },
      ],
    }, "2026-09-27");

    expect(result?.transactions[0].date).toBe("2025-12-30");
  });

  it("reports source rows separately from valid purchases", () => {
    const result = normalizeInvoiceExtraction({
      isInvoice: true,
      sourceTransactionCount: 58,
      ignoredTransactionCount: 1,
      ignoredTransactions: [{ description: "Pagamento da fatura", transactionKind: "payment", amount: 7069.87 }],
      transactions: Array.from({ length: 57 }, (_, index) => ({
        date: "2026-08-01",
        description: `Compra ${index + 1}`,
        amount: 1,
        category: "Outros",
      })),
    }, "2026-09-27");

    expect(result).toMatchObject({ sourceTransactionCount: 58, ignoredTransactionCount: 1 });
    expect(result?.transactions).toHaveLength(57);
  });

  it("books every charge on the invoice due date and preserves the printed purchase date", () => {
    const result = normalizeInvoiceExtraction({
      isInvoice: true,
      bankName: "Sicredi",
      billingReferenceMonth: "2026-08",
      dueDay: 10,
      dueDate: "2026-09-10",
      transactions: [
        { date: "2026-08-24", description: "Mercado", amount: 100, category: "Alimentação" },
        { date: "2026-07-31", description: "Restaurante", amount: 50, category: "Alimentação" },
        { date: "2026-06-15", description: "Havan", amount: 309.92, category: "Moradia", installmentCurrent: 3, installmentTotal: 5 },
        { date: "2025-12-30", description: "Compra antiga", amount: 666.66, category: "Outros", installmentCurrent: 6, installmentTotal: 6 },
      ],
    }, "2026-09-27");

    expect(result?.billingReferenceMonth).toBe("2026-08");
    expect(result?.dueDate).toBe("2026-09-10");
    expect(result?.transactions.map(transaction => transaction.date)).toEqual(Array(4).fill("2026-09-10"));
    expect(result?.transactions.map(transaction => transaction.purchaseDate)).toEqual([
      "2026-08-24",
      "2026-07-31",
      "2026-06-15",
      "2025-12-30",
    ]);
    expect(invoiceTransactionDescription(result!.transactions[2])).toContain("compra em 15/06/2026");
  });

  it("derives the payment month from closing and due days when the full due date is missing", () => {
    const result = normalizeInvoiceExtraction({
      isInvoice: true,
      billingReferenceMonth: "2026-08",
      closingDay: 25,
      dueDay: 10,
      transactions: [
        { date: "2026-07-05", description: "Compra", amount: 80, category: "Outros", installmentCurrent: 3, installmentTotal: 6 },
      ],
    }, "2026-09-27");

    expect(result?.transactions[0]).toMatchObject({
      date: "2026-09-10",
      purchaseDate: "2026-07-05",
    });
  });
});

describe("isProbableRepeatedInvoice", () => {
  it("recognizes a nearly complete reimport", () => {
    expect(isProbableRepeatedInvoice([...Array(55).fill(true), false, false])).toBe(true);
  });

  it("keeps isolated duplicate review for genuinely ambiguous purchases", () => {
    expect(isProbableRepeatedInvoice([true, false, false, false, false, false, false, false, false, false])).toBe(false);
  });
});
