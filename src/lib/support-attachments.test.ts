import { describe, expect, it } from "vitest";
import { hasValidImageSignature, supportImageMimeFromFileName } from "./support-attachments";

describe("support attachments", () => {
  it("accepts only generated image file names", () => {
    expect(supportImageMimeFromFileName("550e8400-e29b-41d4-a716-446655440000.jpg")).toBe("image/jpeg");
    expect(supportImageMimeFromFileName("550e8400-e29b-41d4-a716-446655440000.png")).toBe("image/png");
    expect(supportImageMimeFromFileName("../segredo.jpg")).toBeNull();
    expect(supportImageMimeFromFileName("arquivo.svg")).toBeNull();
  });

  it("checks the real image signature instead of trusting only the MIME type", () => {
    expect(hasValidImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(hasValidImageSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(hasValidImageSignature(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), "image/webp")).toBe(true);
    expect(hasValidImageSignature(new TextEncoder().encode("<script>alert(1)</script>"), "image/jpeg")).toBe(false);
  });
});
