import { describe, expect, it } from "vitest";
import { bankCategory } from "./bank-category";
import { createFinanceLedger, ledgerBalance } from "./finance-ledger";
import { normalizeExpenseCategories } from "./expense-category";
import type { AIResult } from "./ai-processor";
import type { BankMovement } from "./open-finance-report";

const movement = (description: string, direction: "credit" | "debit", patch: Partial<BankMovement> = {}): BankMovement => ({
  id: "fictional-movement", resource_name: "Conta fictícia", institution_name: "Banco fictício",
  resource_type: "account", date: "2026-10-12", description, amount: "127.43", currency: "BRL",
  direction, classification: "unknown", kind: direction === "credit" ? "credits" : "account_debits",
  bill_month: null, installment_number: null, installment_count: null, ...patch,
});

describe("AI subscriptions have a specific expense category", () => {
  it.each([
    ["Pix enviado para Claude", "Outros"],
    ["Curso sobre ChatGPT", "Educação"],
  ])("does not confuse the actual purpose of %s with an AI subscription", (description, category) => {
    const bank = movement(description, "debit");
    expect(bankCategory(bank).name).toBe(category);
    expect(createFinanceLedger([], [bank], "personal")[0]).toMatchObject({
      category, amount: 127.43, date: "2026-10-12", included: true, bank,
    });
    const result: AIResult = { intent: "finance_register", confidence: 1, finance: {
      type: "expense", amount: 127.43, description, category: "Outros", date: "2026-10-12",
    } };
    expect(normalizeExpenseCategories(`Paguei 127,43 de ${description}`, result))
      .toEqual({ ...result, finance: { ...result.finance, category } });
  });

  it.each(["ChatGPT", "OpenAI", "Anthropic Claude", "Google Gemini", "Perplexity"])("categorizes %s across bank and new platform/WhatsApp records", description => {
    const bank = movement(description, "debit");
    expect(bankCategory(bank).name).toBe("Inteligência Artificial");
    const [entry] = createFinanceLedger([], [bank], "personal");
    expect(entry).toMatchObject({ category: "Inteligência Artificial", amount: 127.43, date: "2026-10-12", included: true, bank });
    const result: AIResult = { intent: "finance_register", confidence: 1, finance: {
      type: "expense", amount: 127.43, description, category: "Outros", date: "2026-10-12",
    } };
    expect(normalizeExpenseCategories(`Paguei 127,43 de ${description}`, result))
      .toEqual({ ...result, finance: { ...result.finance, category: "Inteligência Artificial" } });
  });

  it.each(["Apple.Com/Bill", "Stripe"])("does not infer an AI service from the generic intermediary %s", description => {
    expect(bankCategory(movement(description, "debit")).name).toBe("Outros");
    const result: AIResult = { intent: "finance_register", confidence: 1, finance: {
      type: "expense", amount: 127.43, description, category: "Outros", date:"2026-10-12",
    } };
    expect(normalizeExpenseCategories(`Paguei 127,43 de ${description}`, result)).toEqual(result);
  });

  it("preserves explicitly chosen Tecnologia for an AI subscription", () => {
    expect(bankCategory(movement("ChatGPT", "debit", { user_category: "Tecnologia" })))
      .toEqual({ name: "Tecnologia", source: "user" });
    const result: AIResult = { intent: "finance_register", confidence: 1, finance: {
      type: "expense", amount: 127.43, description: "Google Gemini", category: "Tecnologia", date:"2026-10-12",
    } };
    expect(normalizeExpenseCategories("Paguei 127,43 de Google Gemini na categoria Tecnologia", result)).toEqual(result);
  });
});
const cases = [
  ["Pagamento de empréstimo pessoal", "debit", "Empréstimos"],
  ["Recebimento de empréstimo contratado", "credit", "Empréstimos"],
  ["Parcela de crédito consignado", "debit", "Empréstimos"],
  ["Crédito de empréstimo consignado", "credit", "Empréstimos"],
  ["Juros do empréstimo pessoal", "debit", "Encargos bancários"],
  ["IOF do empréstimo consignado", "debit", "Encargos bancários"],
  ["Rendimento da aplicação", "credit", "Rendimentos"],
  ["Juros recebidos", "credit", "Rendimentos"],
  ["Dividendos recebidos", "credit", "Rendimentos"],
] as const;

