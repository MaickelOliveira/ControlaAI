import { NextRequest, NextResponse } from "next/server";
import { handleIncomingMessage } from "@/lib/message-handler";
import { downloadMedia, verifyToken } from "@/lib/waba";
import { transcribeAudio } from "@/lib/ai-processor";

/** Verificação do webhook exigida pela Meta ao cadastrar a URL no Business
 *  Manager — responde o hub.challenge em texto puro (não JSON) quando o
 *  verify_token bate com o configurado. */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge && token === verifyToken()) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

type WabaMessage = {
  id?: string;
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  video?: { id: string; caption?: string };
  audio?: { id: string };
  document?: { id: string; caption?: string; filename?: string };
  button?: { text: string; payload: string };
};

/** A Meta espera um ACK rápido (~poucos segundos) e reenvia o mesmo webhook
 *  se não receber a tempo. Analisar uma fatura em PDF pela IA pode levar
 *  dezenas de segundos, então processar tudo antes de responder fazia a
 *  Meta reenviar o mesmo arquivo mais tarde, reprocessando-o de novo do
 *  zero — daí a mensagem "já parece estar registrado" aparecendo sozinha
 *  de vez em quando. Guarda de IDs recentes como segunda camada, caso
 *  aconteça reentrega por qualquer outro motivo. */
const recentMessageIds = new Set<string>();
const MAX_TRACKED_IDS = 500;
function alreadyProcessed(id: string | undefined): boolean {
  if (!id) return false;
  if (recentMessageIds.has(id)) return true;
  recentMessageIds.add(id);
  if (recentMessageIds.size > MAX_TRACKED_IDS) {
    const oldest = recentMessageIds.values().next().value;
    if (oldest) recentMessageIds.delete(oldest);
  }
  return false;
}

/** A Graph API aceitar o envio (HTTP 2xx, sem erro no corpo) não garante
 *  entrega — falhas de entrega (número inválido, template pausado, etc.)
 *  chegam depois, de forma assíncrona, como um evento de status aqui no
 *  webhook. Sem logar isso, um "sendTemplate" que retornou ok:true pode
 *  ainda assim nunca ter chegado no aparelho, sem nenhum rastro no log. */
type WabaStatus = {
  id: string;
  status: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages as WabaMessage[] | undefined;

    if (!messages?.length) {
      const statuses = value?.statuses as WabaStatus[] | undefined;
      for (const st of statuses || []) {
        if (st.status === "failed") {
          const err = st.errors?.[0];
          console.error(`[webhook/waba] entrega falhou — msg=${st.id} para=${st.recipient_id}: ${err?.title || ""} ${err?.message || ""} ${err?.error_data?.details || ""}`.trim());
        } else {
          console.log(`[webhook/waba] status msg=${st.id} → ${st.status}`);
        }
      }
      return NextResponse.json({ ok: true }); // status update, não mensagem
    }

    const contact = value?.contacts?.[0];
    const contactName = contact?.profile?.name as string | undefined;

    // Responde a Meta já — o processamento roda em background, sem bloquear
    // o ACK (ver comentário de alreadyProcessed acima).
    processMessages(messages, contactName).catch(e => console.error("[webhook/waba] erro no processamento em background:", e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook/waba]", e);
    return NextResponse.json({ ok: true });
  }
}

async function processMessages(messages: WabaMessage[], contactName?: string) {
  for (const msg of messages) {
    if (alreadyProcessed(msg.id)) { console.log(`[webhook/waba] msg=${msg.id} já processada, ignorando reentrega`); continue; }

    const from = (msg.from || "").replace(/\D/g, "");
    if (!from) continue;

    if (msg.type === "text") {
      const text = msg.text?.body?.trim();
      if (!text) continue;
      await handleIncomingMessage({ from, text, contactName });
      continue;
    }

    if (msg.type === "button" && msg.button?.text) {
      await handleIncomingMessage({ from, text: msg.button.text, contactName });
      continue;
    }

    if (msg.type === "audio" && msg.audio?.id) {
      const media = await downloadMedia(msg.audio.id);
      if (!media) continue;
      const transcript = await transcribeAudio(media.buffer, media.mimeType).catch(() => null);
      if (!transcript) continue;
      await handleIncomingMessage({ from, text: transcript, contactName });
      continue;
    }

    if (["image", "video", "document"].includes(msg.type)) {
      const mediaField = msg[msg.type as "image" | "video" | "document"] as { id: string; caption?: string; filename?: string } | undefined;
      if (!mediaField?.id) continue;
      const media = await downloadMedia(mediaField.id);
      if (!media) continue;
      await handleIncomingMessage({
        from,
        text: "",
        contactName,
        isFileMessage: true,
        fileBuffer: media.buffer,
        fileMimeType: media.mimeType,
        fileCaption: mediaField.caption,
        fileName: mediaField.filename || `arquivo_${Date.now()}`,
      });
    }
  }
}
