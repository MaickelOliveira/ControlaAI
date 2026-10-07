import { describe, expect, it } from "vitest";
import { extractProductImage, isPublicImageUrl, knownProductImage, parsePublicImageRequest } from "./web-image-search";

describe("public product images", () => {
  it("keeps the product model from the conversation when asked for its photo", () => {
    const history = [
      { role: "user" as const, content: "bolsa luis voiton quanto esta" },
      { role: "assistant" as const, content: "Louis Vuitton tem vários modelos. A Alma BB custa cerca de US$ 2.000." },
    ];
    expect(parsePublicImageRequest("manda uma foto da alma pra mim", history)?.subject)
      .toBe("Alma BB Louis Vuitton");
    expect(parsePublicImageRequest("me mostra uma imagem da Alma BB", history)?.subject)
      .toBe("Alma BB Louis Vuitton");
  });

  it("leaves personal photos and unrelated messages to their existing flows", () => {
    expect(parsePublicImageRequest("manda uma foto da minha fatura")).toBeNull();
    expect(parsePublicImageRequest("pesquise o preço da bolsa Alma")).toBeNull();
    expect(parsePublicImageRequest("recebi uma foto da bolsa")).toBeNull();
  });

  it("accepts only the product page image when the title matches the requested variant", () => {
    const html = `<html><head>
      <meta content="Bolsa Alma BB Monogram | Louis Vuitton" property="og:title">
      <meta property="og:image" content="https://media.louisvuitton.com/alma-bb.jpg?size=800&amp;view=1">
    </head></html>`;
    expect(extractProductImage(html, "https://br.louisvuitton.com/produtos/alma-bb", "Alma BB Louis Vuitton"))
      .toEqual({ title: "Bolsa Alma BB Monogram | Louis Vuitton", imageUrl: "https://media.louisvuitton.com/alma-bb.jpg?size=800&view=1" });
    expect(extractProductImage(html, "https://br.louisvuitton.com/produtos/alma-bb", "Alma PM Louis Vuitton"))
      .toBeNull();
  });

  it("uses a product image tag when a shop does not expose an Open Graph image", () => {
    const html = `<title>Bolsa Alma BB Monogram | Louis Vuitton</title>
      <img alt="Logo Louis Vuitton" src="https://br.louisvuitton.com/logo.png">
      <img alt="Bolsa Alma BB Louis Vuitton (Zoom no Produto)" src="/images/alma-bb.jpg">`;
    expect(extractProductImage(html, "https://br.louisvuitton.com/produtos/alma-bb", "Alma BB Louis Vuitton"))
      .toEqual({ title: "Bolsa Alma BB Monogram | Louis Vuitton", imageUrl: "https://br.louisvuitton.com/images/alma-bb.jpg" });
  });

  it("uses the verified official media for Alma BB Monogram when the product page blocks the server", () => {
    const source = knownProductImage({ subject: "Alma BB Louis Vuitton", context: "" });
    expect(source?.title).toContain("Alma BB Monogram");
    expect(source?.imageUrl).toContain("br.louisvuitton.com/images/is/image/lv/");
    expect(source?.pageUrl).toContain("/M46990");
    expect(knownProductImage({ subject: "Alma BB Epi Louis Vuitton", context: "" })).toBeNull();
    expect(knownProductImage({ subject: "Alma PM Louis Vuitton", context: "" })).toBeNull();
    expect(knownProductImage({ subject: "Alma BB Louis Vuitton", context: "Alma BB em couro Epi" })).toBeNull();
  });

  it("rejects local addresses and unsafe image URLs", () => {
    expect(isPublicImageUrl("http://example.com/photo.jpg")).toBe(false);
    expect(isPublicImageUrl("https://127.0.0.1/photo.jpg")).toBe(false);
    expect(isPublicImageUrl("https://admin.local/photo.jpg")).toBe(false);
    expect(isPublicImageUrl("https://media.louisvuitton.com/photo.jpg")).toBe(true);
  });
});
