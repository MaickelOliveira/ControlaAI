import { getSupabase } from "./supabase";

export type ChatMessage = { role: "user" | "assistant"; content: string; ts: number; type?: "text" | "audio" | "image"; mediaUrl?: string };

type Conversation = {
  messages: ChatMessage[];
  contactName?: string | null;
  lastActivity: number;
  unread?: boolean;
  aiPaused?: boolean;
};

const MAX_MESSAGES = 200;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

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

// Cada telefone é sua própria linha na tabela (chave primária) — em vez do
// blob único que o JSON usava, o que também elimina a necessidade do cache
// de mtime em memória (não faz sentido com um banco compartilhado entre
// instâncias).
async function findConversation(phone: string): Promise<{ key: string; conv: Conversation } | null> {
  const variants = phoneVariants(phone);
  const { data, error } = await getSupabase().from("conversations").select("phone, data").in("phone", variants);
  if (error || !data || data.length === 0) return null;
  const rows = data as Array<{ phone: string; data: Conversation }>;
  for (const v of variants) {
    const row = rows.find(r => r.phone === v);
    if (row) return { key: v, conv: row.data };
  }
  return null;
}

async function saveConversation(key: string, conv: Conversation) {
  await getSupabase().from("conversations").upsert({ phone: key, data: conv });
}

export async function getHistory(phone: string): Promise<ChatMessage[]> {
  const found = await findConversation(phone);
  if (!found) return [];
  if (Date.now() - found.conv.lastActivity > MAX_AGE_MS) return [];
  return found.conv.messages;
}

export async function getAllConversations(): Promise<Array<{
  phone: string;
  contactName: string | null;
  lastMessage: ChatMessage | null;
  lastActivity: number;
  unread: boolean;
  aiPaused: boolean;
  messageCount: number;
}>> {
  const { data, error } = await getSupabase().from("conversations").select("phone, data");
  if (error || !data) return [];
  const rows = data as Array<{ phone: string; data: Conversation }>;
  const result = [];
  for (const { phone, data: conv } of rows) {
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

export async function markAsRead(phone: string) {
  const found = await findConversation(phone);
  if (found?.conv.unread) {
    found.conv.unread = false;
    await saveConversation(found.key, found.conv);
  }
}

export async function setAiPaused(phone: string, paused: boolean) {
  const found = await findConversation(phone);
  if (found && found.conv.aiPaused !== paused) {
    found.conv.aiPaused = paused;
    await saveConversation(found.key, found.conv);
  }
}

export async function getAiPaused(phone: string): Promise<boolean> {
  const found = await findConversation(phone);
  return found?.conv.aiPaused === true;
}

export async function addMessage(phone: string, msg: ChatMessage, opts?: { contactName?: string }) {
  const found = await findConversation(phone);
  const key = found?.key ?? phone;
  const conv: Conversation = found?.conv ?? { messages: [], lastActivity: 0 };

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
  await saveConversation(key, conv);
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
export async function updateLastMessage(phone: string, patch: Partial<ChatMessage>) {
  const found = await findConversation(phone);
  if (found && found.conv.messages.length > 0) {
    Object.assign(found.conv.messages[found.conv.messages.length - 1], patch);
    await saveConversation(found.key, found.conv);
  }
}
