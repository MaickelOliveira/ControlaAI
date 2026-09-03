import { NextRequest, NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { getSupportThread, markSupportReadByUser, postUserSupportMessage } from "@/lib/support-conversations";
import {
  deleteSupportImage,
  MAX_SUPPORT_FORM_BYTES,
  SupportImageError,
  uploadSupportImage,
} from "@/lib/support-attachments";

export async function GET() {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const thread = await getSupportThread(auth.user.id);
  await markSupportReadByUser(auth.user.id);
  return NextResponse.json(thread);
}

export async function POST(req: NextRequest) {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let text = "";
  let image: File | null = null;
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_SUPPORT_FORM_BYTES) {
      return NextResponse.json({ error: "A imagem deve ter no máximo 5 MB." }, { status: 413 });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) return NextResponse.json({ error: "Não foi possível ler o envio." }, { status: 400 });

    const textValue = formData.get("text");
    const imageValue = formData.get("image");
    text = typeof textValue === "string" ? textValue.trim() : "";
    image = imageValue && typeof imageValue !== "string" && imageValue.size > 0 ? imageValue : null;
  } else {
    const body = await req.json().catch(() => null);
    text = typeof body?.text === "string" ? body.text.trim() : "";
  }

  if (!text && !image) {
    return NextResponse.json({ error: "Escreva uma mensagem ou selecione uma imagem." }, { status: 400 });
  }

  let attachment;
  try {
    if (image) attachment = await uploadSupportImage(auth.user.id, image);
    const systemReplies = await postUserSupportMessage(auth.user.id, text, attachment);
    const thread = await getSupportThread(auth.user.id);
    return NextResponse.json({ ok: true, systemReplies, ...thread });
  } catch (error) {
    if (attachment) await deleteSupportImage(auth.user.id, attachment.fileName);
    if (error instanceof SupportImageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[support] Falha ao enviar mensagem:", error);
    return NextResponse.json({ error: "Não foi possível enviar a mensagem agora. Tente novamente." }, { status: 500 });
  }
}
