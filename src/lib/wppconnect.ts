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
    const phone = to.replace(/\D/g, "");
    const res = await fetch(`${b}/api/${s}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ phone: `${phone}@c.us`, message }),
      signal: AbortSignal.timeout(15_000),
    });
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
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "DISCONNECTED";
    const data = await res.json();
    return data?.status === "CONNECTED" ? "CONNECTED" : "DISCONNECTED";
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
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.qrcode ?? null;
  } catch { return null; }
}

export async function startSession(webhookUrl: string): Promise<boolean> {
  const b = base();
  const t = token();
  const s = session();
  if (!b || !t) return false;
  try {
    const res = await fetch(`${b}/api/${s}/start-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ webhook: webhookUrl, waitQrCode: false }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch { return false; }
}

/** Gera o JWT de sessão usando a secret key do servidor WPPConnect.
 *  Salva automaticamente o token no config para uso posterior. */
export async function generateAndSaveToken(): Promise<{ token: string; error?: string } | null> {
  const cfg = getConfig();
  const b = (cfg.wppServer || "").replace(/\/$/, "");
  const secret = cfg.wppSecretKey || "";
  const s = cfg.wppSession || "controlaai";
  if (!b || !secret) return { token: "", error: "Configure o servidor e a secret key primeiro" };
  try {
    const res = await fetch(`${b}/api/${s}/${secret}/generate-token`, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      return { token: "", error: `Servidor retornou erro: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    const tok: string = data?.token ?? (data?.full as string)?.replace("Bearer ", "") ?? "";
    if (!tok) return { token: "", error: "Servidor não retornou token. Verifique a secret key." };
    saveConfig({ ...cfg, wppToken: tok });
    return { token: tok };
  } catch (e) {
    return { token: "", error: String(e) };
  }
}
