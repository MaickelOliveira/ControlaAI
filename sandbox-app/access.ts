import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE = "zelo_polp_sandbox";
export const SESSION_SECONDS = 8 * 3600;

// This service must never inherit the production application's environment.
export function configured(): boolean {
  const forbidden = /^(SUPABASE_|JWT_SECRET$|CRON_SECRET$|BREVO_|EVOLUTION_|WABA_|WHATSAPP_|META_|GOOGLE_|OPENAI_)/;
  if (Object.entries(process.env).some(([key, value]) => value && forbidden.test(key))) return false;
  let secureAddress = false;
  try { secureAddress = new URL(process.env.SANDBOX_APP_URL || "").protocol === "https:"; } catch { /* fail closed */ }
  return process.env.POLP_SANDBOX_ENABLED === "true" && secureAddress
    && /^[a-f0-9]{64}$/.test(process.env.SANDBOX_ACCESS_CODE || "")
    && Boolean(process.env.POLP_SANDBOX_CLIENT_ID && process.env.POLP_SANDBOX_CLIENT_SECRET);
}

export function acceptsCode(code: string): boolean {
  if (!configured() || code.length > 128) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(code), digest(process.env.SANDBOX_ACCESS_CODE!));
}

function signature(value: string): string {
  return createHmac("sha256", process.env.SANDBOX_ACCESS_CODE!).update("polp-sandbox:" + value).digest("hex");
}

export function issueSession(now = Math.floor(Date.now() / 1000)): string {
  if (!configured()) throw new Error("Sandbox indisponível.");
  const value = `${now + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  return `${value}.${signature(value)}`;
}

export function validSession(token?: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!configured() || !token || !/^\d{1,12}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, mac] = token.split(".");
  if (Number(expires) <= now || Number(expires) > now + SESSION_SECONDS) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(`${expires}.${nonce}`), "hex"));
}

export function sameOrigin(request: Request): boolean {
  return configured() && request.headers.get("origin") === new URL(process.env.SANDBOX_APP_URL!).origin;
}

// One replica only. A shared store is required before scaling this test service.
let attempts = 0;
let windowEnd = 0;
export function allowLogin(now = Date.now()): boolean {
  if (now >= windowEnd) { attempts = 0; windowEnd = now + 60_000; }
  return ++attempts <= 20;
}
