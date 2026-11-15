import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getHistory } from "@/lib/conversations";
import { downloadSupportImage, inboxImageUrl, supportImageMimeFromFileName } from "@/lib/support-attachments";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone") ?? "";
  const fileName = req.nextUrl.searchParams.get("file") ?? "";
  const mimeType = supportImageMimeFromFileName(fileName);
  if (!/^\d{8,20}$/.test(phone) || !mimeType) {
    return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });
  }

  const url = inboxImageUrl(phone, fileName);
  const history = await getHistory(phone);
  const image = history.some(message => message.role === "user" && message.type === "image" && message.mediaUrl === url)
    ? await downloadSupportImage(`whatsapp/${phone}`, fileName)
    : null;
  if (!image) return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });

  return new NextResponse(image, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
