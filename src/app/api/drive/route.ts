import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFiles, getFolders, saveFile } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId") ?? undefined;

  const files = getFiles(session.sub, folderId);
  const folders = getFolders(session.sub);

  return NextResponse.json({ files, folders });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const fileObj = formData.get("file") as File | null;
  if (!fileObj) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });

  const folderId = (formData.get("folderId") as string) || null;
  const description = (formData.get("description") as string) || undefined;

  const buffer = Buffer.from(await fileObj.arrayBuffer());
  const file = saveFile({
    userId: session.sub,
    folderId,
    originalName: fileObj.name,
    mimeType: fileObj.type || "application/octet-stream",
    size: buffer.length,
    description,
    source: "web",
    buffer,
  });

  return NextResponse.json(file, { status: 201 });
}
