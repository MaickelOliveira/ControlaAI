/** Pixel público da Zelo; o mesmo valor é usado no navegador e no envio pelo servidor. */
export const DEFAULT_META_PIXEL_ID = "1673074203783828";

// Áreas que nunca recebem o Pixel: painéis logados, admin, API e fluxos de acesso.
// Todo o resto é página pública (landing, cadastro, login, legais, /pt, /es...) e
// é medido. Usar lista de exclusão — e não uma lista fixa de páginas públicas —
// evita que uma página nova (ou o /pt) fique sem rastreamento sem ninguém notar.
const PRIVATE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/api",
  "/primeiro-acesso",
  "/esqueci-senha",
] as const;

function withoutLocale(pathname: string): string {
  const clean = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  return clean.replace(/^\/(?:es|pt)(?=\/|$)/, "") || "/";
}

export function isMetaPublicPath(pathname: string): boolean {
  const path = withoutLocale(pathname);
  return !PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export function isSpanishMetaPath(pathname: string): boolean {
  return pathname === "/es" || pathname.startsWith("/es/");
}

export function isMetaRegistrationPath(pathname: string): boolean {
  return pathname === "/cadastro" || pathname === "/es/cadastro";
}

export function metaCheckoutCurrency(pathname: string): "BRL" | "USD" {
  return isSpanishMetaPath(pathname) ? "USD" : "BRL";
}
