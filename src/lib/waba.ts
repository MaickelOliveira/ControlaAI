import { getConfig } from "@/lib/whatsapp-config";

const GRAPH_VERSION = "v19.0";

function phoneNumberId(): string {
  return getConfig().waba?.phoneNumberId || "";
}
function accessToken(): string {
  return getConfig().waba?.accessToken || "";
}
export function verifyToken(): string {
  return getConfig().waba?.verifyToken || "";
}

export function isWabaConfigured(): boolean {
  return !!(phoneNumberId() && accessToken());
}

function normalizePhone(to: string): string {
  const digits = to.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export async function sendText(to: string, message: string): Promise<boolean> {
  const pnid = phoneNumberId();
  const token = accessToken();
  if (!pnid || !token) { console.warn("[waba] não configurado"); return false; }
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizePhone(to),
        type: "text",
        text: { body: message },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    // A Graph API pode devolver HTTP 2xx com um erro no corpo (ex: janela de
    // 24h fechada) — checar só res.ok não é suficiente.
    const ok = res.ok && !data?.error;
    if (!ok) console.error(`[waba] sendText falhou: ${data?.error?.message || res.status}`);
    return ok;
  } catch (e) {
    console.error("[waba] sendText erro:", e);
    return false;
  }
}

/** Mensagens iniciadas pela empresa fora da janela de 24h exigem um template
 *  aprovado — sendText silenciosamente falha nesse caso. Os templates atuais
 *  usam parâmetros NOMEADOS (ex: {{compromisso}}), não posicionais ({{1}}),
 *  então cada parâmetro do body leva parameter_name além de type/text. */
export async function sendTemplate(to: string, templateName: string, languageCode: string, params: Record<string, string>): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const pnid = phoneNumberId();
  const token = accessToken();
  if (!pnid || !token) { console.warn("[waba] não configurado"); return { ok: false, error: "WABA não configurado (Phone Number ID / Access Token)" }; }
  try {
    const parameters = Object.entries(params).map(([parameter_name, text]) => ({ type: "text", text, parameter_name }));
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizePhone(to),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: parameters.length ? [{ type: "body", parameters }] : [],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null) as { error?: { message?: string }; messages?: Array<{ id?: string }> } | null;
    const ok = res.ok && !data?.error;
    if (!ok) console.error(`[waba] sendTemplate(${templateName}) falhou: ${data?.error?.message || res.status}`);
    return { ok, error: ok ? undefined : (data?.error?.message || `HTTP ${res.status}`), messageId: data?.messages?.[0]?.id };
  } catch (e) {
    console.error("[waba] sendTemplate erro:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function wabaMediaType(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

/** Envia arquivo a partir de um Buffer — diferente do trafegopagoplataforma
 *  (que só manda link público), o Zelo não tem um host público de arquivos,
 *  então precisa do fluxo de upload da Graph API: sobe o buffer, recebe um
 *  media_id, e só então manda a mensagem referenciando esse id. */
export async function sendFile(to: string, fileBuffer: Buffer, filename: string, mimeType: string, caption?: string): Promise<boolean> {
  const pnid = phoneNumberId();
  const token = accessToken();
  if (!pnid || !token) { console.warn("[waba] não configurado"); return false; }
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);

    const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const uploadData = await uploadRes.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
    if (!uploadRes.ok || !uploadData?.id) {
      console.error(`[waba] upload de mídia falhou: ${uploadData?.error?.message || uploadRes.status}`);
      return false;
    }

    const type = wabaMediaType(mimeType);
    const mediaPayload: Record<string, unknown> = { id: uploadData.id };
    if (caption && (type === "image" || type === "video" || type === "document")) mediaPayload.caption = caption;
    if (type === "document") mediaPayload.filename = filename;

    const sendRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizePhone(to),
        type,
        [type]: mediaPayload,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const sendData = await sendRes.json().catch(() => null) as { error?: { message?: string } } | null;
    const ok = sendRes.ok && !sendData?.error;
    if (!ok) console.error(`[waba] sendFile falhou: ${sendData?.error?.message || sendRes.status}`);
    return ok;
  } catch (e) {
    console.error("[waba] sendFile erro:", e);
    return false;
  }
}

/** Mensagens recebidas na Cloud API só trazem o media id — baixa a URL
 *  temporária e depois o arquivo em si (2 chamadas, ambas com Bearer). */
export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = accessToken();
  if (!token) return null;
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json() as { url?: string; mime_type?: string };
    if (!meta.url) return null;
    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!fileRes.ok) return null;
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type || "application/octet-stream" };
  } catch (e) {
    console.error("[waba] downloadMedia erro:", e);
    return null;
  }
}

/** WABA não tem "status de sessão" como Evolution — valida testando se o
 *  Phone Number ID + token conseguem consultar a própria conta. */
export async function checkConnection(): Promise<"CONNECTED" | "DISCONNECTED" | "UNKNOWN"> {
  const pnid = phoneNumberId();
  const token = accessToken();
  if (!pnid || !token) return "UNKNOWN";
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? "CONNECTED" : "DISCONNECTED";
  } catch { return "UNKNOWN"; }
}
