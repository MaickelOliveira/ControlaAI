import { writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type DriveFile = {
  id: string;
  userId: string;
  folderId: string | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  description?: string;
  aiKeywords?: string[];
  source: "whatsapp" | "web";
  createdAt: string;
};

export type DriveFolder = {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

// Os BYTES do arquivo em si continuam em disco local (nunca estiveram no
// JSON — só a metadata estava) — fora do escopo desta migração pra
// Postgres. Se um dia isso precisar ir pro Supabase Storage, é uma
// migração separada.
const DRIVE_DIR = path.join(process.cwd(), "data", "drive");

const DEFAULT_FOLDERS = ["Documentos", "Comprovantes", "Contratos", "Fotos", "Outros"];

type FileRow = {
  id: string; user_id: string; folder_id: string | null; original_name: string; stored_name: string;
  mime_type: string; size: number; description: string | null; ai_keywords: string[]; source: "whatsapp" | "web"; created_at: string;
};

function fileFromRow(r: FileRow): DriveFile {
  return {
    id: r.id, userId: r.user_id, folderId: r.folder_id, originalName: r.original_name,
    storedName: r.stored_name, mimeType: r.mime_type, size: r.size, description: r.description ?? undefined,
    aiKeywords: r.ai_keywords, source: r.source, createdAt: r.created_at,
  };
}

type FolderRow = { id: string; user_id: string; name: string; parent_id: string | null; created_at: string };

function folderFromRow(r: FolderRow): DriveFolder {
  return { id: r.id, userId: r.user_id, name: r.name, parentId: r.parent_id, createdAt: r.created_at };
}

export async function ensureDefaultFolders(userId: string): Promise<DriveFolder[]> {
  const { data, error } = await getSupabase().from("drive_folders").select("*").eq("user_id", userId).is("parent_id", null);
  const userRootFolders = error || !data ? [] : (data as FolderRow[]).map(folderFromRow);

  const missing = DEFAULT_FOLDERS.filter(name => !userRootFolders.some(f => f.name === name));
  if (missing.length > 0) {
    const rows = missing.map(name => ({ id: randomUUID(), user_id: userId, name, parent_id: null }));
    await getSupabase().from("drive_folders").insert(rows);
  }

  const { data: all } = await getSupabase().from("drive_folders").select("*").eq("user_id", userId);
  return (all as FolderRow[] | null)?.map(folderFromRow) ?? [];
}

export async function getFolders(userId: string): Promise<DriveFolder[]> {
  return ensureDefaultFolders(userId);
}

export async function createFolder(userId: string, name: string, parentId: string | null = null): Promise<DriveFolder> {
  const row = { id: randomUUID(), user_id: userId, name, parent_id: parentId };
  const { data, error } = await getSupabase().from("drive_folders").insert(row).select("*").single();
  if (error) throw new Error(`[drive] createFolder falhou: ${error.message}`);
  return folderFromRow(data as FolderRow);
}

export async function deleteFolder(userId: string, id: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("drive_folders").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
}

export async function getFiles(userId: string, folderId?: string): Promise<DriveFile[]> {
  let query = getSupabase().from("drive_files").select("*").eq("user_id", userId);
  if (folderId === "root") query = query.is("folder_id", null);
  else if (folderId !== undefined) query = query.eq("folder_id", folderId);
  const { data, error } = await query;
  if (error) { console.error("[drive] getFiles erro:", error.message); return []; }
  return (data as FileRow[]).map(fileFromRow);
}

export async function saveFile(data: {
  userId: string;
  folderId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  description?: string;
  aiKeywords?: string[];
  source: "whatsapp" | "web";
  buffer: Buffer;
}): Promise<DriveFile> {
  const id = randomUUID();
  const ext = path.extname(data.originalName) || "";
  const storedName = `${id}${ext}`;

  const userDir = path.join(DRIVE_DIR, data.userId);
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });

  writeFileSync(path.join(userDir, storedName), data.buffer);

  const row = {
    id, user_id: data.userId, folder_id: data.folderId,
    original_name: data.originalName, stored_name: storedName,
    mime_type: data.mimeType, size: data.size,
    description: data.description, ai_keywords: data.aiKeywords ?? [],
    source: data.source,
  };
  const { data: inserted, error } = await getSupabase().from("drive_files").insert(row).select("*").single();
  if (error) throw new Error(`[drive] saveFile falhou: ${error.message}`);
  return fileFromRow(inserted as FileRow);
}

export async function getFileById(id: string, userId: string): Promise<DriveFile | null> {
  const { data, error } = await getSupabase().from("drive_files").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return fileFromRow(data as FileRow);
}

export function getFilePath(file: DriveFile): string {
  return path.join(DRIVE_DIR, file.userId, file.storedName);
}

export async function deleteFile(id: string, userId: string): Promise<boolean> {
  const file = await getFileById(id, userId);
  if (!file) return false;
  try { if (existsSync(getFilePath(file))) unlinkSync(getFilePath(file)); } catch { /* ignore */ }
  const { error, count } = await getSupabase().from("drive_files").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
}

export async function updateFile(id: string, userId: string, patch: Partial<Pick<DriveFile, "folderId" | "description" | "aiKeywords" | "originalName">>): Promise<DriveFile | null> {
  const rowPatch: Record<string, unknown> = {};
  if (patch.folderId !== undefined) rowPatch.folder_id = patch.folderId;
  if (patch.description !== undefined) rowPatch.description = patch.description;
  if (patch.aiKeywords !== undefined) rowPatch.ai_keywords = patch.aiKeywords;
  if (patch.originalName !== undefined) rowPatch.original_name = patch.originalName;
  const { data, error } = await getSupabase().from("drive_files").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fileFromRow(data as FileRow);
}

export async function searchFiles(userId: string, keyword: string): Promise<DriveFile[]> {
  const lower = keyword.toLowerCase();
  return (await getFiles(userId, undefined)).filter(f => {
    if (f.originalName.toLowerCase().includes(lower)) return true;
    if (f.description?.toLowerCase().includes(lower)) return true;
    if (f.aiKeywords?.some(k => k.toLowerCase().includes(lower))) return true;
    return false;
  });
}

export async function getFolderByName(userId: string, name: string): Promise<DriveFolder | null> {
  const { data, error } = await getSupabase().from("drive_folders").select("*").eq("user_id", userId).ilike("name", name).maybeSingle();
  if (error || !data) return null;
  return folderFromRow(data as FolderRow);
}

export async function getRecentFile(userId: string): Promise<DriveFile | null> {
  const files = await getFiles(userId, undefined);
  if (!files.length) return null;
  return files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export async function getTotalSize(userId: string): Promise<number> {
  return (await getFiles(userId, undefined)).reduce((sum, f) => sum + f.size, 0);
}
