import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

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

const META_FILE = path.join(process.cwd(), "data", "drive-meta.json");
const FOLDERS_FILE = path.join(process.cwd(), "data", "drive-folders.json");
const DRIVE_DIR = path.join(process.cwd(), "data", "drive");

const DEFAULT_FOLDERS = ["Documentos", "Comprovantes", "Contratos", "Fotos", "Outros"];

function loadMeta(): DriveFile[] {
  try {
    if (!existsSync(META_FILE)) return [];
    return JSON.parse(readFileSync(META_FILE, "utf-8"));
  } catch { return []; }
}

function saveMeta(files: DriveFile[]) {
  writeFileSync(META_FILE, JSON.stringify(files, null, 2));
}

function loadFolders(): DriveFolder[] {
  try {
    if (!existsSync(FOLDERS_FILE)) return [];
    return JSON.parse(readFileSync(FOLDERS_FILE, "utf-8"));
  } catch { return []; }
}

function saveFolders(folders: DriveFolder[]) {
  writeFileSync(FOLDERS_FILE, JSON.stringify(folders, null, 2));
}

export function ensureDefaultFolders(userId: string): DriveFolder[] {
  const folders = loadFolders();
  const userRootFolders = folders.filter(f => f.userId === userId && f.parentId === null);
  let changed = false;

  for (const name of DEFAULT_FOLDERS) {
    if (!userRootFolders.some(f => f.name === name)) {
      folders.push({ id: randomUUID(), userId, name, parentId: null, createdAt: new Date().toISOString() });
      changed = true;
    }
  }

  if (changed) saveFolders(folders);
  return loadFolders().filter(f => f.userId === userId);
}

export function getFolders(userId: string): DriveFolder[] {
  ensureDefaultFolders(userId);
  return loadFolders().filter(f => f.userId === userId);
}

export function createFolder(userId: string, name: string, parentId: string | null = null): DriveFolder {
  const folders = loadFolders();
  const folder: DriveFolder = { id: randomUUID(), userId, name, parentId, createdAt: new Date().toISOString() };
  folders.push(folder);
  saveFolders(folders);
  return folder;
}

export function deleteFolder(userId: string, id: string): boolean {
  const folders = loadFolders();
  const idx = folders.findIndex(f => f.id === id && f.userId === userId);
  if (idx < 0) return false;
  folders.splice(idx, 1);
  saveFolders(folders);
  return true;
}

export function getFiles(userId: string, folderId?: string): DriveFile[] {
  const all = loadMeta().filter(f => f.userId === userId);
  if (folderId === undefined) return all;
  if (folderId === "root") return all.filter(f => f.folderId === null);
  return all.filter(f => f.folderId === folderId);
}

export function saveFile(data: {
  userId: string;
  folderId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  description?: string;
  aiKeywords?: string[];
  source: "whatsapp" | "web";
  buffer: Buffer;
}): DriveFile {
  const id = randomUUID();
  const ext = path.extname(data.originalName) || "";
  const storedName = `${id}${ext}`;

  const userDir = path.join(DRIVE_DIR, data.userId);
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });

  writeFileSync(path.join(userDir, storedName), data.buffer);

  const file: DriveFile = {
    id, userId: data.userId, folderId: data.folderId,
    originalName: data.originalName, storedName,
    mimeType: data.mimeType, size: data.size,
    description: data.description, aiKeywords: data.aiKeywords,
    source: data.source, createdAt: new Date().toISOString(),
  };

  const files = loadMeta();
  files.push(file);
  saveMeta(files);
  return file;
}

export function getFileById(id: string, userId: string): DriveFile | null {
  return loadMeta().find(f => f.id === id && f.userId === userId) ?? null;
}

export function getFilePath(file: DriveFile): string {
  return path.join(DRIVE_DIR, file.userId, file.storedName);
}

export function deleteFile(id: string, userId: string): boolean {
  const files = loadMeta();
  const idx = files.findIndex(f => f.id === id && f.userId === userId);
  if (idx < 0) return false;
  const file = files[idx];
  try { if (existsSync(getFilePath(file))) unlinkSync(getFilePath(file)); } catch { /* ignore */ }
  files.splice(idx, 1);
  saveMeta(files);
  return true;
}

export function updateFile(id: string, userId: string, patch: Partial<Pick<DriveFile, "folderId" | "description" | "aiKeywords" | "originalName">>): DriveFile | null {
  const files = loadMeta();
  const idx = files.findIndex(f => f.id === id && f.userId === userId);
  if (idx < 0) return null;
  files[idx] = { ...files[idx], ...patch };
  saveMeta(files);
  return files[idx];
}

export function searchFiles(userId: string, keyword: string): DriveFile[] {
  const lower = keyword.toLowerCase();
  return loadMeta().filter(f => {
    if (f.userId !== userId) return false;
    if (f.originalName.toLowerCase().includes(lower)) return true;
    if (f.description?.toLowerCase().includes(lower)) return true;
    if (f.aiKeywords?.some(k => k.toLowerCase().includes(lower))) return true;
    return false;
  });
}

export function getFolderByName(userId: string, name: string): DriveFolder | null {
  return loadFolders().find(f => f.userId === userId && f.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export function getRecentFile(userId: string): DriveFile | null {
  const files = loadMeta().filter(f => f.userId === userId);
  if (!files.length) return null;
  return files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export function getTotalSize(userId: string): number {
  return loadMeta().filter(f => f.userId === userId).reduce((sum, f) => sum + f.size, 0);
}
