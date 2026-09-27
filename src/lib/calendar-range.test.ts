import { describe, expect, it } from "vitest";
import { last3MonthsRange, monthRange } from "./calendar-range";

describe("calendar month ranges", () => {
  it.each([
    [new Date(2026, 0, 15), { from: "2026-01-01", to: "2026-01-31" }],
    [new Date(2026, 3, 15), { from: "2026-04-01", to: "2026-04-30" }],
    [new Date(2026, 1, 15), { from: "2026-02-01", to: "2026-02-28" }],
    [new Date(2028, 1, 15), { from: "2028-02-01", to: "2028-02-29" }],
  ])("uses the real first and last day for %s", (now, expected) => {
    expect(monthRange(0, now)).toEqual(expected);
  });

  it("covers complete calendar months in the 3-month preset", () => {
    expect(last3MonthsRange(new Date(2026, 2, 15))).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });
});
