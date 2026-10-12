import { describe, expect, it } from "vitest";
import { displayCardLimits } from "./bank-card-limit";
import type { BankLimit } from "./open-finance-display";

function limit(id: string, patch: Partial<BankLimit> = {}): BankLimit {
  return {
    id,
    resource_id: "fictional-card-a",
    line_name: "CREDITO_A_VISTA",
    consolidation_type: "COMPARTILHADO",
    currency: "BRL",
    total_amount: "100.00",
    used_amount: "50.00",
    available_amount: "50.00",
    is_flexible: false,
    ...patch,
  };
}

describe("displayCardLimits", () => {
  it("collapses identical named lines and exposes the number of source records without adding money", () => {
    const first = limit("source-a");
    const output = displayCardLimits([first, limit("source-b"), limit("source-c")]);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({ ...first, displayCount: 3 });
    expect(output[0].total_amount).toBe("100.00");
    expect(output[0].available_amount).toBe("50.00");
    expect(output[0].used_amount).toBe("50.00");
  });

  it("keeps the first appearance of each group and gives unique lines a count of one", () => {
    const other = limit("other", { line_name: "SAQUE_CREDITO_BRASIL" });
    expect(displayCardLimits([limit("first"), other, limit("duplicate")]))
      .toEqual([{ ...limit("first"), displayCount: 2 }, { ...other, displayCount: 1 }]);
  });

  it("groups equivalent decimal strings and numbers without converting the stored values", () => {
    const first = limit("first");
    const padded = limit("padded", { total_amount: "100.00000000", used_amount: "50.00000000", available_amount: "50.00000000" });
    const numeric = limit("numeric", { total_amount: 100, used_amount: 50, available_amount: 50 });
    expect(displayCardLimits([first, padded, numeric])).toEqual([{ ...first, displayCount: 3 }]);
  });

  it.each([
    ["resource", { resource_id: "fictional-card-b" }],
    ["currency", { currency: "USD" }],
    ["name", { line_name: "SAQUE_CREDITO_BRASIL" }],
    ["consolidation", { consolidation_type: "INDIVIDUAL" }],
    ["total", { total_amount: "100.000001" }],
    ["used", { used_amount: "50.000001" }],
    ["available", { available_amount: "50.000001" }],
    ["flexible", { is_flexible: true }],
    ["unknown flexibility", { is_flexible: null }],
  ] satisfies Array<[string, Partial<BankLimit>]>)
  ("does not collapse lines with different %s", (_name, patch) => {
    const first = limit("first");
    const second = limit("second", patch);
    expect(displayCardLimits([first, second])).toEqual([
      { ...first, displayCount: 1 }, { ...second, displayCount: 1 },
    ]);
  });

  it("does not lose decimal differences above JavaScript's safe integer range", () => {
    const first = limit("first", { total_amount: "9007199254740992.000001" });
    const second = limit("second", { total_amount: "9007199254740992.000002" });
    expect(displayCardLimits([first, second])).toHaveLength(2);
  });

  it.each([null, "", "   "])("keeps unnamed lines separate because their identities are ambiguous: %s", line_name => {
    const first = limit("first", { line_name });
    const second = limit("second", { line_name });
    expect(displayCardLimits([first, second])).toEqual([
      { ...first, displayCount: 1 }, { ...second, displayCount: 1 },
    ]);
  });

  it("keeps absent amounts distinct from reported zero and does not derive missing credit", () => {
    const unknown = limit("unknown", { available_amount: null });
    const zero = limit("zero", { available_amount: "0.00000000" });
    expect(displayCardLimits([unknown, zero])).toEqual([
      { ...unknown, displayCount: 1 }, { ...zero, displayCount: 1 },
    ]);
  });

  it("groups matching named unknown lines while retaining null amounts", () => {
    const unknown = limit("unknown", { available_amount: null, total_amount: null, used_amount: null });
    expect(displayCardLimits([unknown, { ...unknown, id: "other-source" }]))
      .toEqual([{ ...unknown, displayCount: 2 }]);
  });

  it("does not mutate input rows or their order and returns independent display records", () => {
    const first = Object.freeze(limit("first"));
    const second = Object.freeze(limit("second"));
    const input = Object.freeze([first, second]);
    const before = JSON.stringify(input);
    const output = displayCardLimits(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(first).not.toHaveProperty("displayCount");
    expect(output[0]).not.toBe(first);
    expect(output[0]).toMatchObject({ id: "first", displayCount: 2 });
  });

  it("returns an empty list when no limits were supplied", () => {
    expect(displayCardLimits([])).toEqual([]);
  });
});
