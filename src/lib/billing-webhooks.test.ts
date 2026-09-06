import { describe, expect, it } from "vitest";
import {
  BILLING_WEBHOOK_PRESETS,
  inferCheckoutLocale,
  normalizedCheckoutPhone,
  verifyBillingWebhookAuth,
  type BillingWebhookConfig,
} from "./billing-webhooks";

function makeConfig(overrides: Partial<BillingWebhookConfig> = {}): BillingWebhookConfig {
  return {
    id: "webhook-1",
    label: "Hotmart",
    active: true,
    secretValue: "hottok-secreto",
    emailPath: "data.buyer.email",
    statusPath: "event",
    activateValues: ["PURCHASE_APPROVED"],
    deactivateValues: ["PURCHASE_REFUNDED"],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Hotmart billing webhook authentication", () => {
  it("configures new Hotmart integrations to read the Hottok from the v2 header", () => {
    expect(BILLING_WEBHOOK_PRESETS.hotmart.secretHeader).toBe("X-HOTMART-HOTTOK");
    expect(BILLING_WEBHOOK_PRESETS.hotmart.secretBodyField).toBeUndefined();
  });

  it("accepts a valid X-HOTMART-HOTTOK header", () => {
    const config = makeConfig({ secretHeader: "X-HOTMART-HOTTOK" });
    const headers = new Headers({ "X-HOTMART-HOTTOK": "hottok-secreto" });

    expect(verifyBillingWebhookAuth(config, {}, headers)).toBe(true);
  });

  it("rejects an invalid X-HOTMART-HOTTOK header", () => {
    const config = makeConfig({ secretHeader: "X-HOTMART-HOTTOK" });
    const headers = new Headers({ "X-HOTMART-HOTTOK": "token-errado" });

    expect(verifyBillingWebhookAuth(config, {}, headers)).toBe(false);
  });

  it("keeps legacy Hotmart configurations working with the v2 header", () => {
    const legacyConfig = makeConfig({ secretBodyField: "hottok" });
    const headers = new Headers({ "X-HOTMART-HOTTOK": "hottok-secreto" });

    expect(verifyBillingWebhookAuth(legacyConfig, {}, headers)).toBe(true);
  });

  it("keeps body-field authentication available for other providers", () => {
    const config = makeConfig({ label: "Kiwify", secretBodyField: "token" });

    expect(verifyBillingWebhookAuth(config, { token: "hottok-secreto" }, new Headers())).toBe(true);
  });
});

describe("Hotmart international checkout", () => {
  it("identifies every offer published on the Spanish page", () => {
    expect(inferCheckoutLocale({ data: { product: { id: 107497176 } } })).toBe("es");
    for (const code of ["nhj4i7mi", "yzqph7pa", "zcsygj89"]) {
      expect(inferCheckoutLocale({ data: { purchase: { offer: { code } } } })).toBe("es");
    }
    expect(inferCheckoutLocale({ data: { product: { id: "outro-produto" } } })).toBeUndefined();
  });

  it("keeps the Spanish product mapped in newly created webhook settings", () => {
    expect(BILLING_WEBHOOK_PRESETS.hotmart.localeMap?.["107497176"]).toBe("es");
    expect(BILLING_WEBHOOK_PRESETS.hotmart.localeMap?.T107497176B).toBe("es");
  });

  it.each([
    [{ data: { buyer: { checkout_phone: "+52 55 1234 5678", address: { country_iso: "MX" } } } }, "525512345678"],
    [{ data: { buyer: { checkout_phone: "300 1234567", address: { country_iso: "CO" } } } }, "573001234567"],
    [{ data: { buyer: { checkout_phone: "11 15 1234-5678", address: { country_iso: "AR" } } } }, "5491112345678"],
    [{ data: { buyer: { checkout_phone: "9 6123 4567", address: { country_iso: "CL" } } } }, "56961234567"],
    [{ data: { buyer: { checkout_phone: "99999-9999", checkout_phone_code: "11", address: { country_iso: "BR" } } } }, "5511999999999"],
  ])("normalizes checkout phones from any country", (payload, expected) => {
    expect(normalizedCheckoutPhone(payload)).toBe(expected);
  });
});
