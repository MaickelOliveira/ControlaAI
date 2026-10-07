import { it } from "vitest";

it("diagnoses official product photo access", async () => {
  const urls = [
    "https://br.louisvuitton.com/por-br/produtos/alma-bb-monogram-nvprod5190086v/M46990",
    "https://br.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-bolsa-alma-bb--M46990_PM1_Worn%20view.jpg",
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Zelo/1.0 (public product preview)", Accept: "text/html,image/jpeg,image/png;q=0.9" } });
      const body = await response.arrayBuffer();
      const html = response.headers.get("content-type")?.includes("html") ? Buffer.from(body).toString("utf8") : "";
      console.log("LV_DIAGNOSTIC", JSON.stringify({ url, status: response.status, finalUrl: response.url, size: body.byteLength,
        type: response.headers.get("content-type"), og: html.match(/<meta[^>]+(?:og:image|og:title)[^>]*>/gi)?.slice(0, 4),
        title: html.match(/<title[^>]*>[^<]+<\/title>/i)?.[0], img: html.match(/<img[^>]+(?:Alma|alma)[^>]*>/i)?.[0]?.slice(0, 500) }));
    } catch (error) { console.log("LV_DIAGNOSTIC_ERROR", url, String(error)); }
  }
}, 35_000);
