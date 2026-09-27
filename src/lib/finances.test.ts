import { describe, it, expect } from "vitest";
import { isPostedFinance, isSameInvoiceExpense, expandMerchantAliases, formatCurrency, type Finance } from "./finances";

function makeFinance(overrides: Partial<Finance> = {}): Finance {
  return {
    id: "f1", userId: "u1", type: "expense", amount: 10, category: "Outros",
    description: "teste", mode: "personal", date: "2026-01-01", source: "web", createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isPostedFinance", () => {
  it("is true when status is absent", () => {
    expect(isPostedFinance(makeFinance({ status: undefined }))).toBe(true);
  });

  it("is true when status is posted", () => {
    expect(isPostedFinance(makeFinance({ status: "posted" }))).toBe(true);
  });

  it("is false when status is pending", () => {
    expect(isPostedFinance(makeFinance({ status: "pending" }))).toBe(false);
  });
});

describe("expandMerchantAliases", () => {
  it("expands a known merchant to all its variants", () => {
    expect(expandMerchantAliases("ifood")).toEqual(["ifood", "ifd", "i food"]);
  });

  it("expands from an abbreviation too", () => {
    expect(expandMerchantAliases("ifd")).toEqual(["ifood", "ifd", "i food"]);
  });

  it("is case-insensitive", () => {
    expect(expandMerchantAliases("IFOOD")).toEqual(["ifood", "ifd", "i food"]);
  });

  it("tolerates a trailing typo in iFood", () => {
    expect(expandMerchantAliases("ifoode")).toEqual(["ifood", "ifd", "i food"]);
  });

  it("returns just the lowercased term when there is no known alias", () => {
    expect(expandMerchantAliases("Padaria do Zé")).toEqual(["padaria do zé"]);
  });
});

describe("formatCurrency", () => {
  it("formats a positive value in BRL", () => {
    expect(formatCurrency(80)).toContain("80");
    expect(formatCurrency(80)).toMatch(/R\$/);
  });

  it("formats cents correctly", () => {
    expect(formatCurrency(1234.5)).toContain("1.234,50");
  });
});

describe("isSameInvoiceExpense", () => {
  const existing = makeFinance({
    amount: 89.9,
    date: "2026-09-10",
    description: "Supermercado Central",
    category: "Alimentação",
    mode: "personal",
  });

  it.each(["conta-dinheiro", "conta-carteira", "conta-outro-banco"])(
    "flags the same day, amount and merchant regardless of the previous account (%s)",
    accountId => {
      expect(isSameInvoiceExpense({ ...existing, accountId }, {
        amount: 89.9,
        date: "2026-09-10",
        description: "Mercado Central",
        category: "Alimentação",
      }, "personal")).toBe(true);
    },
  );

  it("does not flag the same amount on another day", () => {
    expect(isSameInvoiceExpense(existing, {
      amount: 89.9,
      date: "2026-09-11",
      description: "Mercado Central",
      category: "Alimentação",
    }, "personal")).toBe(false);
  });

  it("does not flag a different merchant and category on the same day", () => {
    expect(isSameInvoiceExpense(existing, {
      amount: 89.9,
      date: "2026-09-10",
      description: "Posto Avenida",
      category: "Transporte",
    }, "personal")).toBe(false);
  });

  it("advances an existing installment sequence instead of treating the next installment as a duplicate", () => {
    const previous = makeFinance({
      amount: 50,
      date: "2026-05-10",
      description: "Loja Exemplo · Parcela 3/10 · restantes 7",
      category: "Vestuário",
    });
    expect(isSameInvoiceExpense(previous, {
      amount: 50,
      date: "2026-05-10",
      description: "Loja Exemplo",
      category: "Vestuário",
      installmentCurrent: 4,
      installmentTotal: 10,
    }, "personal")).toBe(false);
    expect(isSameInvoiceExpense(previous, {
      amount: 50,
      date: "2026-05-10",
      description: "Loja Exemplo",
      category: "Vestuário",
      installmentCurrent: 3,
      installmentTotal: 10,
    }, "personal")).toBe(true);
  });
});
