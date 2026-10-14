export type WhatsAppAiMode = "all" | "canary" | "rules-first";

export function whatsAppAiMode(setting: string | undefined): WhatsAppAiMode {
  if (setting === "false") return "rules-first";
  if (setting === "canary") return "canary";
  return "all";
}

export function shouldUseWhatsAppAiFirst(
  userId: string | undefined,
  phone: string | undefined,
  setting: string | undefined,
  testPhonesRaw: string | undefined,
): boolean {
  if (!userId) return false;
  const mode = whatsAppAiMode(setting);
  if (mode === "rules-first") return false;
  if (mode === "all") return true;
  const normalizedPhone = phone?.replace(/\D/g, "") ?? "";
  return !!normalizedPhone && (testPhonesRaw ?? "")
    .split(",").map(value => value.replace(/\D/g, "")).includes(normalizedPhone);
}
