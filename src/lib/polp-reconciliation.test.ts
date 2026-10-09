import { describe, expect, it } from "vitest";
import { reconcilePolpSnapshot } from "./polp-reconciliation";
import type { PolpSnapshot } from "./polp-sandbox";

const snapshot: PolpSnapshot = {
  resources: [], accounts: [], cards: [], bills: [], loans: [], financings: [], investments: {}, investmentTransactions: {},
  accountTransactions: [
    { id: "bank-1", accountId: "a", transaction_name: "Pagamento fatura Nubank", transaction_date_time: "2026-10-05", credit_debit_type: "DEBITO", transaction_amount: { amount: "75.00", currency: "BRL" } },
    { id: "bank-2", accountId: "a", transaction_name: "Padaria Central", transaction_date_time: "2026-10-06", credit_debit_type: "DEBITO", transaction_amount: { amount: "25.00", currency: "BRL" } },
  ],
  cardTransactions: [
    { id: "card-1", cardId: "c", transaction_name: "Mercado Real", transaction_date_time: "2026-10-01", credit_debit_type: "DEBITO", brazilian_amount: { amount: "75.00", currency: "BRL" }, charge_identificator: 2, charge_number: 3 },
    { id: "card-2", cardId: "c", transaction_name: "Pagamento fatura", transaction_date_time: "2026-10-05", credit_debit_type: "CREDITO", transaction_type: "PAGAMENTO_FATURA", brazilian_amount: { amount: "75.00", currency: "BRL" } },
    { id: "card-3", cardId: "c", transaction_name: "Mercado Real", transaction_date_time: "2026-11-01", credit_debit_type: "DEBITO", brazilian_amount: { amount: "75.00", currency: "BRL" }, charge_identificator: 3, charge_number: 3 },
  ],
};

describe("conferência de lançamentos Open Finance", () => {
  it("separa pagamentos da fatura e marca compra que a IA já registrou", () => {
    const result = reconcilePolpSnapshot(snapshot, [
      { id: "ai", type: "expense", amount: 25, date: "2026-10-06", description: "Padaria Central", mode: "personal", source: "whatsapp" },
      { id: "pdf", type: "expense", amount: 75, date: "2026-10-20", description: "Mercado Real · Parcela 2/3 · compra em 01/10/2026", mode: "personal", source: "web" },
    ]);
    expect(result.map(item => item.status)).toEqual(["payment_or_transfer", "review", "review", "payment_or_transfer", "new"]);
    expect(result[2].matchingFinanceIds).toEqual(["pdf"]);
    expect(result[4].matchingFinanceIds).toEqual([]);
  });

  it("não descarta compras diferentes com mesmo valor ou entre modos", () => {
    const result = reconcilePolpSnapshot(snapshot, [
      { id: "other", type: "expense", amount: 25, date: "2026-10-06", description: "Ônibus", mode: "personal" },
      { id: "business", type: "expense", amount: 25, date: "2026-10-06", description: "Padaria Central", mode: "business" },
    ]);
    expect(result[1].status).toBe("new");
  });
});
