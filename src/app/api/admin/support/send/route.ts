import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { sendAdminSupportMessage } from "@/lib/support-conversations";
import {
  deleteSupportImage,
  MAX_SUPPORT_FORM_BYTES,
  SupportImageError,
  uploadSupportImage,
} from "@/lib/support-attachments";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let userId = "";
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

    const userIdValue = formData.get("userId");
    const textValue = formData.get("text");
    const imageValue = formData.get("image");
    userId = typeof userIdValue === "string" ? userIdValue.trim() : "";
    text = typeof textValue === "string" ? textValue.trim() : "";
    image = imageValue && typeof imageValue !== "string" && imageValue.size > 0 ? imageValue : null;
  } else {
    const body = await req.json().catch(() => null);
    userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    text = typeof body?.text === "string" ? body.text.trim() : "";
  }

  if (!userId) return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  if (!text && !image) {
    return NextResponse.json({ error: "Escreva uma mensagem ou selecione uma imagem." }, { status: 400 });
  }

  let attachment;
  try {
    if (image) attachment = await uploadSupportImage(userId, image);
    const message = await sendAdminSupportMessage(userId, text, attachment);
    return NextResponse.json({ ok: true, message });
  } catch (error) {
    if (attachment) await deleteSupportImage(userId, attachment.fileName);
    if (error instanceof SupportImageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[support] Falha ao enviar mensagem do administrador:", error);
    return NextResponse.json({ error: "Não foi possível enviar a mensagem agora. Tente novamente." }, { status: 500 });
  }
}
