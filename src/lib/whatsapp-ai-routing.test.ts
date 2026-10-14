import { expect, it } from "vitest";
import { shouldUseWhatsAppAiFirst, whatsAppAiMode } from "./whatsapp-ai-routing";

it.each([
  [undefined, "all"], ["all", "all"], ["true", "all"],
  ["canary", "canary"], ["false", "rules-first"],
] as const)("describes the effective WhatsApp AI mode for %s", (setting, mode) => {
  expect(whatsAppAiMode(setting)).toBe(mode);
});

it("limits canary to a listed phone and never treats an anonymous caller as a customer", () => {
  expect(shouldUseWhatsAppAiFirst("owner", "+55 (44) 99988-7766", "canary", "5544999887766")).toBe(true);
  expect(shouldUseWhatsAppAiFirst("owner", "5544999887700", "canary", "5544999887766")).toBe(false);
  expect(shouldUseWhatsAppAiFirst(undefined, "5544999887766", "all", "")).toBe(false);
  expect(shouldUseWhatsAppAiFirst("owner", "5544999887766", "false", "5544999887766")).toBe(false);
});
