import { describe, expect, it } from "vitest";
import { formatPolpDate } from "./polp-date";

describe("Polp transaction dates", () => {
  it("keeps the source calendar date used by reconciliation at midnight UTC", () => {
    expect(formatPolpDate("2026-10-10T00:00:00Z")).toBe("10/10/2026");
  });

  it("keeps date-only values and dates with an explicit offset", () => {
    expect(formatPolpDate("2026-10-10")).toBe("10/10/2026");
    expect(formatPolpDate("2026-10-10T23:30:00-03:00")).toBe("10/10/2026");
  });

  it("shows a clear fallback when no date was supplied", () => {
    expect(formatPolpDate("")).toBe("Data não informada");
  });
});
