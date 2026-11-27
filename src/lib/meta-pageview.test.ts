import { describe, expect, it } from "vitest";
import { pageViewHosts, parsePageViewBody } from "./meta-pageview";

const HOSTS = ["zelogestaointeligente.com.br"];
const ID = "3f2c8e1a-4b5d-4c6e-9f70-1a2b3c4d5e6f";
const valid = { eventId: ID, url: "https://zelogestaointeligente.com.br/?utm_source=facebook&fbclid=abc#planos" };

describe("PageView enviado pelo navegador ao servidor", () => {
  it("aceita uma visita válida e tira o fragmento da URL", () => {
    expect(parsePageViewBody(valid, HOSTS)).toEqual({
      eventId: ID,
      url: "https://zelogestaointeligente.com.br/?utm_source=facebook&fbclid=abc",
      fbp: undefined,
      fbc: undefined,
      eventName: "PageView",
      externalId: undefined,
    });
  });

  it("aceita ViewContent e o identificador do visitante, e recusa outros eventos", () => {
    const view = parsePageViewBody({ ...valid, eventName: "ViewContent", externalId: ID }, HOSTS);
    expect(view?.eventName).toBe("ViewContent");
    expect(view?.externalId).toBe(ID);
    expect(parsePageViewBody({ ...valid, eventName: "Purchase" }, HOSTS)).toBeNull();
    expect(parsePageViewBody({ ...valid, externalId: "qualquer" }, HOSTS)?.externalId).toBeUndefined();
  });

  it("repassa _fbp e _fbc bem formados e descarta os malformados", () => {
    const ok = parsePageViewBody({ ...valid, fbp: "fb.1.1800000000000.123456789", fbc: "fb.1.1800000000000.IwAR1234567890" }, HOSTS);
    expect(ok?.fbp).toBe("fb.1.1800000000000.123456789");
    expect(ok?.fbc).toBe("fb.1.1800000000000.IwAR1234567890");

    const bad = parsePageViewBody({ ...valid, fbp: "<script>", fbc: "qualquer coisa" }, HOSTS);
    expect(bad?.fbp).toBeUndefined();
    expect(bad?.fbc).toBeUndefined();
  });

  it.each([
    ["sem corpo", null],
    ["id que não é UUID", { ...valid, eventId: "123" }],
    ["sem URL", { eventId: ID }],
    ["URL inválida", { ...valid, url: "não é url" }],
    ["protocolo estranho", { ...valid, url: "javascript:alert(1)" }],
    ["site de terceiros", { ...valid, url: "https://outro-site.com/" }],
    ["área logada", { ...valid, url: "https://zelogestaointeligente.com.br/dashboard/financas" }],
    ["URL gigante", { ...valid, url: `https://zelogestaointeligente.com.br/?${"a".repeat(700)}` }],
  ])("recusa %s", (_nome, body) => {
    expect(parsePageViewBody(body, HOSTS)).toBeNull();
  });

  it("reconhece os domínios configurados no ambiente", () => {
    const hosts = pageViewHosts({ APP_ORIGIN: "https://app.exemplo.com", NEXT_PUBLIC_APP_URL: "valor quebrado" } as unknown as NodeJS.ProcessEnv);
    expect(hosts).toContain("app.exemplo.com");
    expect(hosts).toContain("zelogestaointeligente.com.br");
  });
});
