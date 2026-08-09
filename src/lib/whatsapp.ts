import { getConfig } from "@/lib/whatsapp-config";
import * as evolution from "@/lib/evolution";
import * as waba from "@/lib/waba";
import { addMessage } from "@/lib/conversations";

/** Facade agnóstica de provider — dezenas de call-sites no bot (switch de
 *  intenções em message-handler.ts) usam só sendText/sendFile e não
 *  precisam saber se o provider ativo é Evolution ou WABA. Toda resposta
 *  enviada com sucesso é logada automaticamente no Inbox aqui, num único
 *  lugar, em vez de instrumentar cada call-site manualmente. */

export async function sendText(to: string, message: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
  const ok = provider === "waba" ? await waba.sendText(to, message) : await evolution.sendText(to, message);
  if (ok) await addMessage(to, { role: "assistant", content: message, ts: Date.now() });
  return ok;
}

/** Lembretes são sempre proativos (nunca respondem a uma mensagem do
 *  usuário), então quase sempre caem fora da janela de 24h — no WABA
 *  precisam ir como template aprovado, não texto livre. Evolution (API não
 *  oficial) não tem essa restrição, então continua mandando texto normal. */
export async function sendReminderTemplate(to: string, templateName: string, renderedText: string, params: Record<string, string>): Promise<boolean> {
  const provider = (await getConfig()).provider;
  let ok: boolean;
  if (provider === "waba") {
    const result = await waba.sendTemplate(to, templateName, "pt_BR", params);
    ok = result.ok;
    // wamid aqui é o único jeito de casar esse envio com o evento de status
    // (sent/delivered/read/failed) que chega depois, assíncrono, no webhook.
    if (ok) console.log(`[whatsapp] template ${templateName} → ${to} aceito, msg=${result.messageId}`);
  } else {
    ok = await evolution.sendText(to, renderedText);
  }
  if (ok) await addMessage(to, { role: "assistant", content: renderedText, ts: Date.now() });
  return ok;
}

export async function sendFile(to: string, fileBuffer: Buffer, filename: string, mimeType: string, caption?: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
  const ok = provider === "waba"
    ? await waba.sendFile(to, fileBuffer, filename, mimeType, caption)
    : await evolution.sendFile(to, fileBuffer, filename, mimeType, caption);
  if (ok) {
    const label = mimeType.startsWith("image/") ? "📷 Imagem" : mimeType.startsWith("audio/") ? "🎵 Áudio" : `📎 ${filename}`;
    await addMessage(to, { role: "assistant", content: caption ? `${label}\n${caption}` : label, ts: Date.now() });
  }
  return ok;
}

export async function checkConnection(): Promise<"CONNECTED" | "DISCONNECTED" | "QRCODE" | "UNKNOWN"> {
  const provider = (await getConfig()).provider;
  return provider === "waba" ? await waba.checkConnection() : await evolution.checkConnectionStatus();
}

/** Só Evolution usa QR — WABA não tem sessão pra escanear. */
export async function getQrCode(): Promise<string | null> {
  const provider = (await getConfig()).provider;
  if (provider === "waba") return null;
  return evolution.getQrCode();
}

export async function isConfigured(): Promise<boolean> {
  const provider = (await getConfig()).provider;
  return provider === "waba" ? waba.isWabaConfigured() : evolution.isEvolutionConfigured();
}
