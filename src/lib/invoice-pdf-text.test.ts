import { describe, expect, it } from "vitest";
import { mergePdfInventory, parsePdfTransactionLines } from "./invoice-pdf-text";

describe("PDF invoice text inventory", () => {
  it("counts dated transaction rows and identifies negative payments and credits", () => {
    const inventory = parsePdfTransactionLines([
      "Resumo da fatura R$ 4.804,93",
      "10/ set 22:53 Pagamento 029466488 - R$ 6.213,15",
      "09/ set 21:38 Online - R$ 21,57",
      "04/ set 11:29 Sao Paulo Online Tiktok Shop Evamhcome R$ 21,57",
      "Total atual R$ 4.804,93",
    ], "2026-09-27");

    expect(inventory.sourceTransactionCount).toBe(3);
    expect(inventory.ignoredTransactions).toEqual([
      expect.objectContaining({ date: "2026-09-10", amount: 6213.15, transactionKind: "payment" }),
      expect.objectContaining({ date: "2026-09-09", amount: 21.57, transactionKind: "credit" }),
    ]);
  });

  it("uses the previous year for an undated-month row that would otherwise be in the future", () => {
    const inventory = parsePdfTransactionLines([
      "27/ nov 23:34 Online Asaas Tintim 10/12 R$ 299,00",
    ], "2026-09-27");

    expect(inventory.sourceTransactionCount).toBe(1);
    expect(inventory.ignoredTransactions).toEqual([]);
  });

  it("merges deterministic evidence without duplicating a credit already read by the model", () => {
    const merged = mergePdfInventory({
      isInvoice: true,
      sourceTransactionCount: 50,
      ignoredTransactionCount: 5,
      ignoredTransactions: [
        { date: "2026-09-09", description: "Tiktok Shop", amount: 21.57, transactionKind: "reversal" },
      ],
    }, {
      sourceTransactionCount: 48,
      ignoredTransactions: [
        { date: "2026-09-09", description: "Online", amount: 21.57, transactionKind: "credit" },
        { date: "2026-09-10", description: "Pagamento", amount: 6213.15, transactionKind: "payment" },
      ],
    });

    expect(merged.sourceTransactionCount).toBe(48);
    expect(merged.sourceTransactionCountVerified).toBe(true);
    expect(merged.ignoredTransactionCount).toBe(2);
    expect(merged.ignoredTransactions).toHaveLength(2);
  });
});
