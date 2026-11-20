import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_TTL_MS,
  fbcFromFbclid,
  isAttribution,
  mergeAttribution,
  pickAttribution,
  searchFromAttribution,
} from "./meta-attribution";

const NOW = 1_800_000_000_000;

describe("clique do anúncio", () => {
  it("guarda só fbclid e UTMs, ignorando o resto", () => {
    expect(pickAttribution("?fbclid=abc&utm_source=facebook&utm_campaign=c1&foo=bar&utm_term=")).toEqual({
      fbclid: "abc",
      utm_source: "facebook",
      utm_campaign: "c1",
    });
  });

  it("limita o tamanho de cada valor", () => {
    expect(pickAttribution(`?fbclid=${"x".repeat(900)}`).fbclid).toHaveLength(256);
  });

  it("um novo clique substitui o anterior inteiro (último clique vale)", () => {
    const old = { params: { fbclid: "velho", utm_campaign: "antiga" }, savedAt: NOW - 1000 };
    expect(mergeAttribution(old, "?utm_source=instagram", NOW)).toEqual({
      params: { utm_source: "instagram" },
      savedAt: NOW,
    });
  });

  it("mantém o clique guardado quando a visita não traz parâmetros", () => {
    const stored = { params: { fbclid: "abc" }, savedAt: NOW - 1000 };
    expect(mergeAttribution(stored, "", NOW)).toBe(stored);
  });

  it("descarta o clique depois de 90 dias", () => {
    const stored = { params: { fbclid: "abc" }, savedAt: NOW - ATTRIBUTION_TTL_MS - 1 };
    expect(mergeAttribution(stored, "", NOW)).toBeNull();
  });

  it("completa a URL atual com o clique guardado sem sobrescrever o que já existe", () => {
    const stored = { params: { fbclid: "guardado", utm_source: "facebook" }, savedAt: NOW };
    const result = new URLSearchParams(searchFromAttribution("?utm_source=google", stored));
    expect(result.get("utm_source")).toBe("google");
    expect(result.get("fbclid")).toBe("guardado");
  });

  it("devolve a URL atual intacta quando não há clique guardado", () => {
    expect(searchFromAttribution("?a=1", null)).toBe("a=1");
  });

  it("monta o cookie _fbc no formato da Meta", () => {
    expect(fbcFromFbclid("IwAR123", NOW)).toBe(`fb.1.${NOW}.IwAR123`);
  });

  it("valida o que vem do armazenamento do navegador", () => {
    expect(isAttribution({ params: { fbclid: "a" }, savedAt: 1 })).toBe(true);
    expect(isAttribution({ params: { fbclid: 1 }, savedAt: 1 })).toBe(false);
    expect(isAttribution({ params: {}, savedAt: "1" })).toBe(false);
    expect(isAttribution(null)).toBe(false);
  });
});
