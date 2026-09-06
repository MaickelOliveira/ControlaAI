import { describe, expect, it } from "vitest";
import { normalizeWhatsAppPhone } from "./phone";

describe("normalizeWhatsAppPhone", () => {
  it.each([
    ["+34 612 345 678", "34612345678"],
    ["+52 55 1234 5678", "525512345678"],
    ["+57 300 1234567", "573001234567"],
    ["+54 9 11 1234-5678", "5491112345678"],
    ["+56 9 6123 4567", "56961234567"],
    ["0051 987 654 321", "51987654321"],
  ])("preserva e normaliza o DDI internacional de %s", (input, expected) => {
    expect(normalizeWhatsAppPhone(input)).toBe(expected);
  });

  it("não transforma um número espanhol recebido do WhatsApp em brasileiro", () => {
    expect(normalizeWhatsAppPhone("34612345678")).toBe("34612345678");
  });

  it.each([
    ["11 15 1234-5678", "AR", "5491112345678"],
    ["55 1234 5678", "MX", "525512345678"],
    ["300 1234567", "CO", "573001234567"],
    ["9 6123 4567", "CL", "56961234567"],
    ["11 99999-9999", "BR", "5511999999999"],
    ["987 654 321", "PE", "51987654321"],
  ])("aplica o DDI de %s usando o país %s", (input, country, expected) => {
    expect(normalizeWhatsAppPhone(input, country)).toBe(expected);
  });
});
