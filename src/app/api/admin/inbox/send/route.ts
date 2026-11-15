import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { sendFile, sendText } from "@/lib/whatsapp";
import { setAiPaused } from "@/lib/conversations";
import { formatInboxMessage } from "@/lib/inbox-message-format";
import { MAX_SUPPORT_FORM_BYTES, readChatImage, SupportImageError } from "@/lib/support-attachments";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const multipart = req.headers.get("content-type")?.includes("multipart/form-data");
  const maxBytes = multipart ? MAX_SUPPORT_FORM_BYTES : 32 * 1024;
  if (Number(req.headers.get("content-length")) > maxBytes) {
    return NextResponse.json({ error: "O envio é grande demais." }, { status: 413 });
  }
  const form = multipart ? await req.formData().catch(() => null) : null;
  const body = multipart ? null : await req.json().catch(() => null);
  const to = form?.get("phone") ?? body?.phone;
  const text = form?.get("content") ?? body?.content;
  const image = form?.get("image");
  const phone = typeof to === "string" ? to : "";
  const content = typeof text === "string" ? formatInboxMessage(text) : "";
  if (!/^\d{8,20}$/.test(phone) || (!content && !(image instanceof File))) {
    return NextResponse.json({ error: "Selecione uma conversa e escreva uma mensagem ou anexe uma imagem." }, { status: 400 });
  }
  const limit = image instanceof File ? 1024 : 4096;
  if (content.length > limit) {
    return NextResponse.json({ error: `Use até ${limit} caracteres ${image instanceof File ? "na legenda" : "na mensagem"}.` }, { status: 400 });
  }

  try {
    let ok;
    if (image instanceof File) {
      const { bytes, mimeType, extension } = await readChatImage(image, false);
      ok = await sendFile(phone, Buffer.from(bytes), `imagem.${extension}`, mimeType, content);
    } else {
      ok = await sendText(phone, content);
    }
    if (!ok) return NextResponse.json({ error: "O WhatsApp não aceitou o envio." }, { status: 502 });
  } catch (error) {
    if (error instanceof SupportImageError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível confirmar o envio. Confira a conversa antes de tentar novamente." }, { status: 503 });
  }

  // Resposta manual pelo Inbox pausa a IA — evita que ela responda por cima
  // do que o atendente acabou de mandar.
  try {
    await setAiPaused(phone, true);
  } catch {
    return NextResponse.json({ ok: true, warning: "Mensagem enviada. Não foi possível pausar a IA." });
  }
  return NextResponse.json({ ok: true });
}
