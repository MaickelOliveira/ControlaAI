"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { clsx } from "clsx";

type SupportMessage = { sender: "user" | "admin" | "system"; text: string; ts: number };

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    setMessages(m => [...m, { sender: "user", text, ts: Date.now() }]);
    const r = await fetch("/api/dashboard/support/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.systemReplies?.length) setMessages(m => [...m, ...d.systemReplies]);
    } else {
      setInput(text);
    }
    setSending(false);
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
                  {m.text}
                  <div className={clsx("text-[10px] mt-1", m.sender === "user" ? "text-emerald-100 text-right" : "text-slate-400")}>
                    {formatTime(m.ts)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-2.5 border-t border-slate-200 flex gap-2 shrink-0">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Digite sua mensagem..."
              className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 transition" />
            <button onClick={send} disabled={!input.trim() || sending}
              className="bg-[#128C7E] hover:bg-[#0e7268] text-white font-semibold rounded-xl px-3.5 text-sm transition disabled:opacity-40 shrink-0">
              Enviar
            </button>
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
