import { describe, expect, it } from "vitest";
import {
  isMetaPublicPath,
  isMetaRegistrationPath,
  isSpanishMetaPath,
  metaCheckoutCurrency,
} from "./meta-tracking-config";

describe("Meta tracking by language", () => {
  it.each(["/es", "/es/cadastro", "/es/login"])("enables the Pixel on %s", pathname => {
    expect(isMetaPublicPath(pathname)).toBe(true);
    expect(isSpanishMetaPath(pathname)).toBe(true);
  });

  it("recognizes registration in both languages", () => {
    expect(isMetaRegistrationPath("/cadastro")).toBe(true);
    expect(isMetaRegistrationPath("/es/cadastro")).toBe(true);
  });

  it("keeps Brazilian and Spanish checkout currencies separate", () => {
    expect(metaCheckoutCurrency("/")).toBe("BRL");
    expect(metaCheckoutCurrency("/es")).toBe("USD");
  });
});

describe("páginas medidas pelo Pixel", () => {
  it.each([
    "/", "/pt", "/es", "/cadastro", "/login", "/bancos", "/privacidade", "/termos",
    "/pt/cadastro", "/pt/login", "/es/login", "/pt/", "/privacidade?x=1",
  ])("mede a página pública %s", pathname => {
    expect(isMetaPublicPath(pathname)).toBe(true);
  });

  it.each([
    "/dashboard", "/dashboard/financas", "/es/dashboard", "/es/dashboard/agenda",
    "/pt/dashboard", "/admin", "/admin/login", "/api/me", "/api/meta/pageview",
    "/primeiro-acesso", "/esqueci-senha", "/es/esqueci-senha",
  ])("não mede a área logada ou técnica %s", pathname => {
    expect(isMetaPublicPath(pathname)).toBe(false);
  });

  it("não confunde páginas públicas parecidas com áreas privadas", () => {
    expect(isMetaPublicPath("/dashboards-publicos")).toBe(true);
    expect(isMetaPublicPath("/administracao")).toBe(true);
  });
});
