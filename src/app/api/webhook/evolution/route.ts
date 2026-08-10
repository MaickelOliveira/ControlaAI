import { NextRequest, NextResponse } from "next/server";
import { handleIncomingMessage } from "@/lib/message-handler";
import { sendText as wppSend } from "@/lib/whatsapp";
import { getBase64FromMediaMessage } from "@/lib/evolution";
import { transcribeAudio } from "@/lib/ai-processor";
import { getConfig } from "@/lib/whatsapp-config";

type EvolutionMessageData = {
  key?: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string };
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number | string;
};

const MEDIA_KEYS = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "extendedTextMessage"] as const;

function findMessageTypeObject(message: Record<string, unknown> | undefined): { key: string; obj: Record<string, unknown> } | null {
  if (!message) return null;
  for (const key of MEDIA_KEYS) {
    const obj = message[key];
    if (obj && typeof obj === "object") return { key, obj: obj as Record<string, unknown> };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Evolution não assina requisições — o segredo embutido na URL (gerado
    // e registrado em admin/whatsapp "connect") é a única defesa contra
    // alguém forjar mensagens chamando essa URL diretamente. Falha fechado:
    // sem secret configurado, rejeita (antes só avisava e deixava passar).
    const configuredSecret = (await getConfig()).evolution?.webhookSecret;
    if (!configuredSecret) {
      console.error("[webhook/evolution] webhookSecret não configurado — requisição rejeitada. Reconecte em Admin → WhatsApp pra gerar um.");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (req.nextUrl.searchParams.get("secret") !== configuredSecret) {
      console.error("[webhook/evolution] secret inválido — requisição rejeitada");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const event = String(body.event ?? "").toLowerCase().replace(/\./g, "_");
    if (event !== "messages_upsert") return NextResponse.json({ ok: true });

    const data = body.data as EvolutionMessageData | undefined;
    if (!data?.key) return NextResponse.json({ ok: true });
    if (data.key.fromMe) return NextResponse.json({ ok: true });

    let remoteJid = data.key.remoteJid || "";
    // Se vier como @lid, o WhatsApp escondeu o número real atrás de um ID
    // interno — o Baileys (biblioteca por trás do Evolution) só consegue
    // resolver isso pro número de telefone se já tiver visto esse contato
    // antes; quando resolve, manda em remoteJidAlt ou senderPn (nomes
    // diferentes pra mesma coisa, dependendo da versão). Se nenhum dos dois
    // vier, o número real simplesmente não está disponível nesse evento —
    // limitação do próprio WhatsApp, não dá pra contornar sempre (só na API
    // Oficial isso nunca acontece, o "from" já vem sempre como número real).
    if (remoteJid.endsWith("@lid")) {
      const real = [data.key.remoteJidAlt, data.key.senderPn].find(j => j && !j.endsWith("@lid"));
      if (real) remoteJid = real;
      else console.warn(`[webhook/evolution] contato chegou como @lid sem número real disponível (***${remoteJid.slice(-8)}) — vai processar mesmo assim, mas qualquer telefone salvo a partir daqui fica incorreto`);
    }
    if (remoteJid.endsWith("@g.us")) return NextResponse.json({ ok: true }); // ignora grupos

    const from = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
    if (!from) return NextResponse.json({ ok: true });

    // Filtra mensagens antigas (reimportadas em reconexão) — timestamp Baileys em segundos
    const ts = Number(data.messageTimestamp) || 0;
    if (ts > 0) {
      const ageSec = Date.now() / 1000 - ts;
      if (ageSec > 300 || ageSec < -30) return NextResponse.json({ ok: true });
    }

    const typeInfo = findMessageTypeObject(data.message);
    const contactName = data.pushName && data.pushName !== from ? data.pushName : undefined;

    // Texto simples
    if (!typeInfo || typeInfo.key === "extendedTextMessage") {
      const text = typeInfo
        ? String(typeInfo.obj.text ?? "")
        : String(data.message?.conversation ?? "");
      if (!text.trim()) return NextResponse.json({ ok: true });
      await handleIncomingMessage({ from, text: text.trim(), contactName });
      return NextResponse.json({ ok: true });
    }

    // Mídia — resolve buffer (inline base64 ou fallback via API)
    let base64 = typeInfo.obj.base64 as string | undefined;
    let mimetype = (typeInfo.obj.mimetype as string | undefined) || "application/octet-stream";
    if (!base64 && data.key.id) {
      const fetched = await getBase64FromMediaMessage(data.key.id);
      if (fetched) { base64 = fetched.base64; mimetype = fetched.mimetype; }
    }
    if (!base64) return NextResponse.json({ ok: true });
    const buffer = Buffer.from(base64, "base64");
    const caption = typeInfo.obj.caption as string | undefined;

    if (typeInfo.key === "audioMessage") {
      const mime = mimetype.split(";")[0].trim() || "audio/ogg";
      const transcript = await transcribeAudio(buffer, mime).catch(() => null);
      if (!transcript) {
        await wppSend(from, "🎤 Não consegui entender o áudio. Pode digitar sua mensagem?");
        return NextResponse.json({ ok: true });
      }
      await handleIncomingMessage({ from, text: transcript, contactName });
      return NextResponse.json({ ok: true });
    }

    // imagem/vídeo/documento/sticker
    await handleIncomingMessage({
      from,
      text: "",
      contactName,
      isFileMessage: true,
      fileBuffer: buffer,
      fileMimeType: mimetype,
      fileCaption: caption,
      fileName: `arquivo_${Date.now()}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook/evolution]", e);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "Zelo Bot (Evolution)" });
}
