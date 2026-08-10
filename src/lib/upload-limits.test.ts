import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, contentLengthTooLarge, tooLarge, validateUploadType } from "./upload-limits";

describe("upload limits", () => {
  it("accepts supported extension and matching MIME type", () => {
    expect(validateUploadType("nota.PDF", "application/pdf")).toBe(true);
    expect(validateUploadType("foto.jpeg", "image/jpeg")).toBe(true);
  });

  it("rejects executable browser formats and mismatched MIME types", () => {
    expect(validateUploadType("pagina.html", "text/html")).toBe(false);
    expect(validateUploadType("imagem.svg", "image/svg+xml")).toBe(false);
    expect(validateUploadType("foto.jpg", "text/html")).toBe(false);
    expect(validateUploadType("sem-extensao", "application/pdf")).toBe(false);
  });

  it("rejects bodies larger than 25 MB before and after parsing", () => {
    expect(tooLarge(MAX_UPLOAD_BYTES + 1)).toBe(true);
    expect(tooLarge(MAX_UPLOAD_BYTES)).toBe(false);
    expect(contentLengthTooLarge(new Request("https://zelo.test", {
      headers: { "content-length": String(MAX_UPLOAD_BYTES + 1) },
    }))).toBe(true);
  });
});
