import { after, NextRequest, NextResponse } from "next/server";
import { verifyToken, verifySignature } from "@/lib/waba";
import { getConfig } from "@/lib/whatsapp-config";
import { beginWhatsAppActivity, type WhatsAppActivityLease } from "@/lib/whatsapp-activity";
import { readBankBody } from "@/lib/open-finance-body";
import {enqueueWabaMessages} from "@/lib/waba-inbox";
import {pumpWabaInbox, wakeWabaInboxWorker} from "@/lib/waba-worker";
import {runWithTrustedCompanyJob} from "@/lib/company-context";

/** Verificação do webhook exigida pela Meta ao cadastrar a URL no Business
 *  Manager — responde o hub.challenge em texto puro (não JSON) quando o
 *  verify_token bate com o configurado. */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge && token === await verifyToken()) {
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
  interactive?: { button_reply?: { id: string; title: string } };
};

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
    const signature = req.headers.get("x-hub-signature-256");
    if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Sem App Secret configurado, bloqueia — quem descobre essa URL sem
    // isso configurado conseguiria forjar "mensagens" em nome de qualquer
    // número de telefone. Antes só avisava no log e deixava passar; agora
    // falha fechado (nega por padrão) até o App Secret ser configurado em
    // Admin → WhatsApp.
    if (!(await getConfig()).waba?.appSecret) {
      console.error("[webhook/waba] App Secret não configurado — requisição rejeitada. Configure em Admin → WhatsApp.");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    let rawBody: string;
    try { rawBody = (await readBankBody(req, 1_048_576)).toString("utf8"); }
    catch { return NextResponse.json({ error: "Corpo inválido ou grande demais" }, { status: 413 }); }
    if (!(await verifySignature(rawBody, signature))) {
      console.error("[webhook/waba] assinatura inválida — requisição rejeitada");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = null;
    try { body = rawBody ? JSON.parse(rawBody) : null; } catch { body = null; }
    if (!body) return NextResponse.json({ ok: true });

    const groups: Array<{messages: WabaMessage[]; contactName?: string}> = [];
    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value;
        if (value?.messages != null && !Array.isArray(value.messages)) {
          return NextResponse.json({ error: "Temporariamente indisponível" }, { status: 503 });
        }
        if (value?.messages?.length) {
          groups.push({messages: value.messages as WabaMessage[], contactName: value.contacts?.[0]?.profile?.name});
        }
        const statuses = value?.statuses as WabaStatus[] | undefined;
        for (const st of Array.isArray(statuses) ? statuses : []) {
          if (st.status === "failed") console.error("[webhook/waba] Falha na entrega");
          else console.log("[webhook/waba] Atualização de status recebida");
        }
      }
    }
    if (!groups.length) return NextResponse.json({ ok: true });

    // Registra atividade e salva a mensagem antes do ACK. Se qualquer etapa
    // falhar, a Meta pode tentar novamente sem perder o conteúdo original.
    const receivedAt=Date.now();
    const leases: Array<WhatsAppActivityLease | undefined> = [];
    try {
      for (const group of groups) for (const msg of group.messages) {
        leases.push(msg.from && /^\d{8,20}$/.test(msg.from.replace(/\D/g,"")) ? await beginWhatsAppActivity(msg.from,"inbound") : undefined);
      }
    } catch {
      await Promise.allSettled(leases.map(lease=>lease?.finish()));
      return NextResponse.json({error:"Temporariamente indisponível"},{status:503});
    }
    try {
      let offset = 0;
      for (const group of groups) {
        await enqueueWabaMessages(group.messages, group.contactName, receivedAt + offset);
        offset += group.messages.length;
      }
    } catch {
      await Promise.allSettled(leases.map(lease => lease?.finish()));
      return NextResponse.json({ error: "Temporariamente indisponível" }, { status: 503 });
    }
    try {
      after(async () => {
        try { await runWithTrustedCompanyJob(pumpWabaInbox); }
        catch { console.error("[webhook/waba] Recuperação adiada"); }
        finally { await Promise.allSettled(leases.map(lease => lease?.finish())); }
      });
      wakeWabaInboxWorker();
    } catch {
      await Promise.allSettled(leases.map(lease => lease?.finish()));
      return NextResponse.json({ error: "Temporariamente indisponível" }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch  {
    console.error("[webhook/waba]");
    return NextResponse.json({ error: "Temporariamente indisponível" }, { status: 503 });
  }
}
