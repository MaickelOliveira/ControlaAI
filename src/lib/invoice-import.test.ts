import { describe, expect, it } from "vitest";
import { invoiceTransactionDescription, isProbableRepeatedInvoice, normalizeInvoiceExtraction } from "./invoice-import";

describe("normalizeInvoiceExtraction", () => {
  it("keeps only the installment billed now and calculates how many remain", () => {
    const result = normalizeInvoiceExtraction({
      isInvoice: true,
      bankName: "Nubank",
      closingDay: 8,
      dueDay: 15,
      transactions: [
        { date: "2026-09-10", description: "Mercado Central", amount: "89,90", category: "Alimentação", installmentCurrent: 3, installmentTotal: 10, billingStatus: "current" },
        { date: "2026-08-10", description: "Mercado Central", amount: 89.9, category: "Alimentação", installmentCurrent: 2, installmentTotal: 10, billingStatus: "past_paid" },
        { date: "2026-10-10", description: "Mercado Central", amount: 89.9, category: "Alimentação", installmentCurrent: 4, installmentTotal: 10, billingStatus: "future_projected" },
        { date: "2026-09-12", description: "Estorno Mercado Central", amount: 89.9, category: "Alimentação", transactionKind: "reversal", billingStatus: "current" },
      ],
    }, "2026-09-27");

    expect(result).toMatchObject({ bankName: "Nubank", closingDay: 8, dueDay: 15 });
    expect(result?.transactions).toEqual([expect.objectContaining({
      date: "2026-09-10",
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

  it("books every charge in the statement reference month and preserves the printed purchase date", () => {
    const result = normalizeInvoiceExtraction({
      isInvoice: true,
      bankName: "Sicredi",
      billingReferenceMonth: "2026-08",
      transactions: [
        { date: "2026-08-24", description: "Mercado", amount: 100, category: "Alimentação" },
        { date: "2026-07-31", description: "Restaurante", amount: 50, category: "Alimentação" },
        { date: "2026-06-15", description: "Havan", amount: 309.92, category: "Moradia", installmentCurrent: 3, installmentTotal: 5 },
        { date: "2025-12-30", description: "Compra antiga", amount: 666.66, category: "Outros", installmentCurrent: 6, installmentTotal: 6 },
      ],
    }, "2026-09-27");

    expect(result?.billingReferenceMonth).toBe("2026-08");
    expect(result?.transactions.map(transaction => transaction.date)).toEqual([
      "2026-08-24",
      "2026-08-31",
      "2026-08-15",
      "2026-08-30",
    ]);
    expect(result?.transactions.map(transaction => transaction.purchaseDate)).toEqual([
      "2026-08-24",
      "2026-07-31",
      "2026-06-15",
      "2025-12-30",
    ]);
    expect(invoiceTransactionDescription(result!.transactions[2])).toContain("compra em 15/06/2026");
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
