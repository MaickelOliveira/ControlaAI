import { NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { downloadSupportImage, supportImageMimeFromFileName } from "@/lib/support-attachments";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { fileName } = await params;
  const mimeType = supportImageMimeFromFileName(fileName);
  if (!mimeType) return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });

  const image = await downloadSupportImage(auth.user.id, fileName);
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
