import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFileById, getFilePath } from "@/lib/drive";
import { readFileSync, existsSync } from "fs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const file = getFileById(id, session.sub);
  if (!file) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

  const filePath = getFilePath(file);
  if (!existsSync(filePath)) return NextResponse.json({ error: "Arquivo não encontrado no servidor" }, { status: 404 });

  const buffer = readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
