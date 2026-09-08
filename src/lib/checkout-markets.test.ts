import { describe, expect, it } from "vitest";
import {
  BRAZIL_CHECKOUT,
  checkoutLocaleFromIdentifiers,
  SPANISH_CHECKOUT,
  type CheckoutPlanId,
} from "./checkout-markets";

const PLAN_IDS: CheckoutPlanId[] = ["monthly", "semiannual", "annual"];

describe("checkout por mercado", () => {
  it("mantém produtos e ofertas do Brasil separados dos checkouts em espanhol", () => {
    const brazilProducts = new Set(BRAZIL_CHECKOUT.productIds.map(value => value.toLowerCase()));
    const brazilOffers = new Set(Object.values(BRAZIL_CHECKOUT.offerCodes).map(value => value.toLowerCase()));

    expect(SPANISH_CHECKOUT.productIds.some(value => brazilProducts.has(value.toLowerCase()))).toBe(false);
    expect(Object.values(SPANISH_CHECKOUT.offerCodes).some(value => brazilOffers.has(value.toLowerCase()))).toBe(false);
  });

  it.each([
    ["Brasil", BRAZIL_CHECKOUT],
    ["espanhol", SPANISH_CHECKOUT],
  ] as const)("publica somente o produto e as ofertas do mercado %s", (_label, market) => {
    for (const planId of PLAN_IDS) {
      const url = new URL(market.checkoutUrls[planId]);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("pay.hotmart.com");
      expect(url.pathname).toBe(`/${market.productCode}`);
      expect(url.searchParams.get("off")).toBe(market.offerCodes[planId]);
      expect(url.searchParams.get("src")).toBe(market.sourceCode);
      expect(url.searchParams.has("bid")).toBe(false);
    }
  });

  it("identifica o idioma pelos códigos oficiais de cada checkout", () => {
    expect(checkoutLocaleFromIdentifiers("107093609", undefined)).toBe("pt-BR");
    expect(checkoutLocaleFromIdentifiers(undefined, BRAZIL_CHECKOUT.offerCodes.annual)).toBe("pt-BR");
    expect(checkoutLocaleFromIdentifiers("107497176", undefined)).toBe("es");
    expect(checkoutLocaleFromIdentifiers(undefined, SPANISH_CHECKOUT.offerCodes.annual)).toBe("es");
    expect(checkoutLocaleFromIdentifiers(undefined, undefined, BRAZIL_CHECKOUT.sourceCode)).toBe("pt-BR");
    expect(checkoutLocaleFromIdentifiers(undefined, undefined, SPANISH_CHECKOUT.sourceCode)).toBe("es");
  });

  it("uses the page source before a conflicting product identifier", () => {
    expect(checkoutLocaleFromIdentifiers(
      SPANISH_CHECKOUT.productCode,
      undefined,
      BRAZIL_CHECKOUT.sourceCode,
    )).toBe("pt-BR");
  });
});
