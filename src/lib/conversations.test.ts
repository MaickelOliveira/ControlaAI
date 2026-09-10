import { describe, expect, it } from "vitest";
import {
  CUSTOMER_SERVICE_WINDOW_MS,
  isCustomerServiceWindowOpen,
  phoneVariants,
} from "./conversations";

describe("phoneVariants", () => {
  it.each([
    ["+34 612 345 678", "34612345678"],
    ["525512345678", "525512345678"],
    ["573001234567", "573001234567"],
    ["5491112345678", "5491112345678"],
    ["56961234567", "56961234567"],
  ])("never adds Brazil's country code to international number %s", (input, expected) => {
    expect(phoneVariants(input)).toEqual([expected]);
  });

  it("keeps legacy Brazilian variants available", () => {
    const variants = phoneVariants("11 98765-4321");
    expect(variants).toContain("5511987654321");
    expect(variants).toContain("11987654321");
    expect(variants).toContain("551187654321");
  });
});

describe("isCustomerServiceWindowOpen", () => {
  const now = new Date("2026-09-10T20:00:00-03:00").getTime();

  it("opens the window from the last customer message", () => {
    expect(isCustomerServiceWindowOpen([
      { role: "user", ts: now - CUSTOMER_SERVICE_WINDOW_MS + 1 },
      { role: "assistant", ts: now - 1_000 },
    ], now)).toBe(true);
  });

  it("does not let an assistant message renew an expired window", () => {
    expect(isCustomerServiceWindowOpen([
      { role: "user", ts: now - CUSTOMER_SERVICE_WINDOW_MS },
      { role: "assistant", ts: now - 1_000 },
    ], now)).toBe(false);
  });

  it("keeps the window closed when the customer has never replied", () => {
    expect(isCustomerServiceWindowOpen([
      { role: "assistant", ts: now - 1_000 },
    ], now)).toBe(false);
  });

  it("uses the most recent inbound message", () => {
    expect(isCustomerServiceWindowOpen([
      { role: "user", ts: now - CUSTOMER_SERVICE_WINDOW_MS * 2 },
      { role: "assistant", ts: now - 10_000 },
      { role: "user", ts: now - 5_000 },
    ], now)).toBe(true);
  });
});
