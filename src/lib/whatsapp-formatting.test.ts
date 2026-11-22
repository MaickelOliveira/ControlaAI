import { expect, it } from "vitest";
import { toWhatsAppFormatting } from "./ai-processor";

it("converte títulos, separadores e negrito duplo para o WhatsApp", () => {
  const raw = "Panorama do dólar:\n\n---\n\n### 💵 Cotações de Referência\n\n**Dólar comercial:** R$ 5,94\n* Turismo: R$ 6,02\n\n---";
  expect(toWhatsAppFormatting(raw)).toBe("Panorama do dólar:\n\n*💵 Cotações de Referência*\n\n*Dólar comercial:* R$ 5,94\n* Turismo: R$ 6,02");
});

it("não altera texto que já está no formato do WhatsApp", () => {
  const text = "*Dólar comercial:* R$ 5,94\n• Turismo: R$ 6,02\nFonte: https://exemplo.com/a---b";
  expect(toWhatsAppFormatting(text)).toBe(text);
});
