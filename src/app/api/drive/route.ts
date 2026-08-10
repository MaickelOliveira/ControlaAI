import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFiles, getFolders, saveFile } from "@/lib/drive";
import { MAX_UPLOAD_BYTES, tooLarge, contentLengthTooLarge, validateUploadType } from "@/lib/upload-limits";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId") ?? undefined;

  const [files, folders] = await Promise.all([getFiles(session.sub, folderId), getFolders(session.sub)]);

  return NextResponse.json({ files, folders });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (contentLengthTooLarge(req)) return NextResponse.json({ error: `Arquivo muito grande — máximo ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` }, { status: 413 });

  const formData = await req.formData();
  const fileObj = formData.get("file") as File | null;
  if (!fileObj) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });
  if (tooLarge(fileObj.size)) return NextResponse.json({ error: `Arquivo muito grande — máximo ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` }, { status: 413 });
  if (!validateUploadType(fileObj.name, fileObj.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 415 });
  }

  const folderId = (formData.get("folderId") as string) || null;
  const description = (formData.get("description") as string) || undefined;

  const buffer = Buffer.from(await fileObj.arrayBuffer());
  const file = await saveFile({
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