describe("loan principal, bank charges and investment yield categories", () => {
  it.each(cases)("categorizes bank %s without changing transaction accounting", (description, direction, category) => {
    const original = movement(description, direction);
    const before = JSON.stringify(original);
    expect(bankCategory(original).name).toBe(category);
    const [entry] = createFinanceLedger([], [original], "business");
    expect(entry).toMatchObject({
      category, amount: 127.43, date: "2026-10-12", included: true, mode: "business",
      type: direction === "credit" ? "income" : "expense", bank: original,
    });
    expect(entry.bank?.currency).toBe("BRL");
    expect(entry.bank?.amount).toBe("127.43");
    expect(JSON.stringify(original)).toBe(before);
  });

  it.each(["INCOME_INTEREST_EARNED", "INCOME_DIVIDENDS"])("maps official provider %s to Rendimentos even with an opaque description", source_category => {
    const bank = movement("Crédito bancário", "credit", { source_category });
    expect(bankCategory(bank)).toEqual({ name: "Rendimentos", source: "provider" });
    expect(createFinanceLedger([], [bank], "personal")[0].category).toBe("Rendimentos");
  });

  it.each(cases)("normalizes a new platform/WhatsApp %s while preserving every other field", (description, direction, category) => {
    const result: AIResult = { intent: "finance_register", confidence: 0.95, finance: {
      type: direction === "credit" ? "income" : "expense", amount: 127.43, date: "2026-10-12",
      description, category: "Outros", mode: "business", accountHint: "Conta fictícia",
    } };
    expect(normalizeExpenseCategories(`Registre 127,43 de ${description}`, result))
      .toEqual({ ...result, finance: { ...result.finance, category } });
  });

  it.each([
    ["Pagamento do empréstimo", "debit"], ["Dividendos recebidos", "credit"],
  ] as const)("preserves the holder's custom choice for %s", (description, direction) => {
    const bank = movement(description, direction, { user_category: "Projeto pessoal" });
    expect(bankCategory(bank)).toEqual({ name: "Projeto pessoal", source: "user" });
    const result: AIResult = { intent: "finance_register", confidence: 1, finance: {
      type: direction === "credit" ? "income" : "expense", amount: 127.43, description,
      category: "Projeto pessoal", date: "2026-10-12",
    } };
    expect(normalizeExpenseCategories(`Registre 127,43 de ${description} na categoria Projeto pessoal`, result)).toEqual(result);
  });

  it("keeps excluded transfers and redemptions excluded even when their descriptions mention loan or yield", () => {
    const rows = [
      movement("Transferência do empréstimo", "credit", { id: "transfer", kind: "excluded", classification: "transfer" }),
      movement("Resgate da aplicação com rendimentos", "credit", { id: "redemption", kind: "excluded", classification: "investment" }),
    ];
    const entries = createFinanceLedger([], rows, "personal");
    expect(entries.every(entry => !entry.included)).toBe(true);
    expect(entries.map(entry => entry.category)).toEqual(["Transferências e pagamentos", "Transferências e pagamentos"]);
    expect(entries.every(entry => entry.bank?.amount === "127.43" && entry.bank.currency === "BRL" && entry.date === "2026-10-12")).toBe(true);
    expect(ledgerBalance(entries)).toEqual({ income: 0, expense: 0, balance: 0 });
  });

  it.each(["Pix recebido", "Pix enviado para pessoa", "Mercado Pago", "Google Pay", "Meta Pay"])("does not infer loan or investment purpose from ambiguous %s", description => {
    for (const direction of ["credit", "debit"] as const) expect(bankCategory(movement(description, direction)).name).toBe("Outros");
  });

  it.each([
    ["Compra parcelada sem juros", "Outros"],
    ["Compra parcelada sem juros — Drogasil", "Saúde"],
  ])("does not mistake %s for a loan or bank charge", (description, category) => {
    expect(bankCategory(movement(description, "debit", { resource_type: "card", kind: "card_purchases", classification: "purchase" })).name).toBe(category);
  });

  it("does not make foreign-currency yields or unknown amounts countable by categorizing them", () => {
    const rows = [
      movement("Dividendos recebidos", "credit", { id: "usd", currency: "USD" }),
      movement("Rendimento da aplicação", "credit", { id: "unknown", amount: null }),
    ];
    const entries = createFinanceLedger([], rows, "personal");
    expect(entries.every(entry => entry.category === "Rendimentos" && !entry.included)).toBe(true);
    expect(entries.find(entry => entry.id === "bank:usd")?.bank?.currency).toBe("USD");
    expect(entries.find(entry => entry.id === "bank:unknown")?.bank?.amount).toBeNull();
    expect(ledgerBalance(entries)).toEqual({ income: 0, expense: 0, balance: 0 });
  });
});
