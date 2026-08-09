import { getConfig } from "@/lib/whatsapp-config";

async function base(): Promise<string> {
  return ((await getConfig()).evolution?.server || "").replace(/\/$/, "");
}
async function adminKey(): Promise<string> {
  return (await getConfig()).evolution?.adminKey || "";
}
async function instanceName(): Promise<string> {
  return (await getConfig()).evolution?.instanceName || "zelo";
}
/** apikey da instância tem prioridade sobre a admin key quando disponível
 *  (mesmo padrão do trafegopagoplataforma) — mas a admin key funciona em
 *  qualquer instância, então serve de fallback. */
async function apiKey(): Promise<string> {
  return (await getConfig()).evolution?.instanceApiKey || await adminKey();
}

export async function isEvolutionConfigured(): Promise<boolean> {
  return !!(await base() && await adminKey());
}

async function authHeader(): Promise<Record<string, string>> {
  return { apikey: await apiKey() };
}

/** Cria a instância (QR já vem na própria resposta). Se já existir, cai em
 *  restartInstance() automaticamente (Evolution retorna não-2xx em create
 *  duplicado). */
export async function createOrRestartInstance(webhookUrl: string): Promise<{ apiKey: string; qrBase64: string | null } | null> {
  const b = await base();
  if (!b || !(await adminKey())) return null;
  const name = await instanceName();
  try {
    const res = await fetch(`${b}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: await adminKey() },
      body: JSON.stringify({ instanceName: name, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const restarted = await restartInstance();
      if (!restarted) return null;
      return { apiKey: await apiKey(), qrBase64: await getQrCode() };
    }
    const data = await res.json() as Record<string, unknown>;
    const hash = (data?.hash as Record<string, unknown> | undefined)?.apikey as string | undefined
      ?? (data?.hash as string | undefined)
      ?? "";
    const qr = (data?.qrcode as Record<string, unknown> | undefined)?.base64 as string | undefined ?? null;
    await setWebhook(hash || undefined, webhookUrl);
    return { apiKey: hash, qrBase64: qr };
  } catch (e) {
    console.error("[evolution] createOrRestartInstance erro:", e);
    return null;
  }
}

export async function restartInstance(): Promise<boolean> {
  const b = await base();
  if (!b) return false;
  try {
    const res = await fetch(`${b}/instance/restart/${await instanceName()}`, {
      method: "POST",
      headers: await authHeader(),
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok;
  } catch { return false; }
}

export async function setWebhook(instanceApiKey: string | undefined, webhookUrl: string): Promise<boolean> {
  const b = await base();
  if (!b) return false;
  try {
    const res = await fetch(`${b}/webhook/set/${await instanceName()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instanceApiKey || await apiKey() },
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          enabled: true,
          webhookByEvents: false,
          webhookBase64: true,
          events: ["QRCODE_UPDATED", "MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch (e) {
    console.error("[evolution] setWebhook erro:", e);
    return false;
  }
}

export async function getQrCode(): Promise<string | null> {
  const b = await base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/instance/connect/${await instanceName()}`, {
      headers: await authHeader(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const qr: string = (data?.base64 as string) || (data?.qrcode as Record<string, unknown> | undefined)?.base64 as string || "";
    if (!qr) return null;
    return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
  } catch { return null; }
}

export async function checkConnectionStatus(): Promise<"CONNECTED" | "DISCONNECTED" | "QRCODE" | "UNKNOWN"> {
  const b = await base();
  if (!b) return "UNKNOWN";
  try {
    const res = await fetch(`${b}/instance/connectionState/${await instanceName()}`, {
      headers: await authHeader(),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "UNKNOWN";
    const data = await res.json() as Record<string, unknown>;
    const state = String((data?.instance as Record<string, unknown> | undefined)?.state ?? "").toLowerCase();
    if (["open", "connected"].includes(state)) return "CONNECTED";
    if (state === "connecting") return "QRCODE";
    if (["close", "closed", "disconnected"].includes(state)) return "DISCONNECTED";
    return "UNKNOWN";
  } catch { return "UNKNOWN"; }
}

/** Descobre o número conectado à instância (usado por detectBotNumber). */
export async function getInstancePhone(): Promise<string | null> {
  const b = await base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/instance/fetchInstances?instanceName=${encodeURIComponent(await instanceName())}`, {
      headers: await authHeader(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : [data];
    for (const item of list) {
      const ownerJid = (item?.ownerJid ?? item?.instance?.ownerJid) as string | undefined;
      if (ownerJid) return ownerJid.replace(/@.*/, "").replace(/\D/g, "");
    }
    return null;
  } catch { return null; }
}

function normalizePhone(to: string): string {
  const raw = to.trim();
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export async function sendText(to: string, message: string): Promise<boolean> {
  const b = await base();
  if (!b) { console.warn("[evolution] não configurado"); return false; }
  try {
    const res = await fetch(`${b}/message/sendText/${await instanceName()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: await apiKey() },
      body: JSON.stringify({ number: normalizePhone(to), text: message }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[evolution] sendText falhou ${res.status}: ${err.slice(0, 200)}`);
    }
    return res.ok;
  } catch (e) {
    console.error("[evolution] sendText erro:", e);
    return false;
  }
}

function mediaTypeFor(mimeType: string): "image" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

export async function sendFile(to: string, fileBuffer: Buffer, filename: string, mimeType: string, caption?: string): Promise<boolean> {
  const b = await base();
  if (!b) { console.warn("[evolution] não configurado"); return false; }
  try {
    const number = normalizePhone(to);
    if (mimeType.startsWith("audio/")) {
      const res = await fetch(`${b}/message/sendWhatsAppAudio/${await instanceName()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: await apiKey() },
        body: JSON.stringify({ number, audio: fileBuffer.toString("base64") }),
        signal: AbortSignal.timeout(30_000),
      });
      return res.ok;
    }
    const res = await fetch(`${b}/message/sendMedia/${await instanceName()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: await apiKey() },
      body: JSON.stringify({
        number,
        mediatype: mediaTypeFor(mimeType),
        media: fileBuffer.toString("base64"),
        caption: caption || "",
        fileName: filename,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[evolution] sendFile falhou ${res.status}: ${err.slice(0, 200)}`);
    }
    return res.ok;
  } catch (e) {
    console.error("[evolution] sendFile erro:", e);
    return false;
  }
}

/** Busca a mídia recebida decodificada quando o webhook não traz base64
 *  inline (webhookBase64:true configurado, mas nem sempre confiável). */
export async function getBase64FromMediaMessage(messageId: string): Promise<{ base64: string; mimetype: string } | null> {
  const b = await base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/chat/getBase64FromMediaMessage/${await instanceName()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: await apiKey() },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const b64 = data?.base64 as string | undefined;
    const mimetype = data?.mimetype as string | undefined;
    if (!b64) return null;
    return { base64: b64, mimetype: mimetype || "application/octet-stream" };
  } catch { return null; }
}
