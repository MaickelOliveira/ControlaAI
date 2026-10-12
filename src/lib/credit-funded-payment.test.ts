import { describe, expect, it } from "vitest";
import { createFinanceLedger, ledgerBalance, ledgerExpenseGroups } from "./finance-ledger";
import type { BankMovement } from "./open-finance-report";

type Annotation = {
  id: string; status: "active" | "review"; role: "credit" | "payment";
  gross_amount: string; payment_amount: string; charges_amount: string;
};
type AnnotatedMovement = BankMovement & { source_type?: string; credit_reconciliation?: Annotation };
const annotation = (patch: Partial<Annotation> = {}): Annotation => ({
  id: "00000000-0000-4000-8000-000000000099", status: "active", role: "credit",
  gross_amount: "850.16", payment_amount: "821.48", charges_amount: "28.68", ...patch,
});
const credit = (patch: Partial<AnnotatedMovement> = {}): AnnotatedMovement => ({
  id: "fictional-credit", resource_id: "fictional-card", resource_name: "Cartão fictício",
  institution_name: "Banco fictício", resource_type: "card", date: "2026-10-12",
  description: "Operação de crédito fictícia", amount: "850.16", currency: "BRL", direction: "debit",
  classification: "purchase", kind: "card_purchases", source_type: "OPERACOES_CREDITO_CONTRATADAS_CARTAO",
  bill_month: "2026-10", installment_number: null, installment_count: null,
  credit_reconciliation: annotation(), ...patch,
});
const payment = (): AnnotatedMovement => ({
  ...credit(), id: "fictional-payment", resource_id: "fictional-account", resource_name: "Conta fictícia",
  resource_type: "account", description: "Pix para estabelecimento fictício", amount: "821.48",
  source_type: "PIX", kind: "account_debits", credit_reconciliation: annotation({ role: "payment" }),
});
const withoutAnnotation = (row: AnnotatedMovement): BankMovement => {
  const copy = { ...row };
  delete copy.credit_reconciliation;
  return copy;
};

