import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeResource, normalizeMovements, normalizeLimits, normalizeBills } from "./open-finance-normalize";
const amount = (amount: string, currency = "BRL") => ({ amount, currency });
describe("real provider normalization", () => {
  it("preserves unknown balances and maps investment positions by their documented dates", () => {
    const account = normalizeResource("accounts", { id: "account", consent_id: "consent", balance: null });
    expect(account.available_amount).toBeNull();
    const fund = normalizeResource("funds", { id: "92792126019929200000000000000000000000000", consent_id: "consent", name: "Fund", balance: { gross_amount: amount("1500.12"), net_amount: amount("1480"), reference_date: "2026-10-08" } });
    expect(fund).toMatchObject({ gross_amount: "1500.12", net_amount: "1480", valuation_date: "2026-10-08" });
    const stock = normalizeResource("variable-incomes", { id: "stock", consent_id: "consent", balance: { gross_amount: amount("100"), reference_date: "2026-10-09" } });
    expect(stock.net_amount).toBeNull();
  });
  it("retains independent card limit lines and never derives unknown credit", () => {
    const limits = normalizeLimits({ id: "card", limits: [{ identification_number: "1234", consolidation_type: "CONSOLIDADO", credit_line_limit_type: "TOTAL", line_name: "CREDITO_A_VISTA", limit_amount: amount("5000"), used_amount: amount("5300"), available_amount: null }] });
    expect(limits[0]).toMatchObject({ total_amount: "5000", used_amount: "5300", available_amount: null });
    expect(JSON.stringify(limits)).not.toContain("identification_number");
  });
  it("keeps purchase date distinct from billing month and excludes bill payments", () => {
    const [movement] = normalizeMovements("credit-cards", "card", [{ id: "tx", credit_card_id: "card", transaction_date_time: "2026-09-30T23:45:00-03:00", bill_forecast_date: "2026-11", credit_debit_type: "CREDITO", transaction_type: "PAGAMENTO_FATURA", brazilian_amount: amount("123.45"), amount: amount("20", "USD"), charge_identificator: 2, charge_number: 5 }]);
    expect(movement).toMatchObject({ transaction_date: "2026-09-30", bill_month: "2026-11-01", classification: "bill_payment", original_amount: "20", original_currency: "USD", installment_number: 2, installment_count: 5 });
  });
  it("uses fund conversion date and never labels investment redemption as consumer income", () => {
    const [tx] = normalizeMovements("funds", "fund", [{ id: "fundtx", fund_id: "fund", transaction_conversion_date: "2026-10-01", type: "SAIDA", transaction_type: "RESGATE", transaction_net_value: amount("90"), transaction_gross_value: amount("100") }]);
    expect(tx).toMatchObject({ transaction_date: "2026-10-01", amount: "90", classification: "investment", direction: "unknown" });
  });
  it("refuses wrong resource ownership and invalid amounts instead of quietly corrupting totals", () => {
    expect(() => normalizeMovements("accounts", "a", [{ id: "t", account_id: "b" }])).toThrow("RESOURCE_MISMATCH");
    expect(() => normalizeResource("funds", { id: "fund", balance: { gross_amount: amount("NaN") } })).toThrow();
    expect(() => normalizeResource("funds", { id: "fund", balance: { gross_amount: amount("10"), net_amount: amount("9", "USD") } })).toThrow("MIXED_CURRENCIES");
  });
  it("does not infer a paid bill from an unrelated partial payment", () => {
    const [bill] = normalizeBills("card", [{ id: "bill", credit_card_id: "card", bill_total_amount: amount("100"), bill_minimum_amount: amount("15"), payments: [{ amount: "15", currency: "BRL" }] }]);
    expect(bill.status).toBe("unknown");
    expect(bill.total_amount).toBe("100");
  });
});
