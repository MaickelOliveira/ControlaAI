import { getSupabase } from "./supabase";
import { isBusinessHours, todayStrBR } from "./date-br";
import type { SupportImageAttachment } from "./support-attachments";

export type SupportSender = "user" | "admin" | "system";
export type SupportMessage = {
  sender: SupportSender;
  text: string;
  ts: number;
  attachment?: SupportImageAttachment;
};
export type SupportStatus = "none" | "needs_attention" | "attended";

type SupportConversation = {
  messages: SupportMessage[];
  lastActivity: number;
  status: SupportStatus;
  // true entre o bot perguntar "qual sua dúvida?" e a pessoa responder —
  // só nessa janela o próximo texto dela dispara o aviso de "aguarde"
  // em vez de virar mais uma pergunta solta.
  awaitingFirstAnswer?: boolean;
  lastAutoReplyDay?: string; // evita repetir o aviso de fora-de-horário no mesmo dia
  unreadAdmin?: boolean; // tem mensagem do usuário que o admin ainda não viu
  unreadUser?: boolean;  // tem mensagem do admin que o usuário ainda não viu
};

const MAX_MESSAGES = 200;
const EMPTY: SupportConversation = { messages: [], lastActivity: 0, status: "none" };

async function findConversation(userId: string): Promise<SupportConversation | null> {
  const { data, error } = await getSupabase().from("support_conversations").select("data").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return data.data as SupportConversation;
}

async function saveConversation(userId: string, conv: SupportConversation) {
  const { error } = await getSupabase().from("support_conversations").upsert({ user_id: userId, data: conv });
  if (error) throw new Error(`Falha ao salvar conversa de suporte: ${error.message}`);
}

function pushMessage(conv: SupportConversation, msg: SupportMessage) {
  conv.messages.push(msg);
  if (conv.messages.length > MAX_MESSAGES) conv.messages = conv.messages.slice(-MAX_MESSAGES);
  conv.lastActivity = Date.now();
}

export async function getSupportThread(userId: string): Promise<{ messages: SupportMessage[]; status: SupportStatus }> {
  const conv = (await findConversation(userId)) ?? EMPTY;
  return { messages: conv.messages, status: conv.status };
}

export async function markSupportReadByUser(userId: string) {
  const conv = await findConversation(userId);
  if (conv?.unreadUser) {
    conv.unreadUser = false;
    await saveConversation(userId, conv);
  }
}

export async function markSupportReadByAdmin(userId: string) {
  const conv = await findConversation(userId);
  if (conv?.unreadAdmin) {
    conv.unreadAdmin = false;
    await saveConversation(userId, conv);
  }
}

export async function setSupportStatus(userId: string, status: SupportStatus) {
  const conv = (await findConversation(userId)) ?? { ...EMPTY };
  conv.status = status;
  await saveConversation(userId, conv);
}

export async function sendAdminSupportMessage(userId: string, text: string) {
  const conv = (await findConversation(userId)) ?? { ...EMPTY, messages: [] };
  pushMessage(conv, { sender: "admin", text, ts: Date.now() });
  conv.unreadUser = true;
  await saveConversation(userId, conv);
}

/** Processa uma mensagem nova do usuário no widget: grava, decide se o bot
 *  precisa responder automaticamente (fora de horário / pergunta inicial /
 *  aviso de espera) e devolve as mensagens do sistema geradas, na ordem —
 *  o caller (rota da API) devolve elas pro widget junto da confirmação. */
export async function postUserSupportMessage(
  userId: string,
  text: string,
  attachment?: SupportImageAttachment,
): Promise<SupportMessage[]> {
  const conv = (await findConversation(userId)) ?? { ...EMPTY, messages: [] };

  pushMessage(conv, { sender: "user", text, ts: Date.now(), ...(attachment ? { attachment } : {}) });
  conv.unreadAdmin = true;

  const systemReplies: SupportMessage[] = [];
  const todayStr = todayStrBR();

  function reply(text: string) {
    const msg: SupportMessage = { sender: "system", text, ts: Date.now() };
    pushMessage(conv, msg);
    systemReplies.push(msg);
  }

  if (!isBusinessHours()) {
    if (conv.lastAutoReplyDay !== todayStr) {
      reply("No momento estamos fora do horário de atendimento (segunda a sexta, das 9h às 18h). Deixe aqui sua dúvida ou problema que, assim que alguém da equipe estiver disponível, vamos te atender.");
      conv.lastAutoReplyDay = todayStr;
    }
    // Fora do horário ninguém vai ler em tempo real de qualquer forma —
    // não faz sentido esperar a etapa de "qual sua dúvida" pra sinalizar
    // pro admin, já marca como pendente assim que a pessoa escreve algo.
    if (conv.status !== "needs_attention") conv.status = "needs_attention";
  } else if (!conv.awaitingFirstAnswer && (conv.status === "none" || conv.status === "attended")) {
    // Primeiro contato de uma conversa nova (ou reaberta depois de já
    // atendida) — pergunta a dúvida antes de avisar a espera, só marca
    // como "precisa atendimento" depois que a pessoa responder.
    reply("Oi! Qual é a sua dúvida ou o problema que você está tendo?");
    conv.awaitingFirstAnswer = true;
  } else if (conv.awaitingFirstAnswer) {
    reply("Aguarde, em breve alguém da nossa equipe vai te atender.");
    conv.awaitingFirstAnswer = false;
    conv.status = "needs_attention";
  }
  // Senão: já está "needs_attention" e não está mais aguardando a primeira
  // resposta — é conversa humana em andamento, o bot fica quieto.

  await saveConversation(userId, conv);
  return systemReplies;
}

export async function getAllSupportConversations(): Promise<Array<{
  userId: string;
  userName: string | null;
  status: SupportStatus;
  lastMessage: SupportMessage | null;
  lastActivity: number;
  unreadAdmin: boolean;
  messageCount: number;
}>> {
  const { data, error } = await getSupabase().from("support_conversations").select("user_id, data, users(name)");
  if (error || !data) return [];
  type Row = { user_id: string; data: SupportConversation; users: { name: string } | null };
  return (data as unknown as Row[])
    .filter(r => r.data.messages.length > 0)
    .map(r => ({
      userId: r.user_id,
      userName: r.users?.name ?? null,
      status: r.data.status ?? "none",
      lastMessage: r.data.messages[r.data.messages.length - 1] ?? null,
      lastActivity: r.data.lastActivity,
      unreadAdmin: r.data.unreadAdmin ?? false,
      messageCount: r.data.messages.length,
    }))
    .sort((a, b) => b.lastActivity - a.lastActivity);
}
