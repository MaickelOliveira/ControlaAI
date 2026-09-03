import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { downloadSupportImage, supportImageMimeFromFileName } from "@/lib/support-attachments";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string; fileName: string }> },
) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { userId, fileName } = await params;
  const mimeType = supportImageMimeFromFileName(fileName);
  if (!mimeType) return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });

  const image = await downloadSupportImage(userId, fileName);
  if (!image) return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });

  return new NextResponse(await image.arrayBuffer(), {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
