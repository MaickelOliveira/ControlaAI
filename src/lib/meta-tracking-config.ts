const META_PUBLIC_PATHS = new Set([
  "/",
  "/cadastro",
  "/login",
  "/es",
  "/es/cadastro",
  "/es/login",
]);

export function isMetaPublicPath(pathname: string): boolean {
  return META_PUBLIC_PATHS.has(pathname);
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
