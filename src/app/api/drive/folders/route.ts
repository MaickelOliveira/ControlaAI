import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFolders, createFolder, deleteFolder } from "@/lib/drive";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(getFolders(session.sub));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { name, parentId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  const folder = createFolder(session.sub, name.trim(), parentId ?? null);
  return NextResponse.json(folder, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const ok = deleteFolder(session.sub, id);
  if (!ok) return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
