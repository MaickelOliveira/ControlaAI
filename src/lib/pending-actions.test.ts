import { describe, it, expect } from "vitest";
import { parseYesNo, parseAmountBR, choiceIndexByLabels, parseFinanceChoiceMulti } from "./pending-actions";

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

describe("parseFinanceChoiceMulti", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `id${i + 1}`, description: `Item ${i + 1}`, amount: 10, date: "2026-08-01", category: "Outros", mode: "personal",
  }));
  const items5 = mk(5);
  const items130 = mk(130);

  it("resolves a single 1-based number", () => {
    expect(parseFinanceChoiceMulti("3", items5)).toEqual([2]);
  });

  it("resolves a range with 'a'", () => {
    expect(parseFinanceChoiceMulti("1 a 5", items130)).toEqual([0, 1, 2, 3, 4]);
  });

  it("resolves a large range with 'ao' (o cenário do print: 'do 1 ao 130')", () => {
    expect(parseFinanceChoiceMulti("1 ao 130", items130)).toHaveLength(130);
  });

  it("resolves a range with 'até' and with '-'", () => {
    expect(parseFinanceChoiceMulti("1 até 3", items5)).toEqual([0, 1, 2]);
    expect(parseFinanceChoiceMulti("1-3", items5)).toEqual([0, 1, 2]);
  });

  it("resolves a comma/e/ou separated list without merging into a range", () => {
    expect(parseFinanceChoiceMulti("1, 2 e 5", items5)).toEqual([0, 1, 4]);
    expect(parseFinanceChoiceMulti("1 ou 3", items5)).toEqual([0, 2]);
  });

  it("keeps 'e' as a separator instead of swallowing it into a range token", () => {
    // "1 e 15" não pode virar o intervalo 1-15 — são duas escolhas distintas
    expect(parseFinanceChoiceMulti("1 e 15", items130)).toEqual([0, 14]);
  });

  it("combines ranges and single numbers in one message", () => {
    expect(parseFinanceChoiceMulti("1 a 3 e 5", items5)).toEqual([0, 1, 2, 4]);
  });

  it("resolves 'todos'/'tudo' to every candidate", () => {
    expect(parseFinanceChoiceMulti("todos", items5)).toEqual([0, 1, 2, 3, 4]);
    expect(parseFinanceChoiceMulti("tudo", items5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("dedupes overlapping ranges/numbers", () => {
    expect(parseFinanceChoiceMulti("1 a 3, 2 e 3", items5)).toEqual([0, 1, 2]);
  });

  it("ignores out-of-range numbers instead of throwing", () => {
    expect(parseFinanceChoiceMulti("1 a 10", items5)).toEqual([0, 1, 2, 3, 4]);
    expect(parseFinanceChoiceMulti("99", items5)).toEqual([]);
  });

  it("returns [] for free text unrelated to a selection", () => {
    expect(parseFinanceChoiceMulti("mains nao falei vivo", items5)).toEqual([]);
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
