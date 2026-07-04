"use client";
import { useEffect, useRef, useState } from "react";

type DriveFolder = { id: string; name: string; parentId: string | null; createdAt: string };
type DriveFile = {
  id: string; folderId: string | null; originalName: string;
  mimeType: string; size: number; description?: string; source: string; createdAt: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊";
  return "📎";
}

export default function DrivePage() {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<DriveFolder | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load(folderId?: string) {
    setLoading(true);
    try {
      const url = folderId ? `/api/drive?folderId=${folderId}` : "/api/drive";
      const res = await fetch(url);
      const data = await res.json();
      setFolders(data.folders || []);
      setFiles(data.files || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(currentFolder?.id); }, [currentFolder]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    if (currentFolder) form.append("folderId", currentFolder.id);
    try {
      const res = await fetch("/api/drive", { method: "POST", body: form });
      if (res.ok) await load(currentFolder?.id);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm("Excluir este arquivo?")) return;
    await fetch(`/api/drive/${fileId}`, { method: "DELETE" });
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setSavingFolder(true);
    try {
      const res = await fetch("/api/drive/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: currentFolder?.id ?? null }),
      });
      if (res.ok) {
        setShowNewFolder(false);
        setNewFolderName("");
        await load(currentFolder?.id);
      }
    } finally {
      setSavingFolder(false);
    }
  }

  async function handleDeleteFolder(folderId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Excluir esta pasta?")) return;
    await fetch("/api/drive/folders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: folderId }),
    });
    await load(currentFolder?.id);
  }

  const rootFolders = folders.filter(f => f.parentId === null);
  const displayFiles = search
    ? files.filter(f => f.originalName.toLowerCase().includes(search.toLowerCase()) || f.description?.toLowerCase().includes(search.toLowerCase()))
    : files;

  const currentFolderFiles = currentFolder
    ? displayFiles.filter(f => f.folderId === currentFolder.id)
    : displayFiles;

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📁 Drive Inteligente</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {files.length} arquivo{files.length !== 1 ? "s" : ""} · {formatSize(totalSize)} usado{totalSize > 0 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            <span className="text-base">📂</span> Nova pasta
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-60"
          >
            {uploading ? "Enviando..." : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload
              </>
            )}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* WhatsApp hint */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
        <span className="text-2xl shrink-0">💡</span>
        <div className="text-sm text-emerald-800">
          <p className="font-semibold">Envie arquivos pelo WhatsApp!</p>
          <p className="text-emerald-700 mt-0.5">Mande PDF, imagem ou documento direto no chat e a IA organiza automaticamente. Para buscar: <em>"Ache o comprovante do mecânico"</em></p>
        </div>
      </div>

      {/* New folder modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900">Nova pasta</h3>
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateFolder()}
              placeholder="Nome da pasta..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 transition">Cancelar</button>
              <button onClick={handleCreateFolder} disabled={savingFolder || !newFolderName.trim()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-60">
                {savingFolder ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar arquivos..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
        />
      </div>

      {/* Breadcrumb / folder nav */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <button
          onClick={() => setCurrentFolder(null)}
          className={`hover:text-slate-800 transition ${!currentFolder ? "font-semibold text-slate-900" : ""}`}
        >
          📁 Drive
        </button>
        {currentFolder && (
          <>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">{currentFolder.name}</span>
          </>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {/* Folders grid — only show at root level */}
          {!currentFolder && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Pastas</p>
              {rootFolders.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma pasta ainda.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {rootFolders.map(folder => {
                    const count = files.filter(f => f.folderId === folder.id).length;
                    return (
                      <div
                        key={folder.id}
                        onClick={() => setCurrentFolder(folder)}
                        className="group relative bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition"
                      >
                        <button
                          onClick={e => handleDeleteFolder(folder.id, e)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-slate-300 hover:text-red-500 text-xs"
                        >
                          ✕
                        </button>
                        <div className="text-3xl mb-2">📁</div>
                        <p className="text-sm font-semibold text-slate-800 truncate">{folder.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{count} arquivo{count !== 1 ? "s" : ""}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Files list */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              {currentFolder ? `Arquivos em ${currentFolder.name}` : "Todos os arquivos"}
            </p>
            {currentFolderFiles.length === 0 ? (
              <div className="text-center py-12 bg-white border border-dashed border-slate-200 rounded-xl">
                <p className="text-4xl mb-3">📂</p>
                <p className="text-slate-500 text-sm">
                  {search ? "Nenhum arquivo encontrado." : "Nenhum arquivo aqui ainda."}
                </p>
                {!search && (
                  <p className="text-slate-400 text-xs mt-1">Clique em Upload ou envie pelo WhatsApp.</p>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {currentFolderFiles.map(file => {
                    const folder = folders.find(f => f.id === file.folderId);
                    return (
                      <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition group">
                        <span className="text-xl shrink-0">{fileIcon(file.mimeType)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{file.originalName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-400">{formatSize(file.size)}</span>
                            {folder && !currentFolder && (
                              <span className="text-xs text-slate-400">· {folder.name}</span>
                            )}
                            <span className="text-xs text-slate-400">· {formatDate(file.createdAt)}</span>
                            {file.source === "whatsapp" && (
                              <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-1.5 py-0.5">WhatsApp</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <a
                            href={`/api/drive/${file.id}/serve`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            title="Visualizar"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </a>
                          <a
                            href={`/api/drive/${file.id}/serve`}
                            download={file.originalName}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            title="Download"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </a>
                          <button
                            onClick={() => handleDelete(file.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                            title="Excluir"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