describe("confirmed Pix funded with card credit in the public unified ledger", () => {
  it("counts the actual payment plus confirmed charges once while preserving all raw bank facts", () => {
    const rows = [credit(), payment()];
    const original = JSON.stringify(rows);
    const entries = createFinanceLedger([], rows, "personal");
    expect(entries).toHaveLength(2);
    expect(entries.find(row => row.id === "bank:fictional-credit")).toMatchObject({
      amount: 28.68, category: "Encargos bancários", included: true, type: "expense",
      date: "2026-10-12", bank: { amount: "850.16", currency: "BRL", bill_month: "2026-10" },
    });
    expect(entries.find(row => row.id === "bank:fictional-payment")).toMatchObject({ amount: 821.48, included: true });
    expect(ledgerBalance(entries)).toEqual({ income: 0, expense: 850.16, balance: -850.16 });
    expect(ledgerExpenseGroups(entries, "category")).toContainEqual({ name: "Encargos bancários", value: 28.68 });
    expect(JSON.stringify(rows)).toBe(original);
  });

  it("applies confirmed charges when the linked payment is outside the queried period", () => {
    const [entry] = createFinanceLedger([], [credit()], "business");
    expect(entry).toMatchObject({ amount: 28.68, category: "Encargos bancários", mode: "business", included: true });
    expect(ledgerBalance([entry]).expense).toBe(28.68);
  });

  it("treats the charge category as structural without overwriting the raw holder category", () => {
    const row = credit({ user_category: "Projeto fictício" });
    const [entry] = createFinanceLedger([], [row], "personal");
    expect(entry.category).toBe("Encargos bancários");
    expect(entry.amount).toBe(28.68);
    expect(entry.bank?.user_category).toBe("Projeto fictício");
    expect(row.user_category).toBe("Projeto fictício");
  });

  it("accepts equivalent exact decimal notation without changing the provider amount", () => {
    const row = credit({ amount: "850.16000000", credit_reconciliation: annotation({ gross_amount: "850.16000000", payment_amount: "821.48000000", charges_amount: "28.68000000" }) });
    const [entry] = createFinanceLedger([], [row], "personal");
    expect(entry.amount).toBe(28.68);
    expect(entry.bank?.amount).toBe("850.16000000");
  });

  it("counts fee-free confirmed credit as zero charges while preserving the original debt and payment", () => {
    const free = annotation({ gross_amount: "821.48", payment_amount: "821.48", charges_amount: "0.00000000" });
    const rawCredit = credit({ amount: "821.48", credit_reconciliation: free });
    const rawPayment = { ...payment(), credit_reconciliation: { ...free, role: "payment" as const } };
    const before = JSON.stringify([rawCredit, rawPayment]);
    const entries = createFinanceLedger([], [rawCredit, rawPayment], "personal");
    expect(entries.find(row => row.id === "bank:fictional-credit")).toMatchObject({
      amount: 0, category: "Encargos bancários", included: true,
      bank: { amount: "821.48", bill_month: "2026-10" },
    });
    expect(entries.find(row => row.id === "bank:fictional-payment")?.amount).toBe(821.48);
    expect(ledgerBalance(entries)).toEqual({ income: 0, expense: 821.48, balance: -821.48 });
    expect(JSON.stringify([rawCredit, rawPayment])).toBe(before);
  });

  it("does not infer a link from amounts, date or matching descriptions when confirmation is absent", () => {
    const rawCredit = withoutAnnotation(credit({ description: "Mesmo comércio fictício" }));
    const rawPayment = withoutAnnotation({ ...payment(), description: "Mesmo comércio fictício" });
    const entries = createFinanceLedger([], [rawCredit, rawPayment], "personal");
    expect(ledgerBalance(entries)).toEqual({ income: 0, expense: 1671.64, balance: -1671.64 });
    expect(entries.find(row => row.id === "bank:fictional-credit")?.amount).toBe(850.16);
  });

  it("keeps unrelated purchases, manual entries and the linked payment independent", () => {
    const unrelated = withoutAnnotation(credit({ id: "unrelated", source_type: "COMPRA_A_VISTA", description: "Compra independente", amount: "50.00" }));
    const manual = { id: "manual", type: "expense", amount: 10, category: "Outros", description: "Despesa fictícia", date: "2026-10-12", mode: "personal", source: "whatsapp" as const };
    const entries = createFinanceLedger([manual], [credit(), payment(), unrelated], "personal");
    expect(entries).toHaveLength(4);
    expect(ledgerBalance(entries).expense).toBe(910.16);
    expect(entries.find(row => row.id === "bank:unrelated")?.amount).toBe(50);
    expect(entries.find(row => row.id === "manual")?.amount).toBe(10);
  });

  it.each([
    ["review status", { status: "review" }],
    ["wrong role", { role: "payment" }],
    ["gross amount corrected by provider", { gross_amount: "850.17" }],
    ["sum wrong by one cent", { charges_amount: "28.69" }],
    ["sum wrong below display precision", { charges_amount: "28.680001" }],
    ["exact sum but charges below whole-cent precision", { payment_amount: "821.479999", charges_amount: "28.680001" }],
    ["negative charges", { charges_amount: "-1", payment_amount: "851.16" }],
    ["zero payment", { payment_amount: "0", charges_amount: "850.16" }],
    ["negative payment", { payment_amount: "-1", charges_amount: "851.16" }],
    ["invalid decimal", { charges_amount: "28,68" }],
    ["non-finite value", { charges_amount: "NaN" }],
    ["missing annotation identity", { id: "" }],
  ] satisfies Array<[string, Partial<Annotation>]>)
  ("preserves the raw accounting for invalid or stale metadata: %s", (_label, patch) => {
    const row = credit({ credit_reconciliation: annotation(patch) });
    const [actual] = createFinanceLedger([], [row], "personal");
    const [baseline] = createFinanceLedger([], [withoutAnnotation(row)], "personal");
    expect({ ...actual, bank: undefined }).toEqual({ ...baseline, bank: undefined });
    expect(actual.bank).toEqual(row);
  });

  it.each([
    ["foreign currency", { currency: "USD" }],
    ["unknown currency", { currency: null }],
    ["unknown amount", { amount: null }],
    ["nonpositive amount", { amount: "0" }],
    ["negative amount", { amount: "-850.16" }],
    ["changed provider amount", { amount: "850.17" }],
    ["ordinary purchase", { source_type: "COMPRA_A_VISTA" }],
    ["missing source type", { source_type: undefined }],
    ["account resource", { resource_type: "account" }],
    ["card refund", { direction: "credit", kind: "credits" }],
    ["excluded movement", { kind: "excluded", classification: "bill_payment" }],
  ] satisfies Array<[string, Partial<AnnotatedMovement>]>)
  ("cannot turn an ineligible %s into confirmed credit charges", (_label, patch) => {
    const row = credit(patch);
    const [actual] = createFinanceLedger([], [row], "personal");
    const [baseline] = createFinanceLedger([], [withoutAnnotation(row)], "personal");
    expect({ ...actual, bank: undefined }).toEqual({ ...baseline, bank: undefined });
    expect(actual.bank).toEqual(row);
  });

  it("keeps a payment-only period at its original amount", () => {
    const [entry] = createFinanceLedger([], [payment()], "personal");
    expect(entry.amount).toBe(821.48);
    expect(entry.bank?.amount).toBe("821.48");
    expect(entry.category).not.toBe("Encargos bancários");
  });
});
