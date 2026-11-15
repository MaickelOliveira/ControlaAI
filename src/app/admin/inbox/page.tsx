"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { clsx } from "clsx";
import Image from "next/image";
import { useChatImage } from "@/components/useChatImage";
import { formatInboxMessage } from "@/lib/inbox-message-format";

type ChatMessage = { id?: string; role: "user" | "assistant"; content: string; ts: number; type?: "text" | "audio" | "image" };
type ConversationSummary = {
  phone: string;
  contactName: string | null;
  lastMessage: ChatMessage | null;
  lastActivity: number;
  unread: boolean;
  aiPaused: boolean;
  messageCount: number;
};

type SupportMessage = {
  sender: "user" | "admin" | "system";
  text: string;
  ts: number;
  attachment?: { type: "image"; fileName: string; mimeType: string; size: number };
};
type SupportStatus = "none" | "needs_attention" | "attended";
type SupportSummary = {
  userId: string;
  userName: string | null;
  status: SupportStatus;
  lastMessage: SupportMessage | null;
  lastActivity: number;
  unreadAdmin: boolean;
  messageCount: number;
};

const INBOX_LIST_REFRESH_MS = 30_000;
const INBOX_MESSAGE_REFRESH_MS = 15_000;

function displayPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return phone;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatFullTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function SupportStatusBadge({ status }: { status: SupportStatus }) {
  if (status === "attended") return <span className="text-[10px] font-semibold text-emerald-ink bg-emerald-soft rounded-full px-2 py-0.5 shrink-0">Atendido</span>;
  if (status === "needs_attention") return <span className="text-[10px] font-semibold text-amber-ink bg-amber-soft rounded-full px-2 py-0.5 shrink-0">Precisa atendimento</span>;
  return <span className="text-[10px] font-semibold text-muted bg-surface-muted rounded-full px-2 py-0.5 shrink-0">Em andamento</span>;
}

