"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { clsx } from "clsx";

type ChatMessage = { role: "user" | "assistant"; content: string; ts: number; type?: "text" | "audio" | "image" };
type ConversationSummary = {
  phone: string;
  contactName: string | null;
  lastMessage: ChatMessage | null;
  lastActivity: number;
  unread: boolean;
  aiPaused: boolean;
  messageCount: number;
};

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

export default function AdminInboxPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const selectedRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(() => {
    fetch("/api/admin/inbox/conversations")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setConversations(d.conversations ?? []); });
  }, []);

  const fetchMessages = useCallback((phone: string) => {
    fetch(`/api/admin/inbox/messages?phone=${encodeURIComponent(phone)}`)
      .then(r => (r.ok && selectedRef.current === phone ? r.json() : null))
      .then(d => {
        if (d) {
          setMessages(d.messages ?? []);
          setConversations(cs => cs.map(c => c.phone === phone ? { ...c, unread: false } : c));
        }
      });
  }, []);

  useEffect(() => {
    fetchConversations();
    const t = setInterval(fetchConversations, 5000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selected) return;
    fetchMessages(selected);
    const t = setInterval(() => fetchMessages(selected), 3000);
    return () => clearInterval(t);
  }, [selected, fetchMessages]);

  useEffect(() => {
    if (!userScrolledUpRef.current) messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  function handleSelect(phone: string) {
    selectedRef.current = phone;
    setSelected(phone);
    setMessages([]);
    userScrolledUpRef.current = false;
  }

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 100;
  }

  async function send() {
    if (!selected || !input.trim() || sending) return;
    setSending(true);
    const content = input.trim();
    setInput("");
    const r = await fetch("/api/admin/inbox/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: selected, content }),
    });
    if (r.ok) {
      setMessages(m => [...m, { role: "assistant", content, ts: Date.now() }]);
      setConversations(cs => cs.map(c => c.phone === selected ? { ...c, aiPaused: true } : c));
    } else {
      alert("Falha ao enviar mensagem");
      setInput(content);
    }
    setSending(false);
  }

  async function toggleAiPause(paused: boolean) {
    if (!selected) return;
    await fetch("/api/admin/inbox/ai-pause", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: selected, paused }),
    });
    setConversations(cs => cs.map(c => c.phone === selected ? { ...c, aiPaused: paused } : c));
  }

  const filtered = conversations.filter(c =>
    !search.trim() ||
    (c.contactName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search.replace(/\D/g, ""))
  );
  const selectedConv = conversations.find(c => c.phone === selected) ?? null;
  const totalUnread = conversations.filter(c => c.unread).length;

  return (
    <div className="flex h-[calc(100vh-3rem)] sm:h-[calc(100vh-4rem)] -m-4 sm:-m-6 bg-white rounded-none sm:rounded-2xl overflow-hidden border border-slate-200">
      {/* Sidebar */}
      <div className={clsx("w-full sm:w-80 border-r border-slate-200 flex flex-col shrink-0", selected && "hidden sm:flex")}>
        <div className="p-4 border-b border-slate-200">
          <h1 className="font-bold text-slate-900 flex items-center gap-2">
            💬 Inbox
            {totalUnread > 0 && <span className="bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full px-1.5 py-0.5">{totalUnread}</span>}
          </h1>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone..."
            className="w-full mt-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500 transition" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-slate-400 text-sm text-center p-6">Nenhuma conversa ainda.</p>
          )}
          {filtered.map(c => (
            <button key={c.phone} onClick={() => handleSelect(c.phone)}
              className={clsx("w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-100 transition hover:bg-slate-50",
                selected === c.phone && "bg-amber-50")}>
              <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                {initials(c.contactName ?? displayPhone(c.phone))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={clsx("text-sm truncate", c.unread ? "font-bold text-slate-900" : "font-medium text-slate-700")}>
                    {c.contactName ?? displayPhone(c.phone)}
                  </p>
                  <span className="text-[10px] text-slate-400 shrink-0">{c.lastActivity ? formatTime(c.lastActivity) : ""}</span>
                </div>
                <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                  {c.lastMessage?.role === "assistant" && <span className="text-amber-600">✓✓</span>}
                  {c.lastMessage?.type === "audio" ? "🎵 Áudio" : c.lastMessage?.type === "image" ? "📷 Imagem" : (c.lastMessage?.content ?? "").slice(0, 60)}
                </p>
              </div>
              {c.unread && <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className={clsx("flex-1 flex flex-col min-w-0", !selected && "hidden sm:flex")}>
        {!selected || !selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Selecione uma conversa para ver o histórico
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-slate-200 flex items-center gap-3">
              <button onClick={() => { setSelected(null); selectedRef.current = null; }} className="sm:hidden text-slate-400">←</button>
              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                {initials(selectedConv.contactName ?? displayPhone(selectedConv.phone))}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">{selectedConv.contactName ?? displayPhone(selectedConv.phone)}</p>
                <p className="text-xs text-slate-400">{displayPhone(selectedConv.phone)}</p>
              </div>
            </div>

            {selectedConv.aiPaused && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
                <p className="text-xs text-amber-700">⏸️ IA pausada — atendimento manual</p>
                <button onClick={() => toggleAiPause(false)} className="text-xs font-medium text-amber-700 underline">Reativar IA</button>
              </div>
            )}

            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#F1F5F9]">
              {messages.map((m, i) => (
                <div key={i} className={clsx("flex", m.role === "assistant" ? "justify-end" : "justify-start")}>
                  <div className={clsx("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                    m.role === "assistant" ? "bg-[#005c4b] text-white rounded-br-sm" : "bg-white text-slate-800 rounded-bl-sm border border-slate-200")}>
                    {m.type === "audio" && !m.content ? "🎵 Áudio" : m.content}
                    <div className={clsx("text-[10px] mt-1 flex items-center gap-1 justify-end", m.role === "assistant" ? "text-emerald-100" : "text-slate-400")}>
                      {formatFullTime(m.ts)}
                      {m.role === "assistant" && <span>✓✓</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-slate-200 flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Digite uma mensagem..."
                className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
              <button onClick={send} disabled={!input.trim() || sending}
                className="bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold rounded-xl px-4 text-sm transition disabled:opacity-40">
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
