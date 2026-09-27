import { describe, expect, it } from "vitest";
import { invoiceTransactionDescription, normalizeInvoiceExtraction } from "./invoice-import";

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
});
