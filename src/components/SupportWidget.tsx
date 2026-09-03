"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { clsx } from "clsx";
import Image from "next/image";

type SupportMessage = {
  sender: "user" | "admin" | "system";
  text: string;
  ts: number;
  attachment?: { type: "image"; fileName: string; mimeType: string; size: number };
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewRef = useRef<string | null>(null);

  const fetchMessages = useCallback(() => {
    fetch("/api/dashboard/support/messages")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setMessages(d.messages ?? []); });
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchMessages();
    const t = setInterval(fetchMessages, 3000);
    return () => clearInterval(t);
  }, [open, fetchMessages]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, open]);

  useEffect(() => () => {
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current);
  }, []);

  function selectImage(file: File | null) {
    setSendError(null);
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      setSendError("Envie uma imagem JPG, PNG ou WEBP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setSendError("A imagem deve ter no máximo 5 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current);
    const objectUrl = URL.createObjectURL(file);
    imagePreviewRef.current = objectUrl;
    setImagePreview(objectUrl);
    setSelectedImage(file);
  }

  function removeSelectedImage() {
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current);
    imagePreviewRef.current = null;
    setImagePreview(null);
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function send() {
    if ((!input.trim() && !selectedImage) || sending) return;
    setSending(true);
    const text = input.trim();
    setSendError(null);

    try {
      let r: Response;
      if (selectedImage) {
        const body = new FormData();
        body.set("text", text);
        body.set("image", selectedImage);
        r = await fetch("/api/dashboard/support/messages", { method: "POST", body });
      } else {
        r = await fetch("/api/dashboard/support/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }

      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setSendError(data?.error ?? "Não foi possível enviar. Tente novamente.");
        return;
      }

      setMessages(data?.messages ?? []);
      setInput("");
      removeSelectedImage();
    } catch {
      setSendError("Não foi possível enviar. Verifique sua conexão e tente novamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm h-[28rem] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="bg-[#128C7E] text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <p className="font-semibold text-sm">Suporte Zelo</p>
              <p className="text-[11px] text-emerald-50">A gente te ajuda por aqui</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-xl leading-none px-1" aria-label="Fechar">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F1F5F9]">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-400 mt-6">Manda sua dúvida ou problema que a gente te ajuda por aqui.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={clsx("flex", m.sender === "user" ? "justify-end" : "justify-start")}>
                <div className={clsx(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  m.sender === "user"
                    ? "bg-[#005c4b] text-white rounded-br-sm"
                    : m.sender === "admin"
                    ? "bg-white text-slate-800 rounded-bl-sm border border-slate-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200 text-xs italic"
                )}>
                  {m.attachment?.type === "image" && (
                    <a
                      href={`/api/dashboard/support/attachments/${encodeURIComponent(m.attachment.fileName)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                      title="Abrir imagem"
                    >
                      <Image
                        src={`/api/dashboard/support/attachments/${encodeURIComponent(m.attachment.fileName)}`}
                        alt="Imagem enviada para o suporte"
                        width={280}
                        height={210}
                        unoptimized
                        className="max-h-52 w-auto max-w-full rounded-lg object-contain"
                      />
                    </a>
                  )}
                  {m.text && <span className={clsx("block", m.attachment && "mt-1.5")}>{m.text}</span>}
                  <div className={clsx("text-[10px] mt-1", m.sender === "user" ? "text-emerald-100 text-right" : "text-slate-400")}>
                    {formatTime(m.ts)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-2.5 border-t border-slate-200 shrink-0">
            {imagePreview && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <Image src={imagePreview} alt="Pré-visualização da imagem" width={48} height={48} unoptimized
                  className="h-12 w-12 rounded-lg object-cover" />
                <p className="min-w-0 flex-1 truncate text-xs text-slate-600">{selectedImage?.name}</p>
                <button type="button" onClick={removeSelectedImage} disabled={sending}
                  className="h-7 w-7 rounded-full text-lg leading-none text-slate-500 hover:bg-slate-200 disabled:opacity-40"
                  aria-label="Remover imagem">×</button>
              </div>
            )}
            {sendError && <p className="mb-2 text-xs text-red-600" role="alert">{sendError}</p>}
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={e => selectImage(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}
                className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-40"
                aria-label="Anexar uma foto" title="Anexar foto (até 5 MB)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mx-auto h-5 w-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a3.75 3.75 0 0 0-5.303-5.303L6.11 9.53a5.25 5.25 0 0 0 7.425 7.425l7.5-7.5M8.25 12.75l7.5-7.5" />
                </svg>
              </button>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={selectedImage ? "Descreva o problema (opcional)..." : "Digite sua mensagem..."}
                className="min-w-0 flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 caret-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 transition" />
              <button onClick={send} disabled={(!input.trim() && !selectedImage) || sending}
                className="bg-[#128C7E] hover:bg-[#0e7268] text-white font-semibold rounded-xl px-3.5 text-sm transition disabled:opacity-40 shrink-0">
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)} aria-label="Suporte"
        className="fixed bottom-5 right-4 sm:right-6 z-50 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-full shadow-lg flex items-center overflow-hidden transition-colors">
        <span className="w-14 h-14 flex items-center justify-center shrink-0">
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
              <path d="M12 2C6.48 2 2 6.03 2 11c0 2.42 1.09 4.62 2.88 6.24L4 22l4.94-1.62C10.06 20.78 11.01 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" />
            </svg>
          )}
        </span>
        {!open && <span className="support-bubble-label pr-4 font-semibold text-sm whitespace-nowrap">Suporte</span>}
      </button>
    </>
  );
}
