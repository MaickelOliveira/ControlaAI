import { describe, expect, it } from "vitest";
import { applyPreviewAction, investmentMovement, money, previewRows, recordValue } from "../../sandbox-app/app/preview-model";
import type { PolpSnapshot } from "./polp-sandbox";

const snapshot: PolpSnapshot = {
  resources: [], accounts: [], cards: [], bills: [], loans: [], financings: [],
  reservedBalances: {}, investments: {}, investmentTransactions: {},
  accountTransactions: [{ id:"purchase", accountId:"account", transaction_name:"Mercado Bairro", transaction_date_time:"2026-10-09T00:00:00Z", credit_debit_type:"DEBITO", transaction_amount:{amount:"120.00",currency:"BRL"} },
    { id:"payment", accountId:"account", transaction_name:"Pagamento fatura cartão", transaction_date_time:"2026-10-09T00:00:00Z", credit_debit_type:"DEBITO", transaction_amount:{amount:"1000.00",currency:"BRL"} }],
  cardTransactions: [{ id:"card-purchase", cardId:"card", transaction_name:"Livraria", transaction_date_time:"2026-10-08T00:00:00Z", credit_debit_type:"DEBITO", brazilian_amount:{amount:"80.00",currency:"BRL"} }],
};

describe("private customer preview", () => {
  it("shows a fictitious AI match and blocks bill payments from becoming new expenses", () => {
    const rows = previewRows(snapshot);
    expect(rows.find(row => row.id === "account:account:purchase")?.status).toBe("review");
    const payment = rows.find(row => row.id === "account:account:payment")!;
    expect(applyPreviewAction({}, payment, "import")).toEqual({});
    expect(applyPreviewAction({}, rows[0], "import")).toEqual({});
  });
  it("keeps repeated simulation imports unique and allows linking the example match", () => {
    const rows = previewRows(snapshot);
    const purchase = rows.find(row => row.id === "card:card:card-purchase")!;
    const ledger = applyPreviewAction({}, purchase, "import");
    expect(applyPreviewAction(ledger, purchase, "import")).toEqual({[purchase.id]:"imported"});
    expect(applyPreviewAction({}, rows.find(row => row.id === "account:account:purchase")!, "link")).toEqual({"account:account:purchase":"linked"});
    expect(applyPreviewAction({}, purchase, "link")).toEqual({});
  });
  it("does not turn missing values into zero or collapse original currency", () => {
    expect(money(null)).toBe("Não informado");
    expect(money({amount:"not-a-number",currency:"BRL"})).toBe("Não informado");
    expect(money({amount:"120.50",currency:"USD"})).toContain("120,50");
    expect(recordValue({id:"investment",balance:{gross_amount:{amount:"120",currency:"BRL"}}},"balance.gross_amount")).toEqual({amount:"120",currency:"BRL"});
  });
  it("uses fund conversion dates and variable income transaction values", () => {
    expect(investmentMovement({id:"fund",transaction_type:"APLICACAO",transaction_conversion_date:"2026-09-27",transaction_gross_value:{amount:"600",currency:"BRL"}})).toEqual({name:"APLICACAO",date:"2026-09-27",amount:{amount:"600",currency:"BRL"}});
    expect(investmentMovement({id:"stock",transaction_type:"DIVIDENDOS",transaction_date:"2026-09-08",transaction_value:{amount:"159.41",currency:"BRL"}})).toEqual({name:"DIVIDENDOS",date:"2026-09-08",amount:{amount:"159.41",currency:"BRL"}});
  });
});
