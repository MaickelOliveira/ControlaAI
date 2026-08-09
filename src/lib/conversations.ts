import { readFileSync, existsSync, statSync } from "fs";
import { writeJSONAtomic } from "./json-store";
import path from "path";

export type ChatMessage = { role: "user" | "assistant"; content: string; ts: number; type?: "text" | "audio" | "image"; mediaUrl?: string };

type Conversation = {
  messages: ChatMessage[];
  contactName?: string | null;
  lastActivity: number;
  unread?: boolean;
  aiPaused?: boolean;
};

type ConversationStore = Record<string, Conversation>;

const FILE = path.join(process.cwd(), "data", "conversations.json");
const MAX_MESSAGES = 200;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// Cache em memória — só relê o disco quando o arquivo muda (mtime)
let _cache: ConversationStore | null = null;
let _cacheMtime = 0;

function load(): ConversationStore {
  try {
    if (!existsSync(FILE)) return {};
    const mtime = statSync(FILE).mtimeMs;
    if (_cache && mtime === _cacheMtime) return _cache;
    const parsed = JSON.parse(readFileSync(FILE, "utf-8"));
    _cache = Array.isArray(parsed) ? {} : parsed;
    _cacheMtime = mtime;
    return _cache!;
  } catch {
    return {};
  }
}

function save(data: ConversationStore) {
  writeJSONAtomic(FILE, data);
  _cache = data;
  try { _cacheMtime = statSync(FILE).mtimeMs; } catch { /* ignore */ }
}

/** Normaliza telefone gerando variantes (com/sem 55, com/sem 9º dígito) pra
 *  busca fuzzy — o Zelo é single-tenant, então a chave do store é só o
 *  telefone (sem prefixo de cliente/conexão como no trafegopagoplataforma). */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  const variants: string[] = [];

  if (local.length === 11 && local[2] === "9") {
    const sem9 = local.slice(0, 2) + local.slice(3);
    variants.push("55" + sem9);
    variants.push("55" + local);
    variants.push(sem9);
    variants.push(local);
  } else if (local.length === 10) {
    variants.push("55" + local);
    variants.push(local);
    if (/^[1-9]{2}[6-9]/.test(local)) {
      const com9 = local.slice(0, 2) + "9" + local.slice(2);
      variants.push("55" + com9);
      variants.push(com9);
    }
  } else {
    variants.push("55" + local);
    variants.push(local);
  }

  return [...new Set([...variants, digits])];
}

export function getHistory(phone: string): ChatMessage[] {
  const all = load();
  for (const v of phoneVariants(phone)) {
    const conv = all[v];
    if (conv) {
      if (Date.now() - conv.lastActivity > MAX_AGE_MS) return [];
      return conv.messages;
    }
  }
  return [];
}

export function getAllConversations(): Array<{
  phone: string;
  contactName: string | null;
  lastMessage: ChatMessage | null;
  lastActivity: number;
  unread: boolean;
  aiPaused: boolean;
  messageCount: number;
}> {
  const all = load();
  const result = [];
  for (const [phone, conv] of Object.entries(all)) {
    if (Date.now() - conv.lastActivity > MAX_AGE_MS) continue;
    const lastMessage = conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;
    result.push({
      phone,
      contactName: conv.contactName ?? null,
      lastMessage,
      lastActivity: conv.lastActivity,
      unread: conv.unread ?? false,
      aiPaused: conv.aiPaused ?? false,
      messageCount: conv.messages.length,
    });
  }
  // Deduplica por variante de telefone (mesmo padrão do original): mantém a mais recente
  const deduped = new Map<string, (typeof result)[0]>();
  for (const c of result) {
    const canonical = phoneVariants(c.phone)[0];
    const existing = deduped.get(canonical);
    if (!existing || c.lastActivity > existing.lastActivity) deduped.set(canonical, c);
  }
  return [...deduped.values()].sort((a, b) => b.lastActivity - a.lastActivity);
}

export function markAsRead(phone: string) {
  const all = load();
  for (const v of phoneVariants(phone)) {
    if (all[v]) {
      if (all[v].unread) { all[v].unread = false; save(all); }
      return;
    }
  }
}

export function setAiPaused(phone: string, paused: boolean) {
  const all = load();
  let changed = false;
  for (const v of phoneVariants(phone)) {
    if (all[v] && all[v].aiPaused !== paused) { all[v].aiPaused = paused; changed = true; }
  }
  if (changed) save(all);
}

export function getAiPaused(phone: string): boolean {
  const all = load();
  return phoneVariants(phone).some((v) => all[v]?.aiPaused === true);
}

export function addMessage(phone: string, msg: ChatMessage, opts?: { contactName?: string }) {
  const all = load();
  const existingKey = phoneVariants(phone).find((v) => all[v]) ?? phone;
  const conv: Conversation = all[existingKey] ?? { messages: [], lastActivity: 0 };

  // Deduplicação: ignora mensagem idêntica com mesmo role em janela de 10s
  const DEDUP_MS = 10_000;
  const lastMsg = conv.messages[conv.messages.length - 1];
  if (lastMsg && lastMsg.role === msg.role && lastMsg.content === msg.content && Math.abs(msg.ts - lastMsg.ts) < DEDUP_MS) {
    return;
  }

  conv.messages.push(msg);
  if (conv.messages.length > MAX_MESSAGES) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES);
  }
  conv.lastActivity = Date.now();
  if (opts?.contactName) {
    const sanitized = sanitizeContactName(opts.contactName, phone);
    const existingIsReal = conv.contactName && conv.contactName !== phone && !/^[\d\s+\-().]{7,}$/.test(conv.contactName);
    if (sanitized && !existingIsReal) conv.contactName = sanitized;
  }
  if (msg.role === "user") conv.unread = true;
  all[existingKey] = conv;
  save(all);
}

/** Valida/sanitiza nome de contato vindo de fontes externas (WhatsApp, webhooks).
 *  Retorna undefined se parecer telefone, for muito longo ou vazio. */
export function sanitizeContactName(raw: string | null | undefined, phone?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^[\d\s+\-().]{7,}$/.test(s)) return undefined;
  if (phone && s === phone) return undefined;
  if (s.length > 80) return undefined;
  return s;
}

/** Atualiza a última mensagem de uma conversa (ex: substituir "[Áudio]" pela transcrição). */
export function updateLastMessage(phone: string, patch: Partial<ChatMessage>) {
  const all = load();
  for (const v of phoneVariants(phone)) {
    const conv = all[v];
    if (conv && conv.messages.length > 0) {
      Object.assign(conv.messages[conv.messages.length - 1], patch);
      save(all);
      return;
    }
  }
}
