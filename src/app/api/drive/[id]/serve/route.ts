import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFileById, getFileBuffer } from "@/lib/drive";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const file = await getFileById(id, session.sub);
  if (!file) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

  const buffer = await getFileBuffer(file);
  if (!buffer) return NextResponse.json({ error: "Arquivo não encontrado no servidor" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
