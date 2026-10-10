import "server-only";
import { isIP } from "node:net";
import { readBankBody } from "./open-finance-body";
export const OPEN_FINANCE_PRODUCTS = ["ACCOUNT", "CREDIT_CARD_ACCOUNT", "CREDIT_OPERATIONS", "INVESTMENTS"] as const;
export type PolpObject = Record<string, unknown>;
export type PolpPage = { data: PolpObject[]; nextCursor: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function polpUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("INVALID_ID");
  return value;
}
export function polpExternalId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_.-]{0,199}$/i.test(value)) throw new Error("INVALID_ID");
  return value;
}
export function polpObject(value: unknown): PolpObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_RESPONSE");
  return value as PolpObject;
}
export function parseBankAuthUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4096) throw new Error("INVALID_AUTH_URL");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("INVALID_AUTH_URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(url.hostname)) throw new Error("INVALID_AUTH_URL");
  return url;
}
export function requireAuthUrl(value: unknown): string {
  const url = parseBankAuthUrl(value);
  const hosts = (process.env.OPEN_FINANCE_AUTH_HOSTS || "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  if (!hosts.includes(url.hostname)) throw new Error("INVALID_AUTH_URL");
  return url.href;
}
export async function polpProductionRequest(path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: PolpObject): Promise<PolpObject> {
  const [pathname, query = ""] = path.split("?");
  if (!/^\/(consents|accounts|credit-cards|bills|loans|financings|bank-fixed-incomes|credit-fixed-incomes|funds|treasure-titles|variable-incomes)(\/[a-z0-9][\w.-]{0,199})?(\/[a-z-]+)?$/i.test(pathname) || query.length > 2000 || path.includes("#")) throw new Error("INVALID_PATH");
  const client = process.env.POLP_PRODUCTION_CLIENT_ID;
  const secret = process.env.POLP_PRODUCTION_CLIENT_SECRET;
  if (process.env.OPEN_FINANCE_ENABLED !== "true" || !client || !secret) throw new Error("NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch(`https://api.polp.com.br/api/v2${path}`, {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "x-api-client": client, "x-api-secret": secret, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error("POLP_UNAVAILABLE"); }
  if (!response.ok) throw new Error(`POLP_HTTP_${response.status}`);
  const raw = (await readBankBody(response,2_000_000)).toString("utf8");
  try { return polpObject(JSON.parse(raw)); } catch { throw new Error("INVALID_RESPONSE"); }
}
export async function polpProductionPage(path: string, cursor: string | null, window?: Record<string, string>): Promise<PolpPage> {
  if (cursor !== null && (typeof cursor !== "string" || cursor.length > 1000 || /[\r\n]/.test(cursor))) throw new Error("INVALID_CURSOR");
  const query = new URLSearchParams(window);
  if (cursor) query.set("cursor", cursor);
  const response = await polpProductionRequest(path + (query.size ? `?${query}` : ""));
  if (!Array.isArray(response.data) || response.data.length > 1000) throw new Error("INVALID_RESPONSE");
  const meta = response.meta == null ? {} : polpObject(response.meta);
  const next = meta.next_cursor ?? null;
  if (next !== null && (typeof next !== "string" || !next || next.length > 1000)) throw new Error("INVALID_CURSOR");
  return { data: response.data.map(polpObject), nextCursor: next as string | null };
}
export async function createProductionConsent(userId: string, institutionId: string, documents: { cpf: string; cnpj?: string }): Promise<PolpObject> {
  const response = await polpProductionRequest("/consents", "POST", {
    institution_id: polpUuid(institutionId), cliente_user_id: polpUuid(userId), ...documents,
    products: [...OPEN_FINANCE_PRODUCTS], avoidDuplicates: true,
  });
  const consent = polpObject(response.data);
  polpUuid(consent.id);
  if (consent.cliente_user_id !== userId || consent.institution_id !== institutionId) throw new Error("CONSENT_IDENTITY_MISMATCH");
  return consent;
}
export function validateBankDocuments(cpfInput: unknown, cnpjInput: unknown, mode: "personal" | "business"): { cpf: string; cnpj?: string } {
  if (typeof cpfInput !== "string" || cpfInput.length > 18 || !/^[\d.\-\s]+$/.test(cpfInput)) throw new Error("INVALID_DOCUMENT");
  const cpf = cpfInput.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) throw new Error("INVALID_DOCUMENT");
  for (const size of [9, 10]) {
    const sum = [...cpf.slice(0, size)].reduce((s, n, i) => s + Number(n) * (size + 1 - i), 0);
    if ((sum * 10 % 11 % 10) !== Number(cpf[size])) throw new Error("INVALID_DOCUMENT");
  }
  if (mode === "personal") {
    if (cnpjInput) throw new Error("INVALID_DOCUMENT");
    return { cpf };
  }
  if (typeof cnpjInput !== "string" || cnpjInput.length > 22 || !/^[\d./\-\s]+$/.test(cnpjInput)) throw new Error("INVALID_DOCUMENT");
  const cnpj = cnpjInput.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) throw new Error("INVALID_DOCUMENT");
  for (const size of [12, 13]) {
    const weights = size === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const remainder = [...cnpj.slice(0, size)].reduce((s, n, i) => s + Number(n) * weights[i], 0) % 11;
    if ((remainder < 2 ? 0 : 11 - remainder) !== Number(cnpj[size])) throw new Error("INVALID_DOCUMENT");
  }
  return { cpf, cnpj };
}
