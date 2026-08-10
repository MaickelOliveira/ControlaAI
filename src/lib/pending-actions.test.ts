import { describe, it, expect } from "vitest";
import { parseYesNo, parseAmountBR, choiceIndexByLabels } from "./pending-actions";

describe("parseYesNo", () => {
  it("recognizes affirmative answers", () => {
    for (const t of ["sim", "s", "pode", "manda", "claro", "com certeza", "beleza", "ok"]) {
      expect(parseYesNo(t)).toBe(true);
    }
  });

  it("recognizes negative answers", () => {
    for (const t of ["não", "nao", "n", "nunca"]) {
      expect(parseYesNo(t)).toBe(false);
    }
  });

  it("returns null for unrelated text", () => {
    expect(parseYesNo("quanto gastei esse mês")).toBeNull();
  });
});

describe("parseAmountBR", () => {
  it("parses plain integers", () => {
    expect(parseAmountBR("80")).toBe(80);
  });

  it("parses comma-decimal Brazilian format", () => {
    expect(parseAmountBR("80,50")).toBe(80.5);
  });

  it("parses thousands separator + decimal", () => {
    expect(parseAmountBR("1.234,56")).toBe(1234.56);
  });

  it("extracts the amount from a full sentence", () => {
    expect(parseAmountBR("gastei 45 reais no mercado")).toBe(45);
  });

  it("returns null when there is no number", () => {
    expect(parseAmountBR("sem valor nenhum aqui")).toBeNull();
  });

  it("returns null for zero or negative", () => {
    expect(parseAmountBR("0")).toBeNull();
  });
});

describe("choiceIndexByLabels", () => {
  const items = [{ name: "Civic" }, { name: "Corolla" }, { name: "Onix" }];
  const labels = (i: { name: string }) => [i.name];

  it("resolves a 1-based numeric choice", () => {
    expect(choiceIndexByLabels("2", items, labels)).toBe(1);
  });

  it("resolves by partial name match", () => {
    expect(choiceIndexByLabels("corolla", items, labels)).toBe(1);
  });

  it("returns -1 when nothing matches", () => {
    expect(choiceIndexByLabels("fusca", items, labels)).toBe(-1);
  });
});
