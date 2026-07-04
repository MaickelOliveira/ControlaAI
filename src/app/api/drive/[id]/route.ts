import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFileById, deleteFile, updateFile } from "@/lib/drive";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const ok = deleteFile(id, session.sub);
  if (!ok) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const file = getFileById(id, session.sub);
  if (!file) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

  const patch: Parameters<typeof updateFile>[2] = {};
  if (body.folderId !== undefined) patch.folderId = body.folderId;
  if (body.description !== undefined) patch.description = body.description;
  if (body.originalName !== undefined) patch.originalName = body.originalName;

  const updated = updateFile(id, session.sub, patch);
  return NextResponse.json(updated);
}
