import type { UserLocale } from "./users";

export type CheckoutPlanId = "monthly" | "semiannual" | "annual";

type CheckoutMarket = {
  locale: UserLocale;
  sourceCode: string;
  productCode: string;
  productIds: readonly string[];
  offerCodes: Readonly<Record<CheckoutPlanId, string>>;
  checkoutUrls: Readonly<Record<CheckoutPlanId, string>>;
};

/**
 * Fonte única dos checkouts publicados em cada landing page. Manter os
 * mercados separados aqui evita que uma edição na página /es reutilize por
 * engano uma oferta brasileira (ou o contrário).
 */
export const BRAZIL_CHECKOUT: CheckoutMarket = {
  locale: "pt-BR",
  sourceCode: "zelo_site_br",
  productCode: "B107093609V",
  productIds: ["107093609", "B107093609V"],
  offerCodes: {
    monthly: "00zzvpfa",
    semiannual: "gbxytpij",
    annual: "zyi6wlxp",
  },
  checkoutUrls: {
    monthly: "https://pay.hotmart.com/B107093609V?off=00zzvpfa&checkoutMode=6&src=zelo_site_br",
    semiannual: "https://pay.hotmart.com/B107093609V?off=gbxytpij&checkoutMode=6&src=zelo_site_br",
    annual: "https://pay.hotmart.com/B107093609V?off=zyi6wlxp&checkoutMode=6&src=zelo_site_br",
  },
};

export const SPANISH_CHECKOUT: CheckoutMarket = {
  locale: "es",
  sourceCode: "zelo_site_es",
  productCode: "T107497176B",
  productIds: ["107497176", "T107497176B"],
  offerCodes: {
    monthly: "nhj4i7mi",
    semiannual: "yzqph7pa",
    annual: "zcsygj89",
  },
  checkoutUrls: {
    monthly: "https://pay.hotmart.com/T107497176B?off=nhj4i7mi&src=zelo_site_es",
    semiannual: "https://pay.hotmart.com/T107497176B?off=yzqph7pa&src=zelo_site_es",
    annual: "https://pay.hotmart.com/T107497176B?off=zcsygj89&src=zelo_site_es",
  },
};

const CHECKOUT_MARKETS = [BRAZIL_CHECKOUT, SPANISH_CHECKOUT] as const;

export function checkoutLocaleFromIdentifiers(product?: string, offer?: string, source?: string): UserLocale | undefined {
  const normalizedProduct = product?.trim().toLowerCase();
  const normalizedOffer = offer?.trim().toLowerCase();
  const normalizedSource = source?.trim().toLowerCase();

  const sourceMarket = normalizedSource
    ? CHECKOUT_MARKETS.find(market => market.sourceCode.toLowerCase() === normalizedSource)
    : undefined;
  if (sourceMarket) return sourceMarket.locale;

  const productMarket = normalizedProduct
    ? CHECKOUT_MARKETS.find(market => market.productIds.some(id => id.toLowerCase() === normalizedProduct))
    : undefined;
  if (productMarket) return productMarket.locale;

  const offerMarket = normalizedOffer
    ? CHECKOUT_MARKETS.find(market => Object.values(market.offerCodes).some(code => code.toLowerCase() === normalizedOffer))
    : undefined;
  if (offerMarket) return offerMarket.locale;

  return undefined;
}
