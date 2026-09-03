import { getSupabase } from "./supabase";

export const SUPPORT_IMAGE_BUCKET = "support-attachments";
export const MAX_SUPPORT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_SUPPORT_FORM_BYTES = MAX_SUPPORT_IMAGE_BYTES + 512 * 1024;

export type SupportImageMime = "image/jpeg" | "image/png" | "image/webp";

export type SupportImageAttachment = {
  type: "image";
  fileName: string;
  mimeType: SupportImageMime;
  size: number;
};

const EXTENSION_BY_MIME: Record<SupportImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIME_BY_EXTENSION: Record<string, SupportImageMime> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export class SupportImageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SupportImageError";
  }
}

export function supportImageMimeFromFileName(fileName: string): SupportImageMime | null {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.(jpg|png|webp)$/i.test(fileName)) return null;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function hasValidImageSignature(bytes: Uint8Array, mimeType: SupportImageMime): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }

  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

export async function uploadSupportImage(userId: string, file: File): Promise<SupportImageAttachment> {
  const mimeType = file.type.toLowerCase() as SupportImageMime;
  const extension = EXTENSION_BY_MIME[mimeType];

  if (!extension) {
    throw new SupportImageError("Envie uma imagem JPG, PNG ou WEBP.", 400);
  }
  if (file.size <= 0) {
    throw new SupportImageError("A imagem selecionada está vazia.", 400);
  }
  if (file.size > MAX_SUPPORT_IMAGE_BYTES) {
    throw new SupportImageError("A imagem deve ter no máximo 5 MB.", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidImageSignature(bytes, mimeType)) {
    throw new SupportImageError("O arquivo selecionado não é uma imagem válida.", 400);
  }

  const fileName = `${crypto.randomUUID()}.${extension}`;
  const { error } = await getSupabase().storage
    .from(SUPPORT_IMAGE_BUCKET)
    .upload(`${userId}/${fileName}`, bytes, {
      contentType: mimeType,
      cacheControl: "300",
      upsert: false,
    });

  if (error) {
    console.error("[support] Falha no upload da imagem:", error.message);
    throw new SupportImageError("Não foi possível enviar a imagem agora. Tente novamente.", 500);
  }

  return { type: "image", fileName, mimeType, size: file.size };
}

export async function deleteSupportImage(userId: string, fileName: string): Promise<void> {
  if (!supportImageMimeFromFileName(fileName)) return;
  const { error } = await getSupabase().storage.from(SUPPORT_IMAGE_BUCKET).remove([`${userId}/${fileName}`]);
  if (error) console.error("[support] Falha ao remover imagem órfã:", error.message);
}

export async function downloadSupportImage(userId: string, fileName: string): Promise<Blob | null> {
  if (!supportImageMimeFromFileName(fileName)) return null;
  const { data, error } = await getSupabase().storage.from(SUPPORT_IMAGE_BUCKET).download(`${userId}/${fileName}`);
  if (error || !data) return null;
  return data;
}
