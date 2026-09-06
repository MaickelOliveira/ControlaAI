import { describe, expect, it } from "vitest";
import { phoneVariants } from "./conversations";

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
