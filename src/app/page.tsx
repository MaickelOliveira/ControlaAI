"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";
import { Plus_Jakarta_Sans } from "next/font/google";

const heading = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-heading" });

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ── Dispara quando o elemento entra/sai da tela ── */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

function useAnimatedStage<T extends HTMLElement>(total: number, interval = 1900) {
  const { ref, inView } = useInView<T>();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!inView) {
      Promise.resolve().then(() => setStage(0));
      return;
    }
    const timer = setInterval(() => setStage(current => (current + 1) % total), interval);
    return () => clearInterval(timer);
  }, [inView, interval, total]);
  return { ref, stage };
}

type Msg = { from?: "bot" | "user"; text: React.ReactNode; tags?: string[]; time?: string; typed?: string };
type Chip = { label: string; pos: string; delay?: string };

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-black/[0.03] shadow-sm rounded-2xl rounded-tl-sm px-3.5 py-3 flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <span key={i} className="chat-typing-dot w-1.5 h-1.5 rounded-full bg-slate-300" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ from = "bot", tags, text, time = "20:40" }: Msg) {
  const isUser = from === "user";
  return (
    <div className={clsx("flex chat-msg-in", isUser ? "justify-end" : "justify-start")}>
      <div className={clsx(
        "max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug whitespace-pre-line shadow-sm",
        isUser ? "bg-[#d9fdd3] text-slate-800 rounded-tr-sm" : "bg-white text-slate-800 rounded-tl-sm border border-black/[0.03]"
      )}>
        {text}
        {tags && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.map(t => (
              <span key={t} className="text-[9px] border border-amber-300 text-amber-600 rounded-full px-2 py-0.5 font-medium">{t}</span>
            ))}
          </div>
        )}
        <p className={clsx("text-[9px] mt-1 text-right flex items-center justify-end gap-0.5", "text-slate-400")}>
          {time}
          {isUser && <span className="text-sky-500">✓✓</span>}
        </p>
      </div>
    </div>
  );
}

/* ── Moldura de WhatsApp com a conversa animada EM LOOP: as mensagens
 *  aparecem em sequência, com "digitando..." antes de cada resposta do
 *  Zelo; ao terminar, pausa e recomeça — enquanto o mockup estiver visível. ── */
