import { describe, it, expect } from "vitest";
import { isPostedFinance, expandMerchantAliases, formatCurrency, type Finance } from "./finances";

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