function InboxMessageText({ content }: { content: string }) {
  return formatInboxMessage(content).split(/(`[^`\n]+`|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w)|~[^~\n]+~|https?:\/\/[^\s<>"\])]+)/g).map((part, index) => {
    if (index % 2 === 0) return part;
    if (part.startsWith("*")) return <strong key={index}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("~")) return <s key={index}>{part.slice(1, -1)}</s>;
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const url = part.replace(/[.,!?;:]+$/, "");
    return <span key={index}><a className="underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a>{part.slice(url.length)}</span>;
  });
}

export default function AdminInboxPage() {
  const [tab, setTab] = useState<"inbox" | "suporte">("inbox");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const inboxImage = useChatImage(setInboxError, false);
  const { file: inboxFile, preview: inboxPreview, fileInput: inboxFileInput, accept: inboxAccept } = inboxImage;
  const inboxInputRef = useRef<HTMLTextAreaElement>(null);
  const inboxMessageRequest = useRef(0);
  const [search, setSearch] = useState("");
  const selectedRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Suporte (chat in-app) ──
  const [supportConvs, setSupportConvs] = useState<SupportSummary[]>([]);
  const [supportSelected, setSupportSelected] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportInput, setSupportInput] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportSendError, setSupportSendError] = useState<string | null>(null);
  const supportAttachment = useChatImage(setSupportSendError);
  const { file: supportImage, preview: supportImagePreview, fileInput: supportFileInputRef } = supportAttachment;
  const [supportSearch, setSupportSearch] = useState("");
  const supportSelectedRef = useRef<string | null>(null);
  const supportUserScrolledUpRef = useRef(false);
  const supportMessagesEndRef = useRef<HTMLDivElement>(null);
  const supportScrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(() => {
    fetch("/api/admin/inbox/conversations")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setConversations(d.conversations ?? []); });
  }, []);

  const fetchMessages = useCallback((phone: string) => {
    const request = ++inboxMessageRequest.current;
    return fetch(`/api/admin/inbox/messages?phone=${encodeURIComponent(phone)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d && selectedRef.current === phone && inboxMessageRequest.current === request) {
          setMessages(d.messages ?? []);
          setConversations(cs => cs.map(c => c.phone === phone ? { ...c, unread: false } : c));
        }
      }).catch(() => {});
  }, []);

  const fetchSupportConversations = useCallback(() => {
    fetch("/api/admin/support/conversations")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setSupportConvs(d.conversations ?? []); });
  }, []);

  const fetchSupportMessages = useCallback((userId: string) => {
    fetch(`/api/admin/support/messages?userId=${encodeURIComponent(userId)}`)
      .then(r => (r.ok && supportSelectedRef.current === userId ? r.json() : null))
      .then(d => {
        if (d) {
          setSupportMessages(d.messages ?? []);
          setSupportConvs(cs => cs.map(c => c.userId === userId ? { ...c, unreadAdmin: false } : c));
        }
      });
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (tab === "inbox") fetchConversations();
      else fetchSupportConversations();
    };
    refresh();
    const t = window.setInterval(refresh, INBOX_LIST_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [tab, fetchConversations, fetchSupportConversations]);

  useEffect(() => {
    if (!selected || tab !== "inbox") return;
    const refresh = () => {
      if (document.visibilityState === "visible") fetchMessages(selected);
    };
    refresh();
    const t = window.setInterval(refresh, INBOX_MESSAGE_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [tab, selected, fetchMessages]);

  useEffect(() => {
    if (!supportSelected || tab !== "suporte") return;
    const refresh = () => {
      if (document.visibilityState === "visible") fetchSupportMessages(supportSelected);
    };
    refresh();
    const t = window.setInterval(refresh, INBOX_MESSAGE_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [tab, supportSelected, fetchSupportMessages]);

  useEffect(() => {
    if (!userScrolledUpRef.current) messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  useEffect(() => {
    if (!supportUserScrolledUpRef.current) supportMessagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [supportMessages]);

  function handleSelect(phone: string) {
    if (selectedRef.current === phone) return;
    selectedRef.current = phone;
    setSelected(phone);
    setMessages([]);
    setInput("");
    setInboxError(null);
    inboxImage.clear();
    userScrolledUpRef.current = false;
  }

  function handleSupportSelect(userId: string) {
    supportAttachment.clear();
    setSupportInput("");
    setSupportSendError(null);
    supportSelectedRef.current = userId;
    setSupportSelected(userId);
    setSupportMessages([]);
    supportUserScrolledUpRef.current = false;
  }

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 100;
  }

  function handleSupportScroll() {
    const el = supportScrollContainerRef.current;
    if (!el) return;
    supportUserScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 100;
  }

  async function send() {
    if (!selected || (!input.trim() && !inboxImage.file) || sending) return;
    setSending(true);
    setInboxError(null);
    const phone = selected;
    try {
      let request: RequestInit;
      if (inboxImage.file) {
        const body = new FormData();
        body.set("phone", phone);
        body.set("content", input);
        body.set("image", inboxImage.file);
        request = { method: "POST", body };
      } else {
        request = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, content: input }) };
      }
      const response = await fetch("/api/admin/inbox/send", request);
      const data = await response.json().catch(() => null);
      if (selectedRef.current !== phone) return;
      if (!response.ok) {
        setInboxError(data?.error ?? "Não foi possível enviar a mensagem.");
        return;
      }
      setInput("");
      inboxImage.clear();
      setInboxError(data?.warning ?? null);
      await fetchMessages(phone);
      fetchConversations();
    } catch {
      if (selectedRef.current === phone) setInboxError("Não foi possível confirmar o envio. Confira a conversa antes de tentar novamente.");
    } finally {
      setSending(false);
    }
  }

  function formatSelection(marker: "*" | "_") {
    const field = inboxInputRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    setInput(`${input.slice(0, start)}${marker}${input.slice(start, end)}${marker}${input.slice(end)}`);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + 1, end + 1);
    });
  }

  async function deleteMessage(id: string) {
    if (!selected || deleting || !window.confirm("Apagar esta mensagem do Inbox da Zelo? A cópia no WhatsApp do cliente continua disponível.")) return;
    const phone = selected;
    setDeleting(id);
    setInboxError(null);
    try {
      const response = await fetch("/api/admin/inbox/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, id }),
      });
      if (!response.ok) throw Error("Não foi possível apagar a mensagem.");
      if (selectedRef.current === phone) {
        ++inboxMessageRequest.current;
        setMessages(messages => messages.filter(message => message.id !== id));
      }
      fetchConversations();
    } catch {
      if (selectedRef.current === phone) setInboxError("Não foi possível apagar a mensagem. Tente novamente.");
    } finally {
      setDeleting(null);
    }
  }

  async function toggleAiPause(paused: boolean) {
    if (!selected) return;
    await fetch("/api/admin/inbox/ai-pause", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: selected, paused }),
    });
    setConversations(cs => cs.map(c => c.phone === selected ? { ...c, aiPaused: paused } : c));
  }

  async function sendSupport() {
    if (!supportSelected || (!supportInput.trim() && !supportImage) || supportSending) return;
    setSupportSending(true);
    setSupportSendError(null);
    const userId = supportSelected;
    const text = supportInput.trim();
    try {
      let r: Response;
      if (supportImage) {
        const body = new FormData();
        body.set("userId", userId);
        body.set("text", text);
        body.set("image", supportImage);
        r = await fetch("/api/admin/support/send", { method: "POST", body });
      } else {
        r = await fetch("/api/admin/support/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, text }),
        });
      }

      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setSupportSendError(data?.error ?? "Não foi possível enviar. Tente novamente.");
        return;
      }

      const sentMessage = data?.message as SupportMessage | undefined;
      if (supportSelectedRef.current === userId && sentMessage) {
        setSupportMessages(messages => [...messages, sentMessage]);
      }
      if (sentMessage) {
        setSupportConvs(conversations => conversations.map(conversation => conversation.userId === userId
          ? { ...conversation, lastMessage: sentMessage, lastActivity: sentMessage.ts }
          : conversation));
      }
      setSupportInput("");
      supportAttachment.clear();
    } catch {
      setSupportSendError("Não foi possível enviar. Verifique sua conexão e tente novamente.");
    } finally {
      setSupportSending(false);
    }
  }

  async function setSupportStatus(status: SupportStatus) {
    if (!supportSelected) return;
    await fetch("/api/admin/support/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: supportSelected, status }),
    });
    setSupportConvs(cs => cs.map(c => c.userId === supportSelected ? { ...c, status } : c));
  }

  const filtered = conversations.filter(c =>
    !search.trim() ||
    (c.contactName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search.replace(/\D/g, ""))
  );
  const selectedConv = conversations.find(c => c.phone === selected) ?? null;
  const totalUnread = conversations.filter(c => c.unread).length;

  const supportFiltered = supportConvs.filter(c =>
    !supportSearch.trim() || (c.userName ?? "").toLowerCase().includes(supportSearch.toLowerCase())
  );
  const supportSelectedConv = supportConvs.find(c => c.userId === supportSelected) ?? null;
  const supportPendingCount = supportConvs.filter(c => c.status === "needs_attention").length;

  return (
    <div className="flex flex-col z-inbox min-h-0 bg-surface rounded-2xl overflow-hidden border border-line">
      {/* Seletor de abas */}
      <div className="flex border-b border-line shrink-0 bg-surface">
        <button onClick={() => setTab("inbox")}
          className={clsx("flex-1 sm:flex-none sm:px-6 px-4 py-3 text-sm font-semibold border-b-2 transition flex items-center justify-center gap-1.5",
            tab === "inbox" ? "border-amber-500 text-amber-ink" : "border-transparent text-subtle hover:text-muted")}>
          💬 Inbox
          {totalUnread > 0 && <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{totalUnread}</span>}
        </button>
        <button onClick={() => setTab("suporte")}
          className={clsx("flex-1 sm:flex-none sm:px-6 px-4 py-3 text-sm font-semibold border-b-2 transition flex items-center justify-center gap-1.5",
            tab === "suporte" ? "border-amber-500 text-amber-ink" : "border-transparent text-subtle hover:text-muted")}>
          🎧 Suporte
          {supportPendingCount > 0 && <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{supportPendingCount}</span>}
        </button>
      </div>

      {tab === "inbox" ? (
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className={clsx("w-full sm:w-80 border-r border-line flex flex-col shrink-0", selected && "hidden sm:flex")}>
            <div className="p-4 border-b border-line">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone..."
                className="w-full bg-surface-muted border border-line rounded-xl px-3 py-2 text-sm text-ink caret-ink placeholder:text-subtle outline-none focus:border-amber-500 transition" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-subtle text-sm text-center p-6">Nenhuma conversa ainda.</p>
              )}
              {filtered.map(c => (
                <button key={c.phone} onClick={() => handleSelect(c.phone)}
                  className={clsx("w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line transition hover:bg-surface-muted",
                    selected === c.phone && "bg-amber-soft")}>
                  <div className="w-10 h-10 rounded-full bg-line text-muted flex items-center justify-center text-xs font-bold shrink-0">
                    {initials(c.contactName ?? displayPhone(c.phone))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={clsx("text-sm truncate", c.unread ? "font-bold text-ink" : "font-medium text-ink")}>
                        {c.contactName ?? displayPhone(c.phone)}
                      </p>
                      <span className="text-[10px] text-subtle shrink-0">{c.lastActivity ? formatTime(c.lastActivity) : ""}</span>
                    </div>
                    <p className="text-xs text-subtle truncate flex items-center gap-1">
                      {c.lastMessage?.role === "assistant" && <span className="text-amber-ink">✓✓</span>}
                      {c.lastMessage?.type === "audio" ? "🎵 Áudio" : c.lastMessage?.type === "image" ? "📷 Imagem" : (c.lastMessage?.content ?? "").slice(0, 60)}
                    </p>
                  </div>
                  {c.unread && <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div {...inboxImage.dropHandlers(sending || !selected)} className={clsx("flex-1 flex flex-col min-w-0", !selected && "hidden sm:flex")}>
            {!selected || !selectedConv ? (
              <div className="flex-1 flex items-center justify-center text-subtle text-sm">
                Selecione uma conversa para ver o histórico
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-line flex items-center gap-3">
                  <button onClick={() => { setSelected(null); selectedRef.current = null; }} className="sm:hidden text-subtle">←</button>
                  <div className="w-9 h-9 rounded-full bg-line text-muted flex items-center justify-center text-xs font-bold shrink-0">
                    {initials(selectedConv.contactName ?? displayPhone(selectedConv.phone))}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink text-sm truncate">{selectedConv.contactName ?? displayPhone(selectedConv.phone)}</p>
                    <p className="text-xs text-subtle">{displayPhone(selectedConv.phone)}</p>
                  </div>
                </div>

                {selectedConv.aiPaused && (
                  <div className="bg-amber-soft border-b border-line px-4 py-2 flex items-center justify-between">
                    <p className="text-xs text-amber-ink">⏸️ IA pausada — atendimento manual</p>
                    <button onClick={() => toggleAiPause(false)} className="text-xs font-medium text-amber-ink underline">Reativar IA</button>
                  </div>
                )}

                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-2 bg-surface-muted">
                  {messages.map((m, i) => (
                    <div key={m.id ?? i} className={clsx("flex", m.role === "assistant" ? "justify-end" : "justify-start")}>
                      <div className={clsx("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                        m.role === "assistant" ? "bg-[#005c4b] text-white rounded-br-sm" : "bg-surface text-ink rounded-bl-sm border border-line")}>
                        {m.type === "audio" && !m.content ? "🎵 Áudio" : <InboxMessageText content={m.content} />}
                        <div className={clsx("text-[10px] mt-1 flex items-center gap-1 justify-end", m.role === "assistant" ? "text-emerald-100" : "text-subtle")}>
                          {formatFullTime(m.ts)}
                          {m.role === "assistant" && <span>✓✓</span>}
                          {m.id && (
                            <button type="button" disabled={!!deleting} onClick={() => deleteMessage(m.id!)}
                              className="ml-2 rounded px-1 underline underline-offset-2 disabled:opacity-50">
                              {deleting === m.id ? "Apagando…" : "Apagar do Inbox"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="shrink-0 space-y-2 border-t border-line p-3">
                  {inboxError && <p className="text-xs text-red-ink" role="alert">{inboxError}</p>}
                  {inboxPreview && (
                    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-muted p-2">
                      <Image src={inboxPreview} alt="Pré-visualização da imagem" width={48} height={48} unoptimized
                        className="h-12 w-12 rounded-lg object-cover" />
                      <p className="min-w-0 flex-1 truncate text-xs text-muted">{inboxFile?.name}</p>
                      <button type="button" onClick={inboxImage.clear} disabled={sending}
                        className="h-7 w-7 rounded-full text-lg text-muted hover:bg-line" aria-label="Remover imagem">×</button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <input ref={inboxFileInput} type="file" accept={inboxAccept} className="hidden"
                      onChange={event => inboxImage.select(event.target.files?.[0] ?? null)} />
                    <button type="button" onClick={() => inboxFileInput.current?.click()} disabled={sending}
                      className="rounded-lg border border-line px-2 py-1 hover:bg-line" title="Anexe ou solte uma imagem JPG ou PNG aqui">
                      Anexar imagem
                    </button>
                    <button type="button" onClick={() => formatSelection("*")} disabled={sending}
                      className="rounded-lg border border-line px-2 py-1 font-bold hover:bg-line">Negrito</button>
                    <button type="button" onClick={() => formatSelection("_")} disabled={sending}
                      className="rounded-lg border border-line px-2 py-1 italic hover:bg-line">Itálico</button>
                    <span className="hidden sm:inline">Shift + Enter para nova linha</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea ref={inboxInputRef} value={input} onChange={e => setInput(e.target.value)} disabled={sending}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                      rows={2} aria-label="Mensagem do WhatsApp"
                      placeholder={inboxFile ? "Escreva uma legenda (opcional)..." : "Digite uma mensagem..."}
                      className="max-h-44 min-w-0 flex-1 resize-y rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink placeholder:text-subtle outline-none focus:border-amber-500" />
                    <button type="button" onClick={send} disabled={(!input.trim() && !inboxFile) || sending}
                      className="shrink-0 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-amber-500 disabled:opacity-40">
                      {sending ? "Enviando..." : "Enviar"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className={clsx("w-full sm:w-80 border-r border-line flex flex-col shrink-0", supportSelected && "hidden sm:flex")}>
            <div className="p-4 border-b border-line">
              <input value={supportSearch} onChange={e => setSupportSearch(e.target.value)} placeholder="Buscar por nome..."
                className="w-full bg-surface-muted border border-line rounded-xl px-3 py-2 text-sm text-ink caret-ink placeholder:text-subtle outline-none focus:border-amber-500 transition" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {supportFiltered.length === 0 && (
                <p className="text-subtle text-sm text-center p-6">Nenhum pedido de suporte ainda.</p>
              )}
              {supportFiltered.map(c => (
                <button key={c.userId} onClick={() => handleSupportSelect(c.userId)}
                  className={clsx("w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line transition hover:bg-surface-muted",
                    supportSelected === c.userId && "bg-amber-soft")}>
                  <div className="w-10 h-10 rounded-full bg-line text-muted flex items-center justify-center text-xs font-bold shrink-0">
                    {initials(c.userName ?? "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={clsx("text-sm truncate", c.unreadAdmin ? "font-bold text-ink" : "font-medium text-ink")}>
                        {c.userName ?? "Usuário"}
                      </p>
                      <span className="text-[10px] text-subtle shrink-0">{c.lastActivity ? formatTime(c.lastActivity) : ""}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-subtle truncate">
                        {c.lastMessage?.sender === "admin" && <span className="text-amber-ink">✓✓ </span>}
                        {(c.lastMessage?.text || (c.lastMessage?.attachment ? "📷 Foto" : "")).slice(0, 50)}
                      </p>
                      <SupportStatusBadge status={c.status} />
                    </div>
                  </div>
                  {c.unreadAdmin && <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div {...supportAttachment.dropHandlers(supportSending || !supportSelected)} className={clsx("flex-1 flex flex-col min-w-0", !supportSelected && "hidden sm:flex")}>
            {!supportSelected || !supportSelectedConv ? (
              <div className="flex-1 flex items-center justify-center text-subtle text-sm">
                Selecione uma conversa de suporte para ver o histórico
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-line flex items-center gap-3">
                  <button onClick={() => { setSupportSelected(null); supportSelectedRef.current = null; }} className="sm:hidden text-subtle">←</button>
                  <div className="w-9 h-9 rounded-full bg-line text-muted flex items-center justify-center text-xs font-bold shrink-0">
                    {initials(supportSelectedConv.userName ?? "?")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink text-sm truncate">{supportSelectedConv.userName ?? "Usuário"}</p>
                    <SupportStatusBadge status={supportSelectedConv.status} />
                  </div>
                  {supportSelectedConv.status === "attended" ? (
                    <button onClick={() => setSupportStatus("needs_attention")} className="text-xs font-medium text-amber-ink underline shrink-0">Reabrir</button>
                  ) : (
                    <button onClick={() => setSupportStatus("attended")} className="text-xs font-medium text-emerald-ink underline shrink-0">Marcar atendido</button>
                  )}
                </div>

                <div ref={supportScrollContainerRef} onScroll={handleSupportScroll} className="flex-1 overflow-y-auto p-4 space-y-2 bg-surface-muted">
                  {supportMessages.map((m, i) => (
                    m.sender === "system" ? (
                      <div key={i} className="flex justify-center">
                        <div className="max-w-[85%] rounded-xl px-3 py-1.5 text-xs italic text-amber-ink bg-amber-soft border border-line text-center">
                          {m.text}
                        </div>
                      </div>
                    ) : (
                      <div key={i} className={clsx("flex", m.sender === "admin" ? "justify-end" : "justify-start")}>
                        <div className={clsx("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                          m.sender === "admin" ? "bg-[#005c4b] text-white rounded-br-sm" : "bg-surface text-ink rounded-bl-sm border border-line")}>
                          {m.attachment?.type === "image" && supportSelected && (
                            <a
                              href={`/api/admin/support/attachments/${encodeURIComponent(supportSelected)}/${encodeURIComponent(m.attachment.fileName)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block"
                              title="Abrir imagem"
                            >
                              <Image
                                src={`/api/admin/support/attachments/${encodeURIComponent(supportSelected)}/${encodeURIComponent(m.attachment.fileName)}`}
                                alt={m.sender === "admin" ? "Imagem enviada pelo suporte" : "Imagem enviada pelo cliente"}
                                width={420}
                                height={315}
                                unoptimized
                                className="max-h-80 w-auto max-w-full rounded-lg object-contain"
                              />
                            </a>
                          )}
                          {m.text && <span className={clsx("block", m.attachment && "mt-1.5")}>{m.text}</span>}
                          <div className={clsx("text-[10px] mt-1 flex items-center gap-1 justify-end", m.sender === "admin" ? "text-emerald-100" : "text-subtle")}>
                            {formatFullTime(m.ts)}
                            {m.sender === "admin" && <span>✓✓</span>}
                          </div>
                        </div>
                      </div>
                    )
                  ))}
                  <div ref={supportMessagesEndRef} />
                </div>

                <div className="p-3 border-t border-line shrink-0">
                  {supportImagePreview && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-surface-muted p-2">
                      <Image src={supportImagePreview} alt="Pré-visualização da imagem" width={48} height={48} unoptimized
                        className="h-12 w-12 rounded-lg object-cover" />
                      <p className="min-w-0 flex-1 truncate text-xs text-muted">{supportImage?.name}</p>
                      <button type="button" onClick={supportAttachment.clear} disabled={supportSending}
                        className="h-7 w-7 rounded-full text-lg leading-none text-muted hover:bg-line disabled:opacity-40"
                        aria-label="Remover imagem">×</button>
                    </div>
                  )}
                  {supportSendError && <p className="mb-2 text-xs text-red-ink" role="alert">{supportSendError}</p>}
                  <div className="flex gap-2">
                    <input ref={supportFileInputRef} type="file" accept={supportAttachment.accept} className="hidden"
                      onChange={event => supportAttachment.select(event.target.files?.[0] ?? null)} />
                    <button type="button" onClick={() => supportFileInputRef.current?.click()} disabled={supportSending}
                      className="h-10 w-10 shrink-0 rounded-xl border border-line bg-surface-muted text-muted transition hover:border-amber-500 hover:text-amber-ink disabled:opacity-40"
                      aria-label="Anexar uma imagem" title="Anexe ou solte uma imagem aqui (até 5 MB)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mx-auto h-5 w-5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a3.75 3.75 0 0 0-5.303-5.303L6.11 9.53a5.25 5.25 0 0 0 7.425 7.425l7.5-7.5M8.25 12.75l7.5-7.5" />
                      </svg>
                    </button>
                    <input value={supportInput} onChange={e => setSupportInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSupport(); } }}
                      placeholder={supportImage ? "Escreva uma legenda (opcional)..." : "Digite uma mensagem..."}
                      className="min-w-0 flex-1 bg-surface-muted border border-line rounded-xl px-4 py-2.5 text-sm text-ink caret-ink placeholder:text-subtle outline-none focus:border-amber-500 transition" />
                    <button onClick={sendSupport} disabled={(!supportInput.trim() && !supportImage) || supportSending}
                      className="bg-amber-600 hover:bg-amber-500 text-ink font-semibold rounded-xl px-4 text-sm transition disabled:opacity-40 shrink-0">
                      {supportSending ? "Enviando..." : "Enviar"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