function WhatsAppMock({ messages, chips, tilt = 0 }: { messages: Msg[]; chips?: Chip[]; tilt?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);

  // Mantém o celular sempre do mesmo tamanho — a área de mensagens tem altura
  // fixa e rola sozinha pra baixo conforme a conversa avança, em vez de
  // esticar o celular (e o container) a cada mensagem nova.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, typing]);

  useEffect(() => {
    if (!inView) {
      Promise.resolve().then(() => { setShown(0); setTyping(false); });
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (fn: () => void, ms: number) => { const t = setTimeout(() => { if (!cancelled) fn(); }, ms); timers.push(t); };

    function step(i: number) {
      if (cancelled) return;
      if (i >= messages.length) {
        at(() => { setShown(0); setTyping(false); at(() => step(0), 700); }, 2800);
        return;
      }
      const msg = messages[i];
      if (msg.from === "user") {
        setTyping(false);
        setShown(i + 1);
        at(() => step(i + 1), 550);
      } else {
        setTyping(true);
        at(() => { setTyping(false); setShown(i + 1); at(() => step(i + 1), 400); }, 900);
      }
    }
    at(() => step(0), 500);

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [inView, messages]);

  return (
    <div ref={ref} className="relative">
      <div className="pointer-events-none absolute -inset-8 rounded-[3rem] blur-3xl -z-10 bg-amber-400/20" />
      {chips?.map((c, i) => (
        <div key={c.label} className={clsx("float-chip hidden lg:block absolute z-20 rounded-xl bg-white shadow-lg border border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700", c.pos)}
          style={{ animationDelay: c.delay ?? `${i * 0.6}s` }}>
          {c.label}
        </div>
      ))}
      <div className="relative w-[300px] shrink-0 mx-auto rounded-[3rem] border-[7px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden transition-transform hover:rotate-0" style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}>
        <div className="absolute -left-[7px] top-24 w-[7px] h-8 bg-slate-900 rounded-l" />
        <div className="absolute -left-[7px] top-36 w-[7px] h-12 bg-slate-900 rounded-l" />
        <div className="absolute -right-[7px] top-32 w-[7px] h-16 bg-slate-900 rounded-r" />
        <div className="bg-[#F5F1E8] px-4 pt-2.5 pb-1 flex items-center justify-between relative">
          <span className="text-[11px] text-slate-900 font-semibold">17:13</span>
          <div className="w-24 h-[22px] rounded-full bg-black mx-auto absolute left-1/2 -translate-x-1/2 top-1.5" />
          <div className="flex items-center gap-1 text-slate-900">
            <svg viewBox="0 0 16 12" className="w-4 h-3" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="0.5" /><rect x="4.5" y="4.5" width="3" height="7.5" rx="0.5" /><rect x="9" y="2" width="3" height="10" rx="0.5" /><rect x="13" y="0" width="3" height="12" rx="0.5" /></svg>
            <svg viewBox="0 0 16 12" className="w-4 h-3" fill="currentColor"><path d="M8 10.5a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6zM4.6 6.8a5 5 0 016.8 0l-1.4 1.5a3 3 0 00-4 0L4.6 6.8zM2 4.3a8.5 8.5 0 0112 0L12.6 5.8a6.5 6.5 0 00-9.2 0L2 4.3z" /></svg>
            <svg viewBox="0 0 25 12" className="w-6 h-3" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="21" height="11" rx="2.5" /><rect x="2" y="2" width="16" height="8" rx="1.2" fill="currentColor" stroke="none" /><rect x="22.5" y="4" width="1.5" height="4" rx="0.7" fill="currentColor" /></svg>
          </div>
        </div>
        <div className="bg-white px-3 py-2.5 flex items-center gap-2.5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
            <Image src="/brand/zelo-icon.png" alt="" width={22} height={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 text-[13.5px] font-bold leading-tight flex items-center gap-1">
              Zelo
              <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-sky-500 shrink-0" fill="currentColor"><path d="M10 1l2.2 1.4 2.6-.3 1 2.4 2.4 1-.3 2.6L19 10l-1.4 2.2.3 2.6-2.4 1-1 2.4-2.6-.3L10 19l-2.2-1.4-2.6.3-1-2.4-2.4-1 .3-2.6L1 10l1.4-2.2-.3-2.6 2.4-1 1-2.4 2.6.3z" /><path d="M7 10l2 2 4-4" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </p>
            <p className="text-slate-400 text-[10.5px] leading-tight">{typing ? "digitando..." : "online agora"}</p>
          </div>
          <div className="flex items-center gap-3.5 text-sky-500">
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55-2.4A1 1 0 0121 8.5v7a1 1 0 01-1.45.9L15 14M4 6h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" /></svg>
            <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="currentColor"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.5.56 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.56 3.5 1 1 0 01-.25 1z" /></svg>
          </div>
        </div>
        <div ref={scrollRef} className="relative px-2.5 py-3 space-y-2 h-[380px] overflow-y-auto bg-[#F5F1E8]" style={{ backgroundImage: "radial-gradient(#00000008 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
          {messages.slice(0, shown).map((m, i) => <ChatBubble key={i} {...m} />)}
          {typing && <TypingDots />}
        </div>
        <div className="bg-white px-2.5 py-2 flex items-center gap-2 border-t border-slate-100">
          <span className="text-slate-400 text-xl leading-none font-light">＋</span>
          <div className="flex-1 bg-slate-100 rounded-full px-3.5 py-2 text-[12px] text-slate-400">Mensagem</div>
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.5-4.5a2 2 0 012.8 0l3.2 3.2a2 2 0 002.8 0L20 12M4 8h.01M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-slate-400" fill="currentColor"><path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-2.08A7 7 0 0019 12h-2z" /></svg>
        </div>
      </div>
    </div>
  );
}

/* ── Variante "só tela" (sem moldura de celular) com o balão de digitação
 *  flutuando no meio — usada na seção de Finanças pra não repetir o mesmo
 *  mockup de celular das outras seções e mostrar bem de perto a mensagem
 *  sendo digitada antes de enviar. ── */
function ScreenChatDemo({ messages }: { messages: Msg[] }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [shown, setShown] = useState(0);
  const [typingInput, setTypingInput] = useState<string | null>(null);

  useEffect(() => {
    if (!inView) {
      Promise.resolve().then(() => { setShown(0); setTypingInput(null); });
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (fn: () => void, ms: number) => { const t = setTimeout(() => { if (!cancelled) fn(); }, ms); timers.push(t); };

    function step(i: number) {
      if (cancelled) return;
      if (i >= messages.length) {
        at(() => { setShown(0); setTypingInput(null); at(() => step(0), 700); }, 2600);
        return;
      }
      const msg = messages[i];
      if (msg.from === "user" && msg.typed) {
        const text = msg.typed;
        let idx = 0;
        setTypingInput("");
        const tick = () => {
          if (cancelled) return;
          idx++;
          setTypingInput(text.slice(0, idx));
          if (idx < text.length) {
            at(tick, 40 + Math.random() * 35);
          } else {
            at(() => { setTypingInput(null); setShown(i + 1); at(() => step(i + 1), 500); }, 500);
          }
        };
        at(tick, 400);
      } else {
        setShown(i + 1);
        at(() => step(i + 1), 700);
      }
    }
    at(() => step(0), 500);

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [inView, messages]);

  return (
    <div ref={ref} className="relative">
      <div className="pointer-events-none absolute -inset-8 rounded-[3rem] blur-3xl -z-10 bg-amber-400/20" />
      <div className="relative w-full max-w-[320px] mx-auto h-[500px] rounded-[2.5rem] bg-[#F5F1E8] shadow-2xl overflow-hidden"
        style={{ backgroundImage: "radial-gradient(#00000008 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
        <div className="absolute inset-0 px-5 pt-9 pb-9 flex flex-col justify-center gap-4 overflow-hidden">
          {messages.slice(0, shown).map((m, i) => (
            m.from === "user" ? (
              <div key={i} className="flex justify-end chat-msg-in">
                <div className="max-w-[78%] bg-[#d9fdd3] text-slate-800 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-sm">
                  {m.text}
                  <p className="text-[10px] text-slate-400 mt-1 text-right flex items-center justify-end gap-0.5">
                    {m.time} <span className="text-sky-500">✓✓</span>
                  </p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start chat-msg-in">
                <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm border border-black/[0.03]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                      <Image src="/brand/zelo-icon.png" alt="" width={16} height={16} />
                    </div>
                    <span className="font-bold text-slate-900 text-[13px] flex items-center gap-1">
                      Zelo
                      <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-sky-500 shrink-0" fill="currentColor"><path d="M10 1l2.2 1.4 2.6-.3 1 2.4 2.4 1-.3 2.6L19 10l-1.4 2.2.3 2.6-2.4 1-1 2.4-2.6-.3L10 19l-2.2-1.4-2.6.3-1-2.4-2.4-1 .3-2.6L1 10l1.4-2.2-.3-2.6 2.4-1 1-2.4 2.6.3z" /><path d="M7 10l2 2 4-4" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </div>
                  <p className="text-slate-800 whitespace-pre-line leading-snug">{m.text}</p>
                  {m.tags && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {m.tags.map(t => (
                        <span key={t} className="text-[9px] border border-amber-300 text-amber-600 rounded-full px-2 py-0.5 font-medium">{t}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">{m.time}</p>
                </div>
              </div>
            )
          ))}
        </div>

        {typingInput !== null && (
          <div className="absolute left-5 right-5 top-1/2 -translate-y-1/2 z-10 bg-white rounded-full shadow-xl px-4 py-3.5 flex items-center gap-3 chat-msg-in">
            <span className="text-slate-400 text-xl leading-none font-light">＋</span>
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M9 10h.01M15 10h.01M8.5 14.5a4 4 0 007 0" />
            </svg>
            <span className="flex-1 text-slate-800 text-sm truncate">
              {typingInput}
              <span className="inline-block w-[1.5px] h-3.5 bg-amber-500 ml-0.5 -mb-0.5 blink-cursor" />
            </span>
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-slate-400 shrink-0" fill="currentColor"><path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-2.08A7 7 0 0019 12h-2z" /></svg>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ícones de linha (mesmos usados no sidebar real do dashboard) — usados
 *  na grade de módulos secundários no lugar de emoji. ── */
const MODULE_ICONS = {
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  car: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3v-4.5l2.5-5.5h11L19 12.5V17h-2M5 17a2 2 0 104 0m6 0a2 2 0 104 0M5 17h8" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  cart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h12M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zm7 0a.5.5 0 11-1 0 .5.5 0 011 0z" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.16V11a6 6 0 00-4-5.66V5a2 2 0 10-4 0v.34C7.67 6.17 6 8.39 6 11v3.16c0 .54-.21 1.06-.6 1.44L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
};

/* ── Ícones de linha usados nos cards de função (em vez de emoji) — mesmo
 *  estilo dos ícones do sidebar real do app: contorno simples, strokeWidth
 *  1.75, sem preenchimento. ── */
function FeatureIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-[18px] h-[18px]">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const FEATURE_ICONS = {
  mic: <FeatureIcon d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zM7 11a5 5 0 0010 0M12 16v4m-3 0h6" />,
  tag: <FeatureIcon d="M9.57 3H5.25A2.25 2.25 0 003 5.25v4.32c0 .6.24 1.17.66 1.59l9.58 9.58c.7.7 1.83.7 2.53 0l7.16-7.16a1.79 1.79 0 000-2.53L12.75 3.66A2.25 2.25 0 009.57 3z" />,
  repeat: <FeatureIcon d="M16 9.35h5v-.01M3 19.64v-5m0 0h5m-5 0l3.18 3.18a8.25 8.25 0 0013.8-3.7M4 9.86a8.25 8.25 0 0113.8-3.7L21 9.34m0-5v5" />,
  switch: <FeatureIcon d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />,
  chart: <FeatureIcon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  clock: <FeatureIcon d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3" />,
  target: <FeatureIcon d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-3a2 2 0 100-4 2 2 0 000 4z" />,
  pencil: <FeatureIcon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />,
  calculator: <FeatureIcon d="M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 19h4" />,
  building: <FeatureIcon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
  zen: <FeatureIcon d="M12 21a9 9 0 100-18 9 9 0 000 18zm-3.5-9l2 2 4.5-4.5" />,
  chat: <FeatureIcon d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.42-4.03 8-9 8a9.86 9.86 0 01-4.26-.95L3 20l1.4-3.72C3.51 15.04 3 13.57 3 12c0-4.42 4.03-8 9-8s9 3.58 9 8z" />,
  sync: <FeatureIcon d="M16 9.35h5v-.01M3 19.64v-5m0 0h5m-5 0l3.18 3.18a8.25 8.25 0 0013.8-3.7M4 9.86a8.25 8.25 0 0113.8-3.7L21 9.34m0-5v5" />,
  bell: <FeatureIcon d="M15 17h5l-1.4-1.4A2 2 0 0118 14.16V11a6 6 0 00-4-5.66V5a2 2 0 10-4 0v.34C7.67 6.17 6 8.39 6 11v3.16c0 .54-.21 1.06-.6 1.44L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
  check: <FeatureIcon d="M12 21a9 9 0 100-18 9 9 0 000 18zM9 12l2 2 4-4" />,
  link: <FeatureIcon d="M13.83 10.17a4 4 0 00-5.66 0l-4 4a4 4 0 105.66 5.66l1.1-1.1m-.76-4.9a4 4 0 005.66 0l4-4a4 4 0 10-5.66-5.66l-1.1 1.1" />,
  megaphone: <FeatureIcon d="M3 10v4a1 1 0 001 1h2l6 4V5L6 9H4a1 1 0 00-1 1zM18 8a5 5 0 010 8" />,
  doc: <FeatureIcon d="M7 4h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2zM9 8h6M9 12h6M9 16h3" />,
  search: <FeatureIcon d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" />,
  users: <FeatureIcon d="M17 20h5v-2a3 3 0 00-5.36-1.86M17 20H7m10 0v-2a5 5 0 00-9.29-2.51M7 20H2v-2a3 3 0 015.36-1.86M7 20v-2a5 5 0 019.29-2.51M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
  partners: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-[18px] h-[18px]">
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </svg>
  ),
  lock: <FeatureIcon d="M5 11h14v9a2 2 0 01-2 2H7a2 2 0 01-2-2v-9zm3 0V7a4 4 0 018 0v4" />,
  upload: <FeatureIcon d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v13.5" />,
  folder: <FeatureIcon d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
};

type Detail = { icon: React.ReactNode; title: string; desc: string };

function DetailCard({ icon, title, desc, dark }: Detail & { dark?: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-4 transition", dark ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]" : "border-slate-100 bg-white hover:border-amber-200 hover:shadow-md")}>
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-slate-900 shrink-0 shadow-sm shadow-amber-500/20">{icon}</span>
      <p className={clsx("font-bold text-sm mt-3", dark ? "text-white" : "text-slate-900")}>{title}</p>
      <p className={clsx("text-[13px] mt-1 leading-relaxed", dark ? "text-slate-400" : "text-slate-500")}>{desc}</p>
    </div>
  );
}

/* ── Seção de feature com texto de um lado e visual do outro ── */
function Feature({
  eyebrow, title, desc, details, reverse, dark, tint, visual,
}: {
  eyebrow: string; title: React.ReactNode; desc: string; details: Detail[]; reverse?: boolean; dark?: boolean; tint?: boolean; visual: React.ReactNode;
}) {
  return (
    <section className={clsx("relative overflow-hidden", dark ? "bg-slate-950" : tint ? "bg-gradient-to-b from-amber-50/60 to-white" : "bg-white")}>
      <div className={clsx("pointer-events-none absolute -top-24 w-[26rem] h-[26rem] rounded-full blur-[110px] -z-0", dark ? "bg-amber-500/10" : "bg-amber-300/20", reverse ? "-left-24" : "-right-24")} />
      <div className={`relative max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-14 items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold px-3 py-1.5">
            {eyebrow}
          </span>
          <h2 className={`${heading.className} text-3xl sm:text-4xl font-extrabold mt-4 leading-tight ${dark ? "text-white" : "text-slate-900"}`}>
            {title}
          </h2>
          <p className={`mt-4 text-[15px] leading-relaxed max-w-lg ${dark ? "text-slate-400" : "text-slate-500"}`}>{desc}</p>
          <div className="mt-7 grid sm:grid-cols-2 gap-3">
            {details.map(d => <DetailCard key={d.title} {...d} dark={dark} />)}
          </div>
        </div>
        <div className="min-w-0">{visual}</div>
      </div>
    </section>
  );
}

/* ── Card de agenda semanal — visual diferente do mockup de WhatsApp,
 *  reforça a ideia de sincronização com o Google Agenda. ── */
function CalendarCard() {
  const days = ["S", "T", "Q", "Q", "S", "S", "D"];
  const dates = [13, 14, 15, 16, 17, 18, 19];
  const todayIdx = 4;
  const { ref, stage } = useAnimatedStage<HTMLDivElement>(3, 1900);
  return (
    <div ref={ref} className="max-w-sm mx-auto space-y-3 relative">
      <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-amber-300/20 blur-3xl -z-10" />
      <div className="rounded-2xl border border-slate-100 bg-white shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-slate-900 text-sm">Julho, esta semana</p>
          <span className={clsx("text-[10px] rounded-full px-2.5 py-1 font-semibold transition-all", stage >= 1 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>{stage >= 1 ? "✓ Sincronizado" : "↻ Google Agenda"}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="text-center">
              <p className="text-[10px] text-slate-400 font-semibold mb-1.5">{d}</p>
              <div className={clsx("relative aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-500", i === todayIdx ? "bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 shadow-md" : "text-slate-500 bg-slate-50", i === todayIdx && stage === 0 && "scale-110 ring-4 ring-amber-100")}>
                {dates[i]}
                {i === todayIdx && stage >= 1 && <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={clsx("rounded-2xl border bg-white p-4 flex items-center gap-3 transition-all duration-500", stage === 1 ? "border-amber-300 shadow-xl -translate-y-1" : "border-slate-100 shadow-sm")}>
        <span className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5 text-amber-600">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">Reunião com o time todo</p>
          <p className="text-xs text-slate-400">Hoje, 14:00 · Google Meet</p>
        </div>
        <span className={clsx("ml-auto text-[10px] font-bold transition", stage >= 1 ? "text-emerald-600 opacity-100" : "text-slate-300 opacity-0")}>CRIADO</span>
      </div>
      <div className={clsx("rounded-2xl border p-4 flex items-center gap-3 transition-all duration-500", stage === 2 ? "border-slate-800 bg-slate-950 text-white shadow-xl translate-y-0 opacity-100" : "border-slate-100 bg-white text-slate-800 translate-y-2 opacity-60")}>
        <span className={clsx("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", stage === 2 ? "bg-amber-400 text-slate-950" : "bg-amber-50 text-amber-600")}>{FEATURE_ICONS.bell}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">Lembrete enviado no WhatsApp</p>
          <p className={clsx("text-xs", stage === 2 ? "text-slate-400" : "text-slate-400")}>Reunião com o time em 15 minutos</p>
        </div>
      </div>
      <div className="flex justify-center gap-1.5" aria-label={`Etapa ${stage + 1} de 3`}>{[0, 1, 2].map(item => <span key={item} className={clsx("h-1.5 rounded-full transition-all", item === stage ? "w-6 bg-amber-400" : "w-1.5 bg-slate-200")} />)}</div>
    </div>
  );
}

function MeetingFlowDemo() {
  const { ref, stage } = useAnimatedStage<HTMLDivElement>(4, 1900);
  const steps = [
    ["Reunião criada", "Time Comercial · hoje, 14:00"],
    ["Convites enviados", "Carla, Pedro e Marina confirmados"],
    ["Google Meet em andamento", "3 participantes · 32 minutos"],
    ["Ata pronta pela IA", "Decisões e próximas ações organizadas"],
  ];
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-amber-300/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-sm font-extrabold text-slate-900">Reunião · Time Comercial</p><p className="text-[11px] text-slate-400">Fluxo automatizado pelo Zelo</p></div><span className={clsx("h-2.5 w-2.5 rounded-full", stage === 2 ? "animate-pulse bg-red-500" : "bg-emerald-500")} /></div>
        <div className="p-5">
          <div className="relative space-y-3 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-slate-200">
            {steps.map(([title, desc], index) => (
              <div key={title} className={clsx("relative flex items-start gap-3 rounded-2xl border p-3.5 transition-all duration-500", stage === index ? "translate-x-1 border-amber-300 bg-amber-50 shadow-lg" : index < stage ? "border-emerald-100 bg-emerald-50/50" : "border-slate-100 bg-white opacity-55")}>
                <span className={clsx("relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black transition", index < stage ? "bg-emerald-500 text-white" : stage === index ? "bg-amber-400 text-slate-950" : "bg-slate-100 text-slate-400")}>{index < stage ? "✓" : index + 1}</span>
                <div><p className="text-sm font-bold text-slate-800">{title}</p><p className="mt-0.5 text-[11px] text-slate-500">{desc}</p></div>
              </div>
            ))}
          </div>
          <div className={clsx("mt-4 overflow-hidden rounded-2xl bg-slate-950 p-4 text-white transition-all duration-500", stage === 3 ? "max-h-36 opacity-100" : "max-h-0 p-0 opacity-0")}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Resumo da IA</p><p className="mt-2 text-xs leading-relaxed text-slate-300">Decidido: fechar a proposta até sexta. Carla envia o contrato revisado. Próxima reunião na quinta-feira.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceImportDemo() {
  const { ref, stage } = useAnimatedStage<HTMLDivElement>(4, 1850);
  const steps = [
    ["PDF recebido", "fatura_julho.pdf", "📤"],
    ["IA lendo lançamentos", "34 itens identificados", "✦"],
    ["Duplicados comparados", "5 compras já registradas", "↻"],
    ["Pronto para confirmar", "29 novos lançamentos", "✓"],
  ];
  return (
    <div ref={ref} className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {steps.map(([title, desc, icon], index) => (
          <div key={title} className={clsx("flex items-center gap-3 rounded-2xl border p-4 transition-all duration-500", stage === index ? "translate-x-1 border-amber-300 bg-amber-50 shadow-lg" : index < stage ? "border-emerald-100 bg-emerald-50/50" : "border-slate-100 bg-white opacity-60")}>
            <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg transition", index < stage ? "bg-emerald-500 text-white" : stage === index ? "bg-amber-400 text-slate-950" : "bg-slate-100")}>{index < stage ? "✓" : icon}</span>
            <div><p className="text-sm font-bold text-slate-900">{index + 1}. {title}</p><p className="text-xs text-slate-500">{desc}</p></div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white sm:p-8">
        <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Importação inteligente</p><p className="mt-1 text-lg font-extrabold">Fatura de julho</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-400">Etapa {stage + 1}/4</span></div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-700" style={{ width: `${(stage + 1) * 25}%` }} /></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Encontrados", "34", "text-white"],
            ["Novos", stage >= 1 ? "29" : "—", "text-emerald-400"],
            ["Duplicados", stage >= 2 ? "5" : "—", "text-amber-400"],
          ].map(([label, value, color]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={clsx("mt-2 text-2xl font-extrabold transition-all", color)}>{value}</p></div>)}
        </div>
        <div className={clsx("mt-5 rounded-2xl border p-4 transition-all duration-500", stage === 3 ? "border-emerald-400/30 bg-emerald-400/10 opacity-100" : "border-white/10 bg-white/[0.03] opacity-55")}><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold">Revisão concluída</p><p className="mt-1 text-[11px] text-slate-400">Nada é importado sem sua aprovação.</p></div><span className={clsx("rounded-xl px-4 py-2 text-xs font-extrabold transition", stage === 3 ? "bg-emerald-400 text-slate-950" : "bg-white/10 text-slate-500")}>Confirmar</span></div></div>
      </div>
    </div>
  );
}

const NAV_ICONS = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[15px] h-[15px]"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" /></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[15px] h-[15px]"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[15px] h-[15px]"><rect x="3" y="5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M16 3v4M8 3v4M3 10h18" /></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[15px] h-[15px]"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.36-1.86M17 20H7m10 0v-2a5 5 0 00-9.29-2.51M7 20H2v-2a3 3 0 015.36-1.86M7 20v-2a5 5 0 019.29-2.51M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
};

function PhoneStatusBar() {
  return (
    <div className="bg-slate-950 px-5 pt-2.5 pb-1 flex items-center justify-between relative">
      <span className="text-[12px] text-white font-semibold tabular-nums">10:09</span>
      <div className="w-[86px] h-[20px] rounded-full bg-black mx-auto absolute left-1/2 -translate-x-1/2 top-1.5 flex items-center justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
      </div>
      <div className="flex items-center gap-1.5 text-white">
        <svg viewBox="0 0 16 12" className="w-4 h-3" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="0.5" /><rect x="4.5" y="4.5" width="3" height="7.5" rx="0.5" /><rect x="9" y="2" width="3" height="10" rx="0.5" /><rect x="13" y="0" width="3" height="12" rx="0.5" /></svg>
        <svg viewBox="0 0 25 12" className="w-5 h-3" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="21" height="11" rx="2.5" /><rect x="2" y="2" width="16" height="8" rx="1.2" fill="currentColor" stroke="none" /></svg>
      </div>
    </div>
  );
}

function PhoneNavBar({ active }: { active: keyof typeof NAV_ICONS }) {
  return (
    <div className="bg-slate-950 border-t border-white/[0.06] px-5 py-3 flex items-center justify-between">
      {(Object.keys(NAV_ICONS) as (keyof typeof NAV_ICONS)[]).map(key => (
        <span key={key} className={clsx("flex items-center justify-center w-9 h-9 rounded-xl transition", key === active ? "bg-amber-400/15 text-amber-400" : "text-slate-600")}>
          {NAV_ICONS[key]}
        </span>
      ))}
    </div>
  );
}

/* ── Tela 1: painel completo (celular da frente) ── */
function DashboardPhoneScreen() {
  const kpis = [
    { label: "Entradas", value: fmt(5800), tone: "emerald" as const },
    { label: "Saídas", value: fmt(2558.5), tone: "red" as const },
    { label: "A receber", value: fmt(420), tone: "sky" as const },
    { label: "A pagar", value: fmt(1420), tone: "orange" as const },
  ];
  const tones = {
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    red: "bg-red-500/10 border-red-500/20 text-red-400",
    sky: "bg-sky-500/10 border-sky-500/20 text-sky-400",
    orange: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  };
  return (
    <div>
      <PhoneStatusBar />
      <div className="bg-slate-950 px-5 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
              <Image src="/brand/zelo-icon.png" alt="" width={15} height={15} />
            </div>
            <span className="text-white text-[13px] font-bold">Zelo</span>
          </div>
          <span className="text-slate-400 text-[10px] font-medium">Julho 2026</span>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800/60 border border-white/[0.06] p-4 mb-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">Saldo do período</p>
            <span className="text-[9px] bg-emerald-500/15 text-emerald-400 rounded-full px-1.5 py-0.5 font-semibold">▲ 12%</span>
          </div>
          <p className="text-white text-2xl font-extrabold mt-1 tabular-nums">{fmt(3241.5)}</p>
          <svg viewBox="0 0 200 46" className="w-full h-9 mt-2" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 34 L28 30 L56 36 L84 20 L112 24 L140 10 L168 15 L200 4 V46 H0 Z" fill="url(#sparkFill)" />
            <path d="M0 34 L28 30 L56 36 L84 20 L112 24 L140 10 L168 15 L200 4" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {kpis.map(k => (
            <div key={k.label} className={clsx("rounded-xl border p-3", tones[k.tone])}>
              <p className="text-[8.5px] uppercase tracking-wide font-semibold opacity-80">{k.label}</p>
              <p className="text-white text-[13px] font-bold mt-1 tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" /></svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[11.5px] font-semibold truncate">Freelance</p>
            <p className="text-slate-500 text-[9px]">Hoje</p>
          </div>
          <span className="text-emerald-400 text-[12px] font-bold shrink-0 tabular-nums">{fmt(1200)}</span>
        </div>
      </div>
      <PhoneNavBar active="home" />
    </div>
  );
}

/* ── Painel realista dentro de um único celular elegante. Os cards ao redor
 * reforçam o que acabou de acontecer sem competir com a tela principal. ── */
function DashboardDevice() {
  return (
    <div className="relative mx-auto flex min-h-[570px] w-full max-w-[420px] items-center justify-center">
      <div className="pointer-events-none absolute inset-10 rounded-full bg-amber-300/30 blur-[90px]" />
      <div className="absolute left-0 top-20 z-20 hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gasto registrado</p>
        <p className="mt-1 text-sm font-extrabold text-slate-900">Mercado · R$ 184,90</p>
        <p className="mt-0.5 text-[11px] font-semibold text-emerald-600">Categorizado automaticamente</p>
      </div>
      <div className="absolute bottom-24 right-0 z-20 hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Visão completa</p>
        <p className="mt-1 text-sm font-extrabold text-slate-900">Pessoal separado da empresa</p>
      </div>
      <div className="relative z-10 rounded-[3.4rem] bg-gradient-to-br from-slate-700 via-slate-950 to-black p-[7px] shadow-[0_35px_80px_-30px_rgba(15,23,42,.7)] ring-1 ring-slate-400/40">
        <div className="overflow-hidden rounded-[2.95rem] bg-slate-950 ring-1 ring-white/10">
          <DashboardPhoneScreen />
        </div>
        <span className="absolute -right-[3px] top-28 h-16 w-[3px] rounded-r bg-slate-700" />
        <span className="absolute -left-[3px] top-24 h-10 w-[3px] rounded-l bg-slate-700" />
        <span className="absolute -left-[3px] top-36 h-14 w-[3px] rounded-l bg-slate-700" />
      </div>
    </div>
  );
}

/* ── Demo interativa do Modo Pessoal / Modo Empresa ── */
const MODE_DATA = {
  personal: {
    label: "👤 Pessoal", sub: "Saldo pessoal · julho", balance: 3241.5,
    cats: [["Alimentação", 620], ["Transporte", 310], ["Lazer", 180]] as [string, number][],
  },
  business: {
    label: "🏢 Empresa", sub: "Saldo da empresa · julho", balance: 18420.9,
    cats: [["Fornecedores", 4200], ["Marketing", 1800], ["Funcionários", 9600]] as [string, number][],
  },
};

function ModeToggleDemo() {
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const d = MODE_DATA[mode];
  return (
    <div className="max-w-sm mx-auto relative">
      <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-gradient-to-br from-amber-300/25 to-amber-300/25 blur-3xl -z-10" />
      <div className="rounded-3xl bg-white border border-slate-100 shadow-xl p-5">
        <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
          {(["personal", "business"] as const).map(key => (
            <button key={key} onClick={() => setMode(key)}
              className={clsx("flex-1 py-2.5 rounded-lg text-xs font-bold transition", mode === key ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600")}>
              {MODE_DATA[key].label}
            </button>
          ))}
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-xl transition-all">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{d.sub}</p>
          <p className="text-3xl font-extrabold mt-1 transition-all">{fmt(d.balance)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {d.cats.map(([cat, val]) => (
            <div key={cat} className="rounded-xl border border-slate-100 p-2.5 text-center">
              <p className="text-[9px] text-slate-400 truncate">{cat}</p>
              <p className="text-xs font-bold text-slate-700 mt-0.5">{fmt(val)}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-[11px] text-slate-400 mt-3">↑ clique pra alternar entre os modos</p>
    </div>
  );
}

const MODE_BENEFITS = {
  personal: {
    label: "Modo Pessoal",
    eyebrow: "Sua vida em ordem",
    description: "Cuide das contas da casa, dos compromissos e dos objetivos pessoais sem depender de planilhas ou vários aplicativos.",
    benefits: [
      ["Finanças pessoais", "Receitas, despesas, faturas e parcelamentos organizados automaticamente."],
      ["Agenda e tarefas", "Compromissos, tarefas e lembretes criados pela conversa."],
      ["Metas e recorrências", "Acompanhe objetivos e não esqueça contas que se repetem."],
      ["Casa e família", "Lista de mercado, veículos e números familiares ilimitados."],
      ["Documentos importantes", "Guarde comprovantes e encontre tudo por significado."],
      ["Visão de quem registrou", "Saiba qual pessoa da família adicionou cada informação."],
    ],
  },
  business: {
    label: "Modo Empresa",
    eyebrow: "Seu negócio sob controle",
    description: "Centralize a operação do dia a dia e acompanhe o que entra, o que sai e o que sua equipe precisa fazer.",
    benefits: [
      ["Financeiro empresarial", "Caixa, contas a pagar e receber, faturas e categorias do negócio."],
      ["Clientes organizados", "Cadastre contatos, empresas, telefones, endereços e observações."],
      ["Equipe e folha", "Funcionários, cargos, salários e pagamentos recorrentes em um lugar."],
      ["Veículos da empresa", "Quilometragem, combustível, manutenção, seguro e despesas."],
      ["Reuniões e agenda", "Google Meet, participantes, compromissos e atas geradas por IA."],
      ["Sócios e equipe", "Cada pessoa usa o próprio WhatsApp, com acesso definido por modo."],
    ],
  },
} as const;

function ModeBenefits() {
  const [mode, setMode] = useState<keyof typeof MODE_BENEFITS>("personal");
  const content = MODE_BENEFITS[mode];
  return (
    <section id="modo" className="relative overflow-hidden bg-slate-950 py-24">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-amber-300">DOIS MODOS · UMA ÚNICA CONTA</span>
          <h2 className={`${heading.className} mt-5 text-3xl font-extrabold text-white sm:text-5xl`}>Sua vida pessoal e sua empresa, cada uma no seu lugar.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400">Você alterna o modo no painel ou pelo WhatsApp. Saldos, categorias, metas e relatórios permanecem separados para não misturar a casa com o negócio.</p>
        </div>

        <div className="mx-auto mt-10 flex max-w-lg rounded-2xl border border-white/10 bg-white/5 p-1.5" role="tablist" aria-label="Benefícios por modo">
          {(Object.keys(MODE_BENEFITS) as Array<keyof typeof MODE_BENEFITS>).map(key => (
            <button key={key} role="tab" aria-selected={mode === key} onClick={() => setMode(key)} className={clsx("flex-1 rounded-xl px-4 py-3 text-sm font-extrabold transition", mode === key ? "bg-amber-400 text-slate-950 shadow-lg" : "text-slate-400 hover:text-white")}>{MODE_BENEFITS[key].label}</button>
          ))}
        </div>

        <div className="mt-8 grid overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] lg:grid-cols-[.78fr_1.22fr]">
          <div className="border-b border-white/10 p-7 lg:border-b-0 lg:border-r sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">{content.eyebrow}</p>
            <h3 className={`${heading.className} mt-3 text-3xl font-extrabold text-white`}>{content.label}</h3>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">{content.description}</p>
            <div className="mt-8"><ModeToggleDemo /></div>
          </div>
          <div className="grid gap-px bg-white/10 sm:grid-cols-2">
            {content.benefits.map(([title, desc], index) => (
              <article key={title} className="bg-slate-950/90 p-6 sm:p-7">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 text-xs font-extrabold text-amber-400">0{index + 1}</span>
                <h4 className={`${heading.className} mt-4 font-bold text-white`}>{title}</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DriveSearchDemo() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const timer = setInterval(() => setStage(current => (current + 1) % 3), 2200);
    return () => clearInterval(timer);
  }, [inView]);

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-lg">
      <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-amber-300/25 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-amber-400">{FEATURE_ICONS.folder}</span>
          <div className="flex-1"><p className="text-sm font-extrabold text-slate-900">Drive do Zelo</p><p className="text-[11px] text-slate-400">Organizado automaticamente por IA</p></div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600">Sincronizado</span>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-slate-400">⌕</span>
            <p className="flex-1 truncate text-sm text-slate-700">comprovante do mecânico deste ano</p>
            <span className={clsx("h-2 w-2 rounded-full bg-amber-400", stage === 1 && "animate-ping")} />
          </div>

          <div className="mt-5 min-h-[265px]">
            <div className={clsx("rounded-2xl border p-4 transition-all duration-500", stage === 0 ? "translate-y-0 border-amber-200 bg-amber-50 opacity-100" : "-translate-y-2 border-slate-100 bg-slate-50 opacity-45")}>
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg shadow-sm">📄</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">comprovante_mecanico.pdf</p><p className="text-[11px] text-slate-400">Recebido pelo WhatsApp · agora</p></div><span className="text-xs font-bold text-amber-600">Enviando</span></div>
            </div>

            <div className={clsx("mt-3 rounded-2xl border p-4 transition-all duration-500", stage === 1 ? "scale-100 border-sky-200 bg-sky-50 opacity-100" : "scale-[.98] border-slate-100 bg-white opacity-45")}>
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-sky-600">IA analisando</p><p className="mt-1 text-sm font-bold text-slate-800">Comprovante identificado</p></div><span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold text-sky-700">Comprovantes</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className={clsx("h-full rounded-full bg-sky-500 transition-all duration-1000", stage === 1 ? "w-full" : "w-1/3")} /></div>
            </div>

            <div className={clsx("mt-3 rounded-2xl border p-4 transition-all duration-500", stage === 2 ? "translate-y-0 border-emerald-200 bg-emerald-50 opacity-100 shadow-lg shadow-emerald-500/10" : "translate-y-2 border-slate-100 bg-white opacity-45")}>
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">✓</span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Encontrado pela busca</p><p className="truncate text-sm font-bold text-slate-800">Comprovante · Oficina Mecânica</p><p className="text-[11px] text-slate-400">PDF · pasta Comprovantes</p></div></div>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-center gap-1.5" aria-label={`Etapa ${stage + 1} de 3`}>
            {[0, 1, 2].map(item => <span key={item} className={clsx("h-1.5 rounded-full transition-all", stage === item ? "w-6 bg-amber-400" : "w-1.5 bg-slate-200")} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

const FINANCAS_DETAILS: Detail[] = [
  { icon: FEATURE_ICONS.mic, title: "Áudio, texto ou foto", desc: "Fale naturalmente, digite ou mande foto do recibo — os três formatos são entendidos na hora." },
  { icon: FEATURE_ICONS.tag, title: "Categorização automática", desc: "Cada gasto já chega organizado por categoria, sem escolher nada na mão." },
  { icon: FEATURE_ICONS.repeat, title: "Recorrentes e parcelados", desc: "Assinaturas e parcelamentos com lembrete automático a cada vencimento." },
  { icon: FEATURE_ICONS.switch, title: "Pessoal ou empresa", desc: "Registre no modo certo e nunca misture as contas de casa com as do negócio." },
];

const PAINEL_DETAILS: Detail[] = [
  { icon: FEATURE_ICONS.chart, title: "Categorias sob medida", desc: "Crie e edite suas próprias categorias, do jeito que fizer sentido pra você." },
  { icon: FEATURE_ICONS.clock, title: "Lançamentos pendentes", desc: "Contas futuras entram automaticamente no saldo assim que a data chega." },
  { icon: FEATURE_ICONS.target, title: "Metas com prazo", desc: "Defina o valor alvo e a data, acompanhe o progresso quando quiser." },
  { icon: FEATURE_ICONS.pencil, title: "Edite conversando", desc: "Mude valor, categoria ou data só descrevendo o que precisa mudar." },
];

const AGENDA_DETAILS: Detail[] = [
  { icon: FEATURE_ICONS.chat, title: "Fale do seu jeito", desc: "Diga a data e o horário como preferir — o Zelo entende e agenda certinho." },
  { icon: FEATURE_ICONS.sync, title: "Sincronizado com o Google", desc: "Tudo espelhado automaticamente no Google Agenda, nos dois sentidos." },
  { icon: FEATURE_ICONS.bell, title: "Lembretes automáticos", desc: "Você é avisado antes de cada compromisso, sem configurar nada." },
  { icon: FEATURE_ICONS.check, title: "Tarefas do dia", desc: "Marque compromissos e afazeres como feitos direto pelo WhatsApp." },
];

const REUNIOES_DETAILS: Detail[] = [
  { icon: FEATURE_ICONS.link, title: "Link em segundos", desc: "Peça e o Zelo cria o Google Meet na hora, sem abrir o Google Agenda." },
  { icon: FEATURE_ICONS.megaphone, title: "Convite automático", desc: "Participantes chamados direto pelo WhatsApp, sem trabalho manual." },
  { icon: FEATURE_ICONS.doc, title: "Ata gerada por IA", desc: "Ao final, o Zelo resume decisões e próximos passos automaticamente." },
  { icon: FEATURE_ICONS.search, title: "Fácil de encontrar depois", desc: "A ata fica salva e pode ser consultada quando você quiser." },
];

const CONTA_DETAILS: Detail[] = [
  { icon: FEATURE_ICONS.users, title: "Casais", desc: "Registrem os gastos da casa numa conta só, sem duplicar controle." },
  { icon: FEATURE_ICONS.partners, title: "Sócios", desc: "Lancem despesas e receitas da empresa no mesmo lugar, no modo empresa." },
  { icon: FEATURE_ICONS.lock, title: "Sem compartilhar senha", desc: "Cada pessoa usa o próprio número de WhatsApp, com segurança." },
  { icon: FEATURE_ICONS.tag, title: "Identificado por pessoa", desc: "Todo lançamento mostra quem da família ou da equipe registrou." },
];

const DRIVE_DETAILS: Detail[] = [
  { icon: FEATURE_ICONS.upload, title: "Envie qualquer arquivo", desc: "Direto pelo WhatsApp, sem app extra e sem fazer login em lugar nenhum." },
  { icon: FEATURE_ICONS.folder, title: "Organização automática", desc: "O Zelo entende o conteúdo e guarda na pasta certa sozinho." },
  { icon: FEATURE_ICONS.search, title: "Busca por significado", desc: "Descreva o que procura, mesmo sem lembrar o nome — a IA encontra." },
  { icon: FEATURE_ICONS.pencil, title: "Renomeie conversando", desc: "Peça pra renomear o último arquivo só digitando o novo nome." },
];

const FAQS = [
  { q: "O que é o Zelo e como ele funciona?", a: "O Zelo é um assistente pessoal por IA que vive no seu WhatsApp. Você fala, digita ou manda foto do que precisa registrar — finanças, compromissos, tarefas — e ele organiza tudo automaticamente, com um painel web pra você acompanhar sempre que quiser." },
  { q: "Preciso instalar algum aplicativo?", a: "Não. Todo o dia a dia acontece no seu WhatsApp normal, sem instalar nada. O painel web é opcional, pra quando você quiser uma visão mais completa." },
  { q: "Como funciona o Modo Pessoal e o Modo Empresa?", a: "É a mesma conta e o mesmo WhatsApp, mas com dois ambientes separados: um pra vida pessoal e outro pra empresa. Você troca de modo com um clique no painel (ou pedindo pro Zelo), e cada um tem seu próprio saldo, categorias e metas — sem misturar as contas." },
  { q: "Como funciona a importação da fatura do cartão?", a: "Envie o PDF da fatura pelo WhatsApp (ou pelo painel) e o Zelo lê cada lançamento sozinho, categoriza automaticamente e avisa quando algum gasto já foi registrado antes — assim você nunca duplica uma compra." },
  { q: "Posso compartilhar minha conta com outras pessoas?", a: "Sim. Você pode vincular o número de família, sócios ou da sua equipe à mesma conta — cada um registra pelo próprio WhatsApp, identificado pelo nome, e tudo cai no mesmo painel." },
  { q: "O que acontece com minhas reuniões do Google Meet?", a: "Você pode pedir pro Zelo criar o link da reunião, chamar os participantes pelo WhatsApp e, quando terminar, ele gera automaticamente uma ata com os principais pontos discutidos." },
  { q: "Como funciona o Drive Inteligente?", a: "Mande qualquer arquivo pelo WhatsApp e o Zelo guarda na pasta certa sozinho. Depois, é só descrever o que procura — \"ache o comprovante do mecânico\" — que ele encontra pra você." },
  { q: "Meus dados estão seguros?", a: "Sim. Seus dados ficam vinculados à sua conta e nunca são compartilhados entre usuários diferentes — cada família, sócio ou equipe só enxerga a própria informação." },
  { q: "Como funciona o período de teste?", a: "Você começa com 14 dias grátis, sem precisar de cartão de crédito, com acesso completo a todas as funções." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-slate-950 py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold px-3 py-1.5">Tire suas dúvidas</span>
          <h2 className={`${heading.className} text-3xl sm:text-4xl font-extrabold text-white mt-4`}>Perguntas frequentes</h2>
          <p className="text-slate-400 mt-3 text-sm">Tudo o que você precisa saber sobre o Zelo antes de começar.</p>
        </div>
        <div className="space-y-2.5">
          {FAQS.map((f, i) => (
            <div key={f.q} className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                aria-controls={`faq-answer-${i}`}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-slate-100 hover:bg-white/[0.03] transition">
                {f.q}
                <span className={`shrink-0 w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-xs transition-transform ${open === i ? "rotate-45" : ""}`}>+</span>
              </button>
              {open === i && <p id={`faq-answer-${i}`} className="px-5 pb-5 text-sm text-slate-400 leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    number: "01",
    title: "Crie sua conta",
    desc: "Escolha o modo pessoal ou empresa e comece o teste grátis, sem cartão.",
  },
  {
    number: "02",
    title: "Conecte seu WhatsApp",
    desc: "Vincule seu número com um código rápido e seguro dentro do painel.",
  },
  {
    number: "03",
    title: "Fale com o Zelo",
    desc: "Envie texto, áudio, foto ou documento. A IA entende e organiza para você.",
  },
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="relative overflow-hidden bg-white py-24">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">COMECE EM POUCOS MINUTOS</span>
          <h2 className={`${heading.className} mt-5 text-3xl font-extrabold text-slate-950 sm:text-5xl`}>Da conversa ao controle completo.</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-500">Você não precisa aprender um sistema novo para organizar sua rotina. O Zelo começa no WhatsApp e mantém tudo visível no painel.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <article key={step.number} className="group relative rounded-3xl border border-slate-200 bg-slate-50 p-7 transition duration-300 hover:-translate-y-1 hover:border-amber-300 hover:bg-white hover:shadow-xl hover:shadow-slate-900/5">
              <div className="flex items-center justify-between">
                <span className={`${heading.className} text-4xl font-extrabold text-slate-200 transition group-hover:text-amber-300`}>{step.number}</span>
                {index < STEPS.length - 1 && <span className="hidden text-slate-300 md:block" aria-hidden="true">→</span>}
              </div>
              <h3 className={`${heading.className} mt-7 text-xl font-bold text-slate-900`}>{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLAN_OPTIONS = [
  {
    id: "monthly",
    label: "Mensal",
    price: "47",
    cents: "00",
    total: "Pagamento mensal",
    badge: null,
  },
  {
    id: "semiannual",
    label: "Semestral",
    price: "39",
    cents: "66",
    total: "R$ 147,00 à vista",
    badge: "Mais popular",
  },
  {
    id: "annual",
    label: "Anual",
    price: "29",
    cents: "70",
    total: "R$ 297,00 à vista",
    badge: "Melhor valor",
  },
] as const;

function PlanChoice() {
  return (
    <section id="planos" className="relative overflow-hidden bg-slate-50 py-24">
      <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-amber-300/20 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-700">14 DIAS GRÁTIS · SEM CARTÃO</span>
          <h2 className={`${heading.className} mt-5 text-3xl font-extrabold text-slate-950 sm:text-5xl`}>Um plano para cada momento.</h2>
          <p className="mt-4 text-base text-slate-500">Todos os planos liberam o Zelo completo para uso pessoal e empresarial, com quantos números da família você quiser.</p>
        </div>

        <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
          {PLAN_OPTIONS.map(option => (
            <article key={option.id} className={clsx("relative flex flex-col rounded-[2rem] border bg-white p-7 transition duration-300 hover:-translate-y-1 hover:shadow-2xl sm:p-8", option.id === "semiannual" ? "border-amber-300 shadow-xl shadow-amber-500/10" : "border-slate-200 shadow-lg shadow-slate-900/5")}>
              {option.badge && (
                <span className={clsx("absolute -top-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-950 shadow-lg", option.id === "annual" ? "bg-emerald-400" : "bg-amber-400")}>{option.badge}</span>
              )}
              <h3 className={`${heading.className} mt-2 text-center text-2xl font-extrabold text-slate-950`}>{option.label}</h3>
              <div className="mt-7 flex items-end justify-center text-slate-950">
                <span className="mb-2 text-xl font-extrabold">R$</span>
                <span className={`${heading.className} text-6xl font-extrabold tracking-tight`}>{option.price}</span>
                <span className="mb-2 text-lg font-bold">,{option.cents}/mês</span>
              </div>
              <p className="mt-2 min-h-6 text-center text-sm font-semibold text-slate-500">{option.total}</p>
              <div className="my-7 h-px bg-slate-100" />
              <ul className="flex-1 space-y-3.5">
                {["Acesso a todas as funcionalidades", "Painel completo e personalizado", "Zelo no WhatsApp", "Uso pessoal e empresarial", "Números ilimitados para família", "Suporte prioritário"].map(feature => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-700">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href={`/cadastro?cycle=${option.id}`} className={clsx("mt-8 inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-extrabold transition", option.id === "semiannual" ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-300" : "border border-slate-300 text-slate-900 hover:border-slate-950 hover:bg-slate-950 hover:text-white")}>Começar agora →</Link>
            </article>
          ))}
        </div>
        <p className="mt-7 text-center text-xs text-slate-400">Você poderá escolher entre uso pessoal ou empresarial ao criar a conta. Os recursos são os mesmos em todos os períodos.</p>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`${heading.variable} overflow-x-hidden bg-white`}>
      {/* ── NAV ── */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Image src="/brand/zelo-wordmark-light.png" alt="Zelo" width={640} height={293} className="h-7 w-auto" priority />
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-300" aria-label="Navegação principal">
            <a href="#como-funciona" className="hover:text-white transition">Como funciona</a>
            <a href="#financas" className="hover:text-white transition">Finanças</a>
            <a href="#modo" className="hover:text-white transition">Modo Empresa</a>
            <a href="#agenda" className="hover:text-white transition">Agenda</a>
            <a href="#drive" className="hover:text-white transition">Drive</a>
            <a href="#planos" className="hover:text-white transition">Planos</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden sm:block text-sm text-slate-300 hover:text-white transition">Entrar</Link>
            <Link href="/cadastro" className="rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 text-sm font-bold px-4 py-2.5 hover:opacity-90 transition">
              Testar grátis →
            </Link>
            <button type="button" onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen} aria-label="Abrir menu" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white md:hidden">
              <span className="text-xl leading-none">{menuOpen ? "×" : "≡"}</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-white/10 bg-slate-950 px-6 py-5 md:hidden" aria-label="Navegação móvel">
            <div className="mx-auto grid max-w-7xl gap-1 text-sm text-slate-300">
              {[['como-funciona', 'Como funciona'], ['financas', 'Finanças'], ['modo', 'Modo Empresa'], ['agenda', 'Agenda'], ['drive', 'Drive'], ['planos', 'Planos']].map(([id, label]) => (
                <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-3 hover:bg-white/5 hover:text-white">{label}</a>
              ))}
              <Link href="/login" className="mt-2 rounded-xl border border-white/10 px-3 py-3 text-center font-bold text-white">Entrar na minha conta</Link>
            </div>
          </nav>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative bg-slate-950 overflow-hidden">
        <div className="pointer-events-none absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-amber-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute top-10 -right-32 w-[28rem] h-[28rem] rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-20 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> IA no WhatsApp para sua rotina
            </span>
            <h1 className={`${heading.className} text-4xl sm:text-6xl font-extrabold text-white mt-5 leading-[1.05]`}>
              Sua rotina organizada,{" "}
              <span className="bg-gradient-to-br from-amber-300 to-amber-500 bg-clip-text text-transparent">direto no WhatsApp.</span>
            </h1>
            <p className="text-slate-400 mt-5 text-[16px] leading-relaxed max-w-md">
              Finanças, agenda, tarefas, veículos e documentos. Organizados por IA, sem sair da conversa que você já usa todos os dias — no modo pessoal ou no modo empresa.
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link href="/cadastro" className="rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 text-sm font-bold px-6 py-3.5 hover:opacity-90 transition shadow-lg shadow-amber-500/20">
                Começar 14 dias grátis →
              </Link>
              <a href="#como-funciona" className="rounded-xl border border-white/10 px-6 py-3.5 text-center text-sm font-bold text-white transition hover:bg-white/5">Ver como funciona</a>
            </div>
            <p className="mt-3 text-xs text-slate-500">Sem cartão de crédito · configuração rápida · cancele quando quiser</p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
              <span>🎙️ Registre por áudio</span>
              <span>⚡ Consulte em segundos</span>
              <span>📋 Organize tudo no painel</span>
            </div>
          </div>

          <WhatsAppMock
            chips={[
              { label: "💸 Gasto categorizado", pos: "-left-8 top-10" },
              { label: "📅 Compromisso marcado", pos: "-right-6 bottom-24", delay: "1.4s" },
            ]}
            messages={[
              { from: "user", time: "20:40", text: "Bom dia, organiza meu dia?" },
              { time: "20:40", text: <>Claro! Vou cuidar da sua <b>agenda</b>, <b>finanças</b> e prioridades em um só lugar.</> },
              { time: "20:40", tags: ["Resumo", "Rotina"], text: `📆 Passando rapidinho:\nVi R$ 87,40 no cartão hoje.\n\nJá categorizei, salvei no painel e deixei tudo bonito por lá ✨` },
              { from: "user", time: "20:41", text: "Marca reunião amanhã 10h com a Carla" },
              { time: "20:41", tags: ["Google Agenda", "Lembrete criado"], text: "Marcado! ✅ Vou te lembrar 15 min antes." },
            ]}
          />
        </div>

        {/* trust strip */}
        <div className="relative border-t border-white/5 bg-slate-950/60">
          <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-xs text-slate-500">
            <span>🔒 Dados isolados por conta</span>
            <span>🤖 IA Google Gemini</span>
            <span>📱 100% pelo WhatsApp</span>
            <span>🌐 Painel web incluso</span>
          </div>
        </div>
      </section>

      <HowItWorks />

      {/* ── FINANÇAS ── */}
      <div id="financas">
        <Feature
          eyebrow="📋 Controle Financeiro"
          title="Anote seus gastos por áudio, texto ou foto."
          desc="Registre cada despesa ou receita em segundos. O Zelo ouve seus áudios, entende sua fala natural e categoriza tudo automaticamente — sem planilha, sem digitação."
          details={FINANCAS_DETAILS}
          visual={
            <ScreenChatDemo
              messages={[
                { from: "user", time: "09:08", typed: "Gastei 45 no mercado", text: "Gastei 45 no mercado" },
                { time: "09:08", tags: ["Alimentação", "Categorizado"], text: `💸 Despesa registrada!\n${fmt(45)} — Mercado` },
                { from: "user", time: "09:10", typed: "Recebi 1200 de freelance", text: "Recebi 1200 de freelance" },
                { time: "09:10", tags: ["Receita", "Categorizado"], text: `💰 Receita registrada!\n${fmt(1200)} — Freelance` },
              ]}
            />
          }
        />
      </div>

      <Feature
        eyebrow="📊 Seu Painel Financeiro"
        reverse
        tint
        title="Seu dinheiro organizado em um só painel."
        desc="Seus gastos, compromissos e metas organizados num painel completo. Você sempre sabe o que aconteceu, o que está pendente e o que vem pela frente."
        details={PAINEL_DETAILS}
        visual={<DashboardDevice />}
      />

      <ModeBenefits />

      {/* ── FATURA DE CARTÃO (destaque) ── */}
      <section id="fatura" className="relative overflow-hidden bg-white py-24">
        <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 w-[40rem] h-[24rem] rounded-full bg-amber-300/20 blur-[120px]" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold px-3 py-1.5">💳 Fatura do Cartão</span>
            <h2 className={`${heading.className} text-3xl sm:text-4xl font-extrabold text-slate-900 mt-4`}>Chega de digitar cada gasto do cartão.</h2>
            <p className="text-slate-500 mt-3 text-sm leading-relaxed">Envie a fatura em PDF pelo WhatsApp ou pelo painel. O Zelo lê cada lançamento, categoriza automaticamente e nunca registra o mesmo gasto duas vezes.</p>
          </div>

          <InvoiceImportDemo />

          <div className="text-center mt-10">
            <Link href="/cadastro" className="inline-block rounded-xl bg-gradient-to-br from-amber-500 to-amber-500 text-white text-sm font-bold px-6 py-3.5 hover:opacity-90 transition shadow-lg shadow-amber-500/20">
              Importar minha fatura →
            </Link>
          </div>
        </div>
      </section>

      {/* ── AGENDA ── */}
      <div id="agenda">
        <Feature
          eyebrow="📅 Agenda Inteligente"
          tint
          title="Nunca mais esqueça um compromisso."
          desc="Tenha lembretes e resumos diários. Registre compromissos no WhatsApp falando do seu jeito: o Zelo entende e organiza sua rotina. Tudo sincronizado com o Google Agenda."
          details={AGENDA_DETAILS}
          visual={<CalendarCard />}
        />
      </div>

      <Feature
        eyebrow="🎥 Reuniões e Atas"
        reverse
        title="Reuniões marcadas e resumidas sozinhas."
        desc="Peça pro Zelo criar o link do Google Meet, convocar os participantes pelo WhatsApp e, quando a reunião terminar, ele mesmo gera a ata com os pontos principais."
        details={REUNIOES_DETAILS}
        visual={<MeetingFlowDemo />}
      />

      {/* ── GRID DE MÓDULOS SECUNDÁRIOS ── */}
      <section className="relative overflow-hidden bg-slate-950 py-24">
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[44rem] h-[26rem] rounded-full bg-amber-500/10 blur-[130px]" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold px-3 py-1.5">✨ Muito mais</span>
            <h2 className={`${heading.className} text-3xl sm:text-4xl font-extrabold text-white mt-4`}>Muito mais que finanças.</h2>
            <p className="text-slate-400 mt-3 text-sm">Tudo o que organiza sua rotina — pessoal ou da empresa — em um só assistente.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {[
              { icon: MODULE_ICONS.bell, title: "Lembretes", desc: "Avisos únicos, diários, semanais ou mensais — o Zelo te chama na hora certa." },
              { icon: MODULE_ICONS.target, title: "Metas", desc: "Defina objetivos com valor alvo e prazo, e acompanhe quanto já falta pra chegar lá." },
              { icon: MODULE_ICONS.car, title: "Veículos", desc: "Combustível, manutenção, seguro e quilometragem de cada veículo, tudo num lugar." },
              { icon: MODULE_ICONS.users, title: "Funcionários", desc: "Cargo, salário e status de cada funcionário da sua empresa, sempre à mão." },
              { icon: MODULE_ICONS.cart, title: "Lista de mercado", desc: "Compras por categoria, preço, quantidade e loja, direto pelo WhatsApp." },
            ].map(c => (
              <div key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-amber-400/30 transition">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20">{c.icon}</span>
                <p className="font-bold text-white mt-4">{c.title}</p>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTA COMPARTILHADA ── */}
      <Feature
        eyebrow="👨‍👩‍👧 Conta Compartilhada"
        tint
        title="Convide quem precisar, sem senha."
        desc="Compartilhe o Zelo com sua família, sócios ou equipe. Cada pessoa registra pelo próprio WhatsApp, e você mantém visibilidade total sobre tudo num painel só."
        details={CONTA_DETAILS}
        visual={
          <div className="relative w-full max-w-sm mx-auto aspect-square flex items-center justify-center">
            <div className="pointer-events-none absolute inset-0 rounded-full bg-amber-300/20 blur-3xl -z-10" />
            <svg className="absolute inset-0 w-full h-full -z-0 opacity-40" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r="110" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="3 6" />
            </svg>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-xl z-10">
              <Image src="/brand/zelo-icon.png" alt="" width={40} height={40} />
            </div>
            {[
              { label: "Ana · Sócia", pos: "top-2 left-4" },
              { label: "Carla · Família", pos: "top-1/3 right-0" },
              { label: "Pedro · Esposo", pos: "bottom-2 left-8" },
              { label: "Marina · Equipe", pos: "bottom-6 right-6" },
            ].map((p, i) => (
              <div key={p.label} className={clsx("float-chip absolute bg-white rounded-xl border border-slate-100 shadow-lg px-3 py-2 text-xs font-medium text-slate-600", p.pos)} style={{ animationDelay: `${i * 0.5}s` }}>
                {p.label}
              </div>
            ))}
          </div>
        }
      />

      {/* ── DRIVE ── */}
      <div id="drive">
        <Feature
          eyebrow="📁 Drive Inteligente"
          reverse
          title="Seus documentos guardados. Encontrados por IA."
          desc="Envie qualquer arquivo pelo WhatsApp e tenha tudo salvo e organizado. Quando precisar, é só descrever com suas palavras que o Zelo encontra pra você."
          details={DRIVE_DETAILS}
          visual={<DriveSearchDemo />}
        />
      </div>

      {/* ── CTA banner ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-400 to-amber-500 py-24">
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className={`${heading.className} text-3xl sm:text-5xl font-extrabold text-slate-900`}>Sua rotina, sob controle.</h2>
          <p className="text-slate-800/80 mt-3 text-lg">Pessoal ou empresa — onde quer que você esteja, é só abrir o WhatsApp.</p>
          <Link href="/cadastro" className="inline-block mt-8 rounded-xl bg-slate-900 text-white text-sm font-bold px-7 py-3.5 hover:bg-slate-800 transition shadow-xl">
            Começar agora →
          </Link>
        </div>
      </section>

      <PlanChoice />

      <Faq />

      {/* ── FOOTER ── */}
      <footer className="bg-slate-950 border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center sm:items-start gap-1.5">
            <Image src="/brand/zelo-wordmark-light.png" alt="Zelo" width={640} height={293} className="h-6 w-auto" />
            <p className="text-slate-500 text-xs">Gestão inteligente, direto no WhatsApp.</p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <a href="#como-funciona" className="hover:text-white transition">Como funciona</a>
            <a href="#financas" className="hover:text-white transition">Finanças</a>
            <a href="#modo" className="hover:text-white transition">Modo Empresa</a>
            <a href="#agenda" className="hover:text-white transition">Agenda</a>
            <a href="#drive" className="hover:text-white transition">Drive</a>
            <Link href="/login" className="hover:text-white transition">Login</Link>
            <Link href="/cadastro" className="hover:text-white transition">Criar conta</Link>
          </nav>
        </div>
        <p className="text-center text-slate-600 text-[11px] mt-8">© {new Date().getFullYear()} Zelo. Todos os direitos reservados.</p>
      </footer>

      <div className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur md:hidden">
        <Link href="/cadastro" className="flex items-center justify-center rounded-xl bg-amber-400 px-5 py-3.5 text-sm font-extrabold text-slate-950">Começar 14 dias grátis →</Link>
      </div>
    </div>
  );
}
