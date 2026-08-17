import { describe, expect, it } from "vitest";
import {
  BILLING_WEBHOOK_PRESETS,
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
