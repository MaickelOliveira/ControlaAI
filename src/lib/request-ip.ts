import type { NextRequest } from "next/server";

/** Vercel/proxies confiáveis preenchem x-forwarded-for da esquerda para a
 * direita. A normalização evita criar chaves diferentes com espaços/case. */
export function getRequestIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().toLowerCase()
    || req.headers.get("x-real-ip")?.trim().toLowerCase()
    || "unknown";
}
