import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "data", "config.json");

export type WppConfig = {
  wppServer?: string;
  wppSecretKey?: string;  // chave secreta do servidor WPPConnect (para gerar o token)
  wppToken?: string;      // JWT gerado pelo servidor (preenchido automaticamente)
  wppSession?: string;
  geminiApiKey?: string;
  appBaseUrl?: string;
  wppBotNumber?: string;  // número WhatsApp do bot (ex: 5544999999999)
};

export function getConfig(): WppConfig {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch { return {}; }
}

export function saveConfig(config: WppConfig) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function base() {
  const cfg = getConfig();
  return (cfg.wppServer || process.env.WPPCONNECT_SERVER || "").replace(/\/$/, "");
}
function token() {
  const cfg = getConfig();
  return cfg.wppToken || process.env.WPPCONNECT_TOKEN || "";
}
function session() {
  const cfg = getConfig();
  return cfg.wppSession || process.env.WPPCONNECT_SESSION || "controlaai";
}

export async function sendText(to: string, message: string): Promise<boolean> {
  const b = base();
  const t = token();
  const s = session();
  if (!b || !t) {
    console.warn("[wpp] WPPConnect não configurado");
    return false;
  }
  try {
    // Preserva sufixo @lid se presente (WhatsApp Business LID), senão usa @c.us
    const rawTo = to.trim();
    const phoneId = rawTo.includes("@")
      ? rawTo
      : /^\d+$/.test(rawTo) && rawTo.length > 13
        ? `${rawTo}@lid`   // LID: números longos sem sufixo → @lid
        : `${rawTo.replace(/\D/g, "")}@c.us`; // número normal → @c.us

    const res = await fetch(`${b}/api/${s}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ phone: phoneId, message }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[wpp] sendText falhou ${res.status}: ${err.slice(0, 100)}`);
    }
    return res.ok;
  } catch (e) {
    console.error("[wpp] sendText erro:", e);
    return false;
  }
}

export async function checkConnection(): Promise<"CONNECTED" | "DISCONNECTED" | "UNKNOWN"> {
  const b = base();
  const t = token();
  const s = session();
  if (!b || !t) return "UNKNOWN";
  try {
    const res = await fetch(`${b}/api/${s}/check-connection-session`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "UNKNOWN";
    const data = await res.json() as Record<string, unknown>;
    // WPPConnect pode retornar status como boolean ou como string em vários formatos
    if (typeof data.status === "boolean") return data.status ? "CONNECTED" : "DISCONNECTED";
    const st = String(data.status ?? data.state ?? "").toUpperCase();
    if (["CONNECTED", "ISLOGGED", "OPEN", "AUTHENTICATED"].includes(st)) return "CONNECTED";
    if (["DISCONNECTED", "NOTLOGGED", "CLOSED"].includes(st)) return "DISCONNECTED";
    return "UNKNOWN";
  } catch { return "UNKNOWN"; }
}

export async function getQrCode(): Promise<string | null> {
  const b = base();
  const t = token();
  const s = session();
  if (!b || !t) return null;
  try {
    const res = await fetch(`${b}/api/${s}/qrcode-session`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("image/")) {
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const mime = contentType.split(";")[0].trim();
      return `data:${mime};base64,${b64}`;
    }
    const data = await res.json();
    const qr: string = data?.qrcode || data?.base64 || "";
    if (!qr) return null;
    return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
  } catch { return null; }
}

export async function startSession(webhookUrl: string): Promise<boolean> {
  const b = base();
  const t = token();
  const s = session();
  if (!b || !t) return false;
  // Fecha sessão anterior para evitar QR "zumbi" (sessão que ficou presa)
  await fetch(`${b}/api/${s}/close-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  try {
    const res = await fetch(`${b}/api/${s}/start-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ webhook: webhookUrl, waitQrCode: false, autoReadMessages: false, whatsappVersion: "" }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch { return false; }
}

/** Gera o JWT de sessão usando a secret key do servidor WPPConnect.
 *  Salva automaticamente o token no config para uso posterior.
 *  Aceita override de credenciais para não depender do config salvo. */
export async function generateAndSaveToken(override?: {
  wppServer?: string; wppSecretKey?: string; wppSession?: string;
}): Promise<{ token: string; url?: string; error?: string } | null> {
  const cfg = getConfig();
  const b = ((override?.wppServer ?? cfg.wppServer) || "").replace(/\/$/, "");
  const secret = (override?.wppSecretKey ?? cfg.wppSecretKey) || "";
  const s = (override?.wppSession ?? cfg.wppSession) || "controlaai";
  if (!b || !secret) return { token: "", error: "Configure o servidor e a secret key primeiro" };
  const url = `${b}/api/${s}/${secret}/generate-token`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      return { token: "", url, error: `Servidor retornou erro: ${text.slice(0, 300)}` };
    }
    const data = await res.json();
    const tok: string = data?.token ?? (data?.full as string)?.replace("Bearer ", "") ?? "";
    if (!tok) return { token: "", url, error: `Servidor não retornou token. Resposta: ${JSON.stringify(data)}` };
    saveConfig({ ...cfg, wppToken: tok });
    return { token: tok, url };
  } catch (e) {
    return { token: "", url, error: String(e) };
  }
}
