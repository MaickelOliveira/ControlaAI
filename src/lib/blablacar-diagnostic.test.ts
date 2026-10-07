import { it } from "vitest";

it("diagnoses public BlaBlaCar date pages", async () => {
  const urls = [
    "https://www.blablacar.com.br/search?db=2026-10-08&fn=Campo%20Mour%C3%A3o&tn=Curitiba&sort=trip_date&order=asc",
    "https://www.blablacar.com.br/carpool/routes/campo-mourao-pr/curitiba-pr?db=2026-10-08",
    "https://www.blablacar.com.br/carpool/routes/campo-mourao-pr/curitiba-pr",
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" } });
      const html = await response.text();
      const snippets = [...html.matchAll(/2026-10-08|08\/10\/2026|__NEXT_DATA__|Carona|carpool|09:20|R\$\s?\d+/gi)]
        .slice(0, 20).map(match => html.slice(Math.max(0, match.index - 100), match.index + 170).replace(/\s+/g, " ").slice(0, 270));
      console.log("BLA_DIAGNOSTIC", JSON.stringify({ url, status: response.status, finalUrl: response.url, size: html.length, type: response.headers.get("content-type"), snippets }));
    } catch (error) {
      console.log("BLA_DIAGNOSTIC_ERROR", url, String(error));
    }
  }
}, 45_000);
