import { describe, expect, it } from "vitest";
import {
  isMetaPublicPath,
  isMetaRegistrationPath,
  isSpanishMetaPath,
  metaCheckoutCurrency,
} from "./meta-tracking-config";

describe("Meta tracking by language", () => {
  it.each(["/es", "/es/cadastro", "/es/login"])("enables the Pixel on %s", pathname => {
    expect(isMetaPublicPath(pathname)).toBe(true);
    expect(isSpanishMetaPath(pathname)).toBe(true);
  });

  it("recognizes registration in both languages", () => {
    expect(isMetaRegistrationPath("/cadastro")).toBe(true);
    expect(isMetaRegistrationPath("/es/cadastro")).toBe(true);
  });

  it("keeps Brazilian and Spanish checkout currencies separate", () => {
    expect(metaCheckoutCurrency("/")).toBe("BRL");
    expect(metaCheckoutCurrency("/es")).toBe("USD");
  });
});
