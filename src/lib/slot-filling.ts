import type { AIResult } from "./ai-processor";
import type { User } from "./users";
import {
  type PendingSlotFill,
  type SlotFillIntent,
  setPendingAction,
  clearPendingAction,
  parseAmountBR,
} from "./pending-actions";
import { createRecurring, type RecurringTransaction } from "./recurring";
import { createGoal, getGoalProgress } from "./goals";
import { createAppointment } from "./agenda";
import { createReminder } from "./reminders";
import { appointmentReminderAt, formatReminderOffset } from "./appointment-reminders";
import { todayStrBR, spToUTC } from "./date-br";
import { findOrCreateStore, addPurchase, finalizePurchaseFromChecked, setPurchaseFinanceId, type GroceryPurchaseItem } from "./grocery";
import { createEmployee, findEmployeeByName } from "./employees";
import { createCustomer, findCustomerByName } from "./customers";
import { createVehicle, FUEL_TYPE_LABEL, type FuelType } from "./vehicles";
import {
  replyRecurringCreated, replyAgendaCreated, replyGroceryPurchaseSaved, replyGroceryPurchaseFinished, replyEmployeeCreated, replyCustomerCreated, replyGoalCreated, replyReminderSet,
} from "./bot-replies";
import { addFinance } from "./finances";
import { findPhoneByName, getPhonesForUser } from "./wpp-phone-links";
import { phoneVariants } from "./conversations";

/**
 * Motor genérico de "perguntar o que falta" (slot-filling), usado quando uma
 * intenção precisa de um campo que muda o comportamento do sistema (ex:
 * quantas parcelas, dia do vencimento) e a mensagem original não trouxe.
 *
 * Um único motor reutilizado por várias intenções em vez de um fluxo sob
 * medida por caso — ver PendingSlotFill em pending-actions.ts para o
 * raciocínio da fila mutável de perguntas.
 */

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function localized(ctx: SlotCtx, pt: string, es: string, ptPt = pt): string {
  return ctx.user.locale === "es" ? es : ctx.user.locale === "pt-PT" ? ptPt : pt;
}

/** Interpreta texto livre como itens de compra: "arroz 25, feijão 8" →
 *  [{productName:"Arroz",price:25,...}]. Sem preço reconhecido no trecho,
 *  ainda cria o item com price:0 — melhor um item incompleto que perder a
 *  compra inteira; o usuário corrige no painel se precisar. */
function parseGroceryItemsText(text: string): GroceryPurchaseItem[] | null {
  const segments = text.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!segments.length) return null;
  const items: GroceryPurchaseItem[] = [];
  for (const seg of segments) {
    const amount = parseAmountBR(seg);
    const name = (amount !== null ? seg.replace(/[\d.,]+/g, "") : seg).trim();
    if (!name) continue;
    items.push({ productName: cap(name), category: "Outros", price: amount ?? 0, quantity: 1, unit: "un" });
  }
  return items.length ? items : null;
}

export type Draft = Record<string, unknown>;

export type SlotCtx = {
  user: User;
  userId: string;
  phone: string;
  mode: "personal" | "business";
};

export type SlotParse = { ok: true; value: unknown } | { ok: false };

export type SlotDef = {
  /** chave gravada no draft (por padrão — ver `apply` para casos especiais) */
  key: string;
  /** nome humano do campo, usado na nota de "usei o padrão para X" */
  label: string;
  /** interpreta a resposta do usuário; { ok:false } = não reconheci */
  parse: (text: string, draft: Draft, ctx: SlotCtx) => SlotParse;
  /** a pergunta (sem a linha de TTL — o motor anexa) */
  ask: (draft: Draft, ctx: SlotCtx) => string;
  /** re-pergunta após resposta inválida; default: "❓ Não entendi." + ask() */
  reask?: (draft: Draft, ctx: SlotCtx, attempt: number) => string;
  /** valor silencioso quando o usuário pula ("tanto faz") ou desiste depois
   *  de tentativas demais. AUSENTE = slot DURO: sem esse dado não há como criar. */
  fallback?: (draft: Draft, ctx: SlotCtx) => unknown;
  /** grava no draft; pode inspecionar/alterar a fila restante. Default:
   *  grava direto em draft[key]. */
  apply?: (value: unknown, draft: Draft, queue: string[], ctx: SlotCtx) => void;
};

export type FlowDef = {
  /** rascunho inicial a partir do que a IA já extraiu da mensagem original */
  seed: (ai: AIResult, ctx: SlotCtx) => Draft;
  slots: Record<string, SlotDef>;
  /** quais slots ainda faltam, EM ORDEM, dado o estado atual do rascunho */
  missing: (draft: Draft, ctx: SlotCtx) => string[];
  /** cria o registro de fato e devolve a mensagem de confirmação */
  finalize: (draft: Draft, ctx: SlotCtx) => Promise<string> | string;
  /** mensagem quando falta um slot DURO e não há como criar nada */
  giveUp: (draft: Draft, ctx: SlotCtx) => string;
};

const MAX_ASK = 2; // 3 tentativas no total por slot (índice 0, 1, 2)

const CANCEL_RE = /^(cancela(r)?|deixa( pra l[áa])?|esquece|para|sair|nada|desisto|n[ãa]o quero|olvida|salir|no quiero)\b/i;
const SKIP_RE = /^(tanto faz|pode ser|voc[êe] escolhe|padr[ãa]o|qualquer|sei l[áa]|como quiser|me da igual|puede ser|elige t[uú]|cualquiera)\b/i;

function isCancelWord(t: string): boolean {
  return CANCEL_RE.test(t.trim());
}
function isSkipWord(t: string): boolean {
  return SKIP_RE.test(t.trim());
}

/** Detecta se a resposta parece na verdade um comando novo (o usuário mudou
 *  de assunto) — só é chamada depois que o parse do slot já falhou.
 *  Heurística deliberadamente conservadora: melhor pecar por excesso de
 *  re-pergunta do que interromper um comando genuinamente novo. */
function looksLikeNewCommand(t: string): boolean {
  const s = t.trim();
  if (s.length > 60) return true;
  return /^(gastei|paguei|comprei|recebi|ganhei|gast[eé]|pagu[eé]|compr[eé]|recib[ií]|gan[eé]|cu[aá]nto|qu[eé]|cu[aá]l|mi saldo|extracto|mis|quanto|qual|meu saldo|extrato|minhas?|agenda|lembr|recuerda|recordatorio|ayuda|ajuda|help|crea|crear|cria|criar|agrega|a[ñn]ade|adiciona|marca)\b/i.test(s);
}

function askWithTtl(slot: SlotDef, draft: Draft, ctx: SlotCtx): string {
  const ttl = ctx.user.locale === "es"
    ? "⏱ _Válido durante 10 minutos. Responde *cancelar* para desistir._"
    : "⏱ _Válido por 10 min. Responda *cancelar* para desistir._";
  return `${slot.ask(draft, ctx)}\n\n${ttl}`;
}

function defaultReask(slot: SlotDef, draft: Draft, ctx: SlotCtx): string {
  return ctx.user.locale === "es"
    ? `❓ No entendí.\n\n${slot.ask(draft, ctx)}\n\n_O responde *cancelar* para desistir._`
    : `❓ Não entendi.\n\n${slot.ask(draft, ctx)}\n\n_Ou responda *cancelar* para deixar pra lá._`;
}

/** Aplica o fallback de cada slot restante e finaliza — usado quando o
 *  usuário desiste (excesso de tentativas ou trocou de assunto). Retorna
 *  null se algum slot restante for duro (sem fallback): nesse caso não há
 *  como criar nada. */
async function finalizeWithDefaults(flow: FlowDef, draft: Draft, queue: string[], ctx: SlotCtx): Promise<string | null> {
  const usedLabels: string[] = [];
  for (const key of queue) {
    const slot = flow.slots[key];
    if (!slot.fallback) return null;
    const value = slot.fallback(draft, ctx);
    (slot.apply ?? ((v: unknown, d: Draft) => { d[slot.key] = v; }))(value, draft, [], ctx);
    usedLabels.push(slot.label);
  }
  const base = await flow.finalize(draft, ctx);
  if (usedLabels.length === 0) return base;
  return ctx.user.locale === "es"
    ? `_No entendí tu última respuesta; usé el valor predeterminado para: ${usedLabels.join(", ")}._\n\n${base}`
    : `_Não entendi sua última resposta — usei o padrão para: ${usedLabels.join(", ")}._\n\n${base}`;
}

function reconstruct(pending: PendingSlotFill, patch: Partial<PendingSlotFill>): Parameters<typeof setPendingAction>[1] {
  return {
    type: "slot_fill",
    userId: pending.userId,
    intent: pending.intent,
    draft: pending.draft,
    missing: pending.missing,
    asked: pending.asked,
    mode: pending.mode,
    originalText: pending.originalText,
    batchDrafts: pending.batchDrafts,
    batchMissing: pending.batchMissing,
    batchIndex: pending.batchIndex,
    ...patch,
  };
}

function batchItemLabel(draft: Draft): string {
  const value = draft.title || draft.name || draft.message || draft.description
    || [draft.brand, draft.model].filter(Boolean).join(" ");
  return typeof value === "string" && value.trim() ? ` — ${value.trim()}` : "";
}

function askBatchWithTtl(slot: SlotDef, draft: Draft, ctx: SlotCtx, index: number, total: number): string {
  const prefix = ctx.user.locale === "es"
    ? `*Elemento ${index + 1} de ${total}${batchItemLabel(draft)}*`
    : `*Item ${index + 1} de ${total}${batchItemLabel(draft)}*`;
  return `${prefix}\n${askWithTtl(slot, draft, ctx)}`;
}

function joinBatchReplies(replies: string[], ctx: SlotCtx): string {
  const heading = ctx.user.locale === "es"
    ? `✅ Registré *${replies.length} elementos*.`
    : ctx.user.locale === "pt-PT"
      ? `✅ Registei *${replies.length} itens*.`
      : `✅ Registrei *${replies.length} itens*.`;
  return `${heading}\n\n${replies.map((reply, index) => `${index + 1}. ${reply}`).join("\n\n")}`;
}

/** Coleta os campos que faltam item por item e só depois grava o lote. */
export async function beginBatchSlotFill(
  intent: SlotFillIntent,
  items: AIResult[],
  ctx: SlotCtx,
  originalText: string,
): Promise<{ reply: string }> {
  if (items.length <= 1) return beginSlotFill(intent, items[0] ?? { intent, confidence: 1 }, ctx, originalText);
  const flow = FLOWS[intent];
  if (!flow) throw new Error(`[slot-filling] fluxo não implementado para intent "${intent}"`);
  const drafts = items.slice(0, 30).map(item => flow.seed(item, ctx));
  const missing = drafts.map(draft => flow.missing(draft, ctx));
  const first = missing.findIndex(queue => queue.length > 0);
  if (first < 0) {
    await clearPendingAction(ctx.phone);
    const replies = [];
    for (const draft of drafts) replies.push(await flow.finalize(draft, ctx));
    return { reply: joinBatchReplies(replies, ctx) };
  }
  await setPendingAction(ctx.phone, {
    type: "slot_fill", userId: ctx.userId, intent, draft: drafts[first], missing: missing[first],
    asked: 0, mode: ctx.mode, originalText, batchDrafts: drafts, batchMissing: missing, batchIndex: first,
  });
  return { reply: askBatchWithTtl(flow.slots[missing[first][0]], drafts[first], ctx, first, drafts.length) };
}

async function runBatchSlotFillTurn(
  pending: PendingSlotFill,
  text: string,
  ctx: SlotCtx,
): Promise<{ reply?: string; fallThrough: boolean }> {
  const flow = FLOWS[pending.intent];
  const drafts = pending.batchDrafts?.map(draft => ({ ...draft })) ?? [];
  const missing = pending.batchMissing?.map(queue => [...queue]) ?? [];
  const index = pending.batchIndex ?? 0;
  if (!flow || !drafts[index] || !missing[index]?.length) {
    await clearPendingAction(ctx.phone);
    return { fallThrough: true };
  }
  const draft = drafts[index];
  const queue = missing[index];
  const slot = flow.slots[queue[0]];
  const trimmed = text.trim();

  if (isCancelWord(trimmed)) {
    await clearPendingAction(ctx.phone);
    return { reply: ctx.user.locale === "es" ? "Cancelado; no registré ningún elemento. 👍" : "Cancelado — não registrei nenhum item. 👍", fallThrough: false };
  }

  let value: unknown;
  if (isSkipWord(trimmed) && slot.fallback) value = slot.fallback(draft, ctx);
  else {
    const parsed = slot.parse(text, draft, ctx);
    if (!parsed.ok) {
      const abandoning = looksLikeNewCommand(trimmed) || pending.asked >= MAX_ASK;
      if (abandoning) {
        await clearPendingAction(ctx.phone);
        return { reply: flow.giveUp(draft, ctx), fallThrough: looksLikeNewCommand(trimmed) };
      }
      await setPendingAction(ctx.phone, reconstruct(pending, { batchDrafts: drafts, batchMissing: missing, batchIndex: index, draft, missing: queue, asked: pending.asked + 1 }));
      const reask = slot.reask ? slot.reask(draft, ctx, pending.asked) : defaultReask(slot, draft, ctx);
      return { reply: `*${ctx.user.locale === "es" ? "Elemento" : "Item"} ${index + 1} de ${drafts.length}${batchItemLabel(draft)}*\n${reask}`, fallThrough: false };
    }
    value = parsed.value;
  }

  queue.shift();
  (slot.apply ?? ((v: unknown, d: Draft) => { d[slot.key] = v; }))(value, draft, queue, ctx);
  drafts[index] = draft;
  missing[index] = queue;

  const next = missing.findIndex((candidate, candidateIndex) => candidateIndex >= index && candidate.length > 0);
  if (next < 0) {
    await clearPendingAction(ctx.phone);
    const replies = [];
    for (const completeDraft of drafts) replies.push(await flow.finalize(completeDraft, ctx));
    return { reply: joinBatchReplies(replies, ctx), fallThrough: false };
  }

  await setPendingAction(ctx.phone, reconstruct(pending, {
    batchDrafts: drafts, batchMissing: missing, batchIndex: next,
    draft: drafts[next], missing: missing[next], asked: 0,
  }));
  return { reply: askBatchWithTtl(flow.slots[missing[next][0]], drafts[next], ctx, next, drafts.length), fallThrough: false };
}

/** Chamada pelos `case` do switch de intents. Se a mensagem já trouxer tudo
 *  que muda comportamento, cria na hora (mesmo comportamento de hoje, zero
 *  perguntas extras). Só grava um pending e pergunta se faltar algo. */
export async function beginSlotFill(
  intent: SlotFillIntent,
  ai: AIResult,
  ctx: SlotCtx,
  originalText: string
): Promise<{ reply: string }> {
  const flow = FLOWS[intent];
  if (!flow) throw new Error(`[slot-filling] fluxo não implementado para intent "${intent}"`);
  const draft = flow.seed(ai, ctx);
  const queue = flow.missing(draft, ctx);

  if (queue.length === 0) {
    await clearPendingAction(ctx.phone);
    return { reply: await flow.finalize(draft, ctx) };
  }

  await setPendingAction(ctx.phone, {
    type: "slot_fill", userId: ctx.userId, intent, draft, missing: queue, asked: 0, mode: ctx.mode, originalText,
  });
  return { reply: askWithTtl(flow.slots[queue[0]], draft, ctx) };
}

/** Chamada pela banda de pendências do message-handler quando já existe um
 *  slot_fill em andamento para esse número. */
export async function runSlotFillTurn(
  pending: PendingSlotFill,
  text: string,
  ctx: SlotCtx
): Promise<{ reply?: string; fallThrough: boolean }> {
  if (pending.batchDrafts?.length) return runBatchSlotFillTurn(pending, text, ctx);
  const flow = FLOWS[pending.intent];
  if (!flow) { await clearPendingAction(ctx.phone); return { reply: undefined, fallThrough: true }; }
  const slot = flow.slots[pending.missing[0]];
  const draft: Draft = { ...pending.draft };
  const queue = [...pending.missing];
  const trimmed = text.trim();

  if (isCancelWord(trimmed)) {
    await clearPendingAction(ctx.phone);
    return {
      reply: ctx.user.locale === "es" ? "Cancelado; no registré nada. 👍" : "Cancelado — não registrei nada. 👍",
      fallThrough: false,
    };
  }

  let value: unknown;
  if (isSkipWord(trimmed) && slot.fallback) {
    value = slot.fallback(draft, ctx);
  } else {
    const r = slot.parse(text, draft, ctx);
    if (r.ok) {
      value = r.value;
    } else {
      const abandoning = looksLikeNewCommand(trimmed) || pending.asked >= MAX_ASK;
      if (!abandoning) {
        await setPendingAction(ctx.phone, reconstruct(pending, { draft, missing: queue, asked: pending.asked + 1 }));
        return { reply: slot.reask ? slot.reask(draft, ctx, pending.asked) : defaultReask(slot, draft, ctx), fallThrough: false };
      }
      await clearPendingAction(ctx.phone);
      const result = await finalizeWithDefaults(flow, draft, queue, ctx);
      return { reply: result ?? flow.giveUp(draft, ctx), fallThrough: looksLikeNewCommand(trimmed) };
    }
  }

  queue.shift();
  (slot.apply ?? ((v: unknown, d: Draft) => { d[slot.key] = v; }))(value, draft, queue, ctx);

  if (queue.length === 0) {
    await clearPendingAction(ctx.phone);
    return { reply: await flow.finalize(draft, ctx), fallThrough: false };
  }
  await setPendingAction(ctx.phone, reconstruct(pending, { draft, missing: queue, asked: 0 }));
  return { reply: askWithTtl(flow.slots[queue[0]], draft, ctx), fallThrough: false };
}

// ── Fábricas de parser reutilizáveis por vários slots/intents ──

export function slotMoney(): SlotDef["parse"] {
  return (text) => {
    const val = parseAmountBR(text);
    return val !== null ? { ok: true, value: val } : { ok: false };
  };
}

export function slotDayOfMonth(): SlotDef["parse"] {
  return (text) => {
    const match = text.trim().match(/(\d{1,2})/);
    if (!match) return { ok: false };
    const day = parseInt(match[1], 10);
    return day >= 1 && day <= 31 ? { ok: true, value: day } : { ok: false };
  };
}

/** Número de ocorrências, ou "sempre"/"vitalício" → null (sem fim). */
export function slotCountOrForever(): SlotDef["parse"] {
  return (text) => {
    const t = text.trim().toLowerCase();
    if (/^(sempre|vital[íi]ci[oa]|sem fim|para sempre|n[ãa]o tem fim|indetermin|nunca (acaba|termina)|siempre|de por vida|sin fin|no termina)/.test(t)) {
      return { ok: true, value: null };
    }
    const match = t.match(/(\d{1,3})/);
    if (!match) return { ok: false };
    const n = parseInt(match[1], 10);
    return n >= 1 && n <= 360 ? { ok: true, value: n } : { ok: false };
  };
}

/** Texto livre, com tamanho mínimo — usado pra título/nome quando a IA não
 *  conseguiu extrair nada da mensagem original. */
export function slotText(min = 2): SlotDef["parse"] {
  return (text) => {
    const t = text.trim();
    return t.length >= min ? { ok: true, value: t } : { ok: false };
  };
}

/** Data em YYYY-MM-DD a partir de "hoje", "amanhã", "DD/MM" ou "DD/MM/AAAA". */
export function slotDate(): SlotDef["parse"] {
  return (text) => {
    const t = text.trim().toLowerCase();
    const today = todayStrBR();
    if (/^(hoje|hoy)$/.test(t)) return { ok: true, value: today };
    if (/^(amanh[ãa]|ma[ñn]ana)$/.test(t)) {
      const d = new Date(today + "T12:00:00-03:00");
      d.setDate(d.getDate() + 1);
      return { ok: true, value: d.toISOString().slice(0, 10) };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: true, value: t };
    const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/);
    if (m) {
      const day = m[1].padStart(2, "0");
      const mon = m[2].padStart(2, "0");
      const year = m[3] || today.slice(0, 4);
      return { ok: true, value: `${year}-${mon}-${day}` };
    }
    return { ok: false };
  };
}

/** Horário em HH:MM a partir de "14h", "14:30", "9h30", "às 9". */
export function slotTime(): SlotDef["parse"] {
  return (text) => {
    const t = text.trim().toLowerCase();
    const m = t.match(/(\d{1,2})[:h](\d{2})?/);
    if (!m) return { ok: false };
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2] || "0", 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return { ok: false };
    return { ok: true, value: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
  };
}

export function parseReminderTimeAnswer(text: string): string | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const match = normalized.match(/\b(?:as|a\s+las)\s+(\d{1,2})(?::(\d{2}))?\b/)
    ?? normalized.match(/\b(\d{1,2})h(?:(\d{2}))?\b/)
    ?? normalized.match(/\b(\d{1,2}):(\d{2})\b/)
    ?? normalized.match(/^(\d{1,2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function shiftYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validYmd(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return value.toISOString().slice(0, 10);
}

export function parseReminderDateAnswer(text: string, today = todayStrBR()): { date: string; time?: string } | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  let date: string | null = null;
  if (/\b(amanha|manana)\b/.test(normalized)) date = shiftYmd(today, 1);
  else if (/\b(hoje|hoy)\b/.test(normalized)) date = today;
  else {
    const iso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    const short = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
    if (iso) date = validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    else if (short) {
      const rawYear = short[3] ? Number(short[3]) : Number(today.slice(0, 4));
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      date = validYmd(year, Number(short[2]), Number(short[1]));
    } else {
      const monthNumbers: Record<string, number> = {
        janeiro: 1, enero: 1, fevereiro: 2, febrero: 2, marco: 3, marzo: 3,
        abril: 4, maio: 5, mayo: 5, junho: 6, junio: 6, julho: 7, julio: 7,
        agosto: 8, setembro: 9, septiembre: 9, outubro: 10, octubre: 10,
        novembro: 11, noviembre: 11, dezembro: 12, diciembre: 12,
      };
      const namedDate = normalized.match(/\b(?:dia\s+|el\s+dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(20\d{2}))?\b/);
      const dayOnly = normalized.match(/\b(?:dia|el\s+dia)\s+(\d{1,2})\b/);
      if (namedDate && monthNumbers[namedDate[2]]) {
        date = validYmd(Number(namedDate[3] || today.slice(0, 4)), monthNumbers[namedDate[2]], Number(namedDate[1]));
      } else if (dayOnly) {
        const [year, month] = today.split("-").map(Number);
        date = validYmd(year, month, Number(dayOnly[1]));
        if (date && date < today) {
          const nextMonth = new Date(Date.UTC(year, month, 1));
          date = validYmd(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, Number(dayOnly[1]));
        }
      }
      if (date) {
        const time = parseReminderTimeAnswer(text) ?? undefined;
        return { date, ...(time ? { time } : {}) };
      }
      const weekdays: Record<string, number> = {
        domingo: 0, segunda: 1, lunes: 1, terca: 2, martes: 2, quarta: 3, miercoles: 3,
        quinta: 4, jueves: 4, sexta: 5, viernes: 5, sabado: 6,
      };
      const weekday = Object.entries(weekdays).find(([name]) => new RegExp(`\\b${name}(?:-feira)?\\b`).test(normalized));
      if (weekday) {
        const base = new Date(`${today}T12:00:00Z`);
        const days = (weekday[1] - base.getUTCDay() + 7) % 7 || 7;
        date = shiftYmd(today, days);
      }
    }
  }
  if (!date) return null;
  const time = parseReminderTimeAnswer(text) ?? undefined;
  return { date, ...(time ? { time } : {}) };
}

// ── Fluxos ──

// Preenchido progressivamente por fase — apenas os intents já migrados para
// o motor têm entrada aqui. Ver beginSlotFill/runSlotFillTurn para o que
// acontece quando um intent ainda não tem fluxo (não deve ser chamado).
export const FLOWS: Partial<Record<SlotFillIntent, FlowDef>> = {
  reminder_set: {
    seed(ai, ctx) {
      const reminder = ai.reminder;
      const scheduledAt = reminder?.scheduledAt;
      return {
        message: reminder?.message?.trim() ?? "",
        startDate: scheduledAt?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1],
        startTime: scheduledAt?.match(/T(\d{2}:\d{2})/)?.[1],
        repeat: reminder?.repeat ?? "none",
        mode: reminder?.mode ?? ctx.mode,
        recipientName: reminder?.recipientName,
        recipientPhone: reminder?.recipientPhone?.replace(/\D/g, ""),
      } satisfies Draft;
    },

    missing(draft) {
      const queue: string[] = [];
      if (!draft.message) queue.push("message");
      if (!draft.startDate) queue.push("startDate");
      if (!draft.startTime) queue.push("startTime");
      return queue;
    },

    slots: {
      message: {
        key: "message",
        label: "conteúdo do lembrete",
        parse: slotText(2),
        ask: (_draft, ctx) => ctx.user.locale === "es"
          ? "🔔 ¿Qué quieres que te recuerde?"
          : "🔔 O que você quer que eu lembre?",
      },
      startDate: {
        key: "startDate",
        label: "data",
        parse: (text) => {
          const parsed = parseReminderDateAnswer(text);
          return parsed ? { ok: true, value: parsed } : { ok: false };
        },
        ask: (draft, ctx) => {
          const reminder = String(draft.message || "");
          const preview = reminder ? `${reminder}\n\n` : "";
          return ctx.user.locale === "es"
            ? `${preview}📅 ¿Qué día y a qué hora quieres que te avise? _(ej.: “mañana a las 9”)_`
            : `${preview}📅 Em qual dia e horário você quer que eu avise? _(ex.: “amanhã às 9”)_`;
        },
        apply: (value, draft, queue) => {
          const parsed = value as { date: string; time?: string };
          draft.startDate = parsed.date;
          if (parsed.time) {
            draft.startTime = parsed.time;
            const timeIndex = queue.indexOf("startTime");
            if (timeIndex >= 0) queue.splice(timeIndex, 1);
          }
        },
      },
      startTime: {
        key: "startTime",
        label: "horário",
        parse: (text) => {
          const parsed = parseReminderTimeAnswer(text);
          return parsed ? { ok: true, value: parsed } : { ok: false };
        },
        ask: (_draft, ctx) => ctx.user.locale === "es"
          ? "🕒 ¿A qué hora? _(ej.: “9:00”)_"
          : "🕒 Que horas? _(ex.: “9h” ou “14:30”)_",
      },
      recipientPhone: {
        key: "recipientPhone",
        label: "telefone de quem receberá",
        parse: (text) => {
          const phone = text.replace(/\D/g, "");
          return phone.length >= 8 ? { ok: true, value: phone } : { ok: false };
        },
        ask: (draft, ctx) => ctx.user.locale === "es"
          ? `📱 ¿Cuál es el número de WhatsApp de ${draft.recipientName || "esa persona"}, con código de país?`
          : `📱 Qual é o WhatsApp de ${draft.recipientName || "essa pessoa"}, com DDD/DDI?`,
      },
    },

    async finalize(draft, ctx) {
      let targetPhone = ctx.phone;
      let recipientType: "self" | "customer" | "employee" | "other" = "self";
      let recipientName = draft.recipientName as string | undefined;
      const explicitPhone = String(draft.recipientPhone || "").replace(/\D/g, "");

      if (explicitPhone.length >= 8) {
        targetPhone = explicitPhone;
        recipientType = "other";
      } else if (recipientName) {
        const customer = await findCustomerByName(ctx.userId, recipientName);
        const employee = await findEmployeeByName(ctx.userId, recipientName);
        const linkedPhone = await findPhoneByName(ctx.userId, recipientName);
        if (customer?.phone) {
          targetPhone = customer.phone; recipientType = "customer"; recipientName = customer.name;
        } else if (employee?.phone) {
          targetPhone = employee.phone; recipientType = "employee"; recipientName = employee.name;
        } else if (linkedPhone) {
          targetPhone = linkedPhone; recipientType = "other";
        } else {
          await setPendingAction(ctx.phone, {
            type: "slot_fill", userId: ctx.userId, intent: "reminder_set", draft,
            missing: ["recipientPhone"], asked: 0, mode: ctx.mode, originalText: String(draft.message || ""),
          });
          return ctx.user.locale === "es"
            ? `No encontré a *${recipientName}* con un teléfono registrado. ¿Cuál es su número de WhatsApp, con código de país?`
            : `Não encontrei *${recipientName}* com telefone cadastrado. Qual é o WhatsApp dessa pessoa, com DDD/DDI?`;
        }
      } else {
        const incomingVariants = new Set(phoneVariants(ctx.phone));
        const requester = (await getPhonesForUser(ctx.userId)).find(link =>
          phoneVariants(link.phone).some(value => incomingVariants.has(value))
        );
        recipientName = requester?.name || requester?.relation;
      }

      const scheduledAt = spToUTC(`${draft.startDate}T${draft.startTime}:00`);
      const repeat = (draft.repeat as "none" | "daily" | "weekly" | "monthly") || "none";
      const reminder = await createReminder({
        userId: ctx.userId,
        message: cap(String(draft.message)),
        phone: targetPhone,
        scheduledAt,
        repeat,
        mode: (draft.mode as "personal" | "business") || ctx.mode,
        recipientType,
        recipientName,
      });
      return replyReminderSet(reminder.message, reminder.scheduledAt, reminder.repeat, recipientType === "self" ? undefined : recipientName, ctx.user.locale);
    },

    giveUp: (_draft, ctx) => ctx.user.locale === "es"
      ? "No pude programar el recordatorio porque faltó el contenido, el día o la hora."
      : "Não consegui programar o lembrete porque faltou o conteúdo, o dia ou o horário.",
  },

  recurring_create: {
    seed(ai, ctx) {
      const r = ai.recurring;
      return {
        type: r?.type,
        description: r?.description ? cap(r.description) : "",
        amount: r?.amount,
        totalAmount: r?.totalAmount,
        category: r?.category,
        recurrenceType: r?.recurrenceType ?? "recurring",
        repeatUnit: r?.repeatUnit ?? "monthly",
        dayOfMonth: r?.dayOfMonth,
        startDate: r?.startDate,
        totalInstallments: r?.totalInstallments,
        lifetime: r?.lifetime ?? false,
        mode: r?.mode ?? ctx.mode,
      } satisfies Draft;
    },

    missing(draft) {
      const q: string[] = [];
      if (draft.type !== "income" && draft.type !== "expense") q.push("type");
      if (!draft.description) q.push("description");
      if (!(typeof draft.amount === "number" && draft.amount > 0)) q.push("amount");
      if (draft.recurrenceType === "installment") {
        if (!draft.totalInstallments) q.push("totalInstallments");
      } else if (draft.totalInstallments === undefined && draft.lifetime !== true) {
        q.push("term");
      }
      if (draft.repeatUnit === "monthly" && !draft.dayOfMonth) q.push("dayOfMonth");
      return q;
    },

    slots: {
      type: {
        key: "type",
        label: "tipo",
        parse: (text) => {
          const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          if (/\b(receita|receber|entrada|ingreso|cobrar)\b/.test(normalized)) return { ok: true, value: "income" };
          if (/\b(despesa|gasto|pagar|saida)\b/.test(normalized)) return { ok: true, value: "expense" };
          return { ok: false };
        },
        ask: (_draft, ctx) => localized(ctx, "💰 É uma despesa ou uma receita recorrente?", "💰 ¿Es un gasto o un ingreso recurrente?"),
      },
      description: {
        key: "description",
        label: "descrição",
        parse: slotText(2),
        ask: (_draft, ctx) => localized(ctx, "📝 Qual é a descrição?", "📝 ¿Cuál es la descripción?"),
        apply: (value, draft) => { draft.description = cap(String(value)); },
      },
      amount: {
        key: "amount",
        label: "valor",
        parse: slotMoney(),
        ask: (_draft, ctx) => localized(ctx, "💰 Qual o valor?", "💰 ¿Cuál es el importe?"),
        // sem fallback — slot duro, nada pode ser criado sem valor
      },
      totalInstallments: {
        key: "totalInstallments",
        label: "número de parcelas",
        parse: slotCountOrForever(),
        ask: (_draft, ctx) => localized(ctx, "💳 Em quantas vezes? _(ex: \"10\")_", "💳 ¿En cuántas cuotas? _(ej.: \"10\")_"),
        fallback: () => 1, // sem resposta, assume compra à vista (1 parcela) — encerra sozinho, não fica perpétuo por engano
      },
      term: {
        key: "totalInstallments",
        label: "duração",
        parse: slotCountOrForever(),
        ask: (_draft, ctx) => localized(ctx,
          "🔁 Por quanto tempo? Responda o número de meses (ex: *12*) — ou *sempre*, se não tiver fim.",
          "🔁 ¿Durante cuánto tiempo? Responde el número de meses (ej.: *12*) o *siempre* si no tiene fin."),
        fallback: () => null, // sem resposta, mantém o comportamento de hoje: perpétuo
        apply: (value, draft) => { if (value !== null) draft.totalInstallments = value; },
      },
      dayOfMonth: {
        key: "dayOfMonth",
        label: "dia do vencimento",
        parse: slotDayOfMonth(),
        ask: (_draft, ctx) => localized(ctx, "📅 Todo dia quantos vence? _(ex: \"10\")_", "📅 ¿Qué día de cada mes vence? _(ej.: \"10\")_"),
        fallback: () => 1, // 1º do mês — evita o vencimento cair "hoje" na maioria dos casos
      },
    },

    async finalize(draft, ctx) {
      const type = draft.type as "income" | "expense";
      const amount = draft.amount as number;
      const recurrenceType = draft.recurrenceType as "installment" | "recurring";
      const totalInstallments = draft.totalInstallments as number | undefined;
      const totalAmount = recurrenceType === "installment" && totalInstallments
        ? (draft.totalAmount as number | undefined) ?? amount * totalInstallments
        : (draft.totalAmount as number | undefined);

      const rec = await createRecurring({
        userId: ctx.userId,
        type,
        amount,
        totalAmount,
        category: (draft.category as string) || "Outros",
        description: (draft.description as string) || "Recorrente",
        mode: (draft.mode as "personal" | "business") || ctx.mode,
        recurrenceType,
        totalInstallments,
        repeatUnit: (draft.repeatUnit as RecurringTransaction["repeatUnit"]) || "monthly",
        dayOfMonth: draft.dayOfMonth as number | undefined,
        startDate: (draft.startDate as string) || todayStrBR(),
        source: "whatsapp",
      });
      return replyRecurringCreated(rec, ctx.user.locale);
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui cadastrar — faltou o tipo, a descrição ou o valor. Tente de novo, ex: _\"academia 100 por mês\"_.",
      "❌ No pude registrarlo porque faltó el tipo, la descripción o el importe. Inténtalo de nuevo, ej.: _\"gimnasio 100 al mes\"_."),
  },

  goal_create: {
    seed(ai, ctx) {
      const g = ai.goal;
      return {
        title: g?.title ? cap(g.title.trim()) : "",
        targetAmount: g?.targetAmount && g.targetAmount > 0 ? g.targetAmount : undefined,
        currentAmount: g?.currentAmount ?? 0,
        deadline: g?.deadline,
        category: g?.category,
        mode: g?.mode ?? ctx.mode,
      } satisfies Draft;
    },

    missing(draft) {
      const q: string[] = [];
      if (!draft.title) q.push("title");
      if (!(typeof draft.targetAmount === "number" && draft.targetAmount > 0)) q.push("targetAmount");
      return q;
    },

    slots: {
      title: {
        key: "title",
        label: "nome",
        parse: slotText(2),
        ask: (_draft, ctx) => localized(ctx, "🎯 Qual o nome da meta?", "🎯 ¿Cuál es el nombre de la meta?"),
        // sem fallback — slot duro, um título vazio quebra a listagem de metas
      },
      targetAmount: {
        key: "targetAmount",
        label: "valor alvo",
        parse: slotMoney(),
        ask: (_draft, ctx) => localized(ctx, "💰 Qual o valor alvo?", "💰 ¿Cuál es el importe objetivo?"),
        // sem fallback — slot duro
      },
    },

    async finalize(draft, ctx) {
      const goal = await createGoal({
        userId: ctx.userId,
        title: draft.title as string,
        targetAmount: draft.targetAmount as number,
        currentAmount: (draft.currentAmount as number) || 0,
        deadline: draft.deadline as string | undefined,
        category: (draft.category as string) || "Geral",
        mode: (draft.mode as "personal" | "business") || ctx.mode,
        status: "active",
      });
      const pct = getGoalProgress(goal);
      return replyGoalCreated(goal, pct, ctx.user.locale);
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui criar a meta — faltou o nome ou o valor. Tente de novo, ex: _\"quero guardar 3000 para viagem\"_.",
      "❌ No pude crear la meta porque faltó el nombre o el importe. Inténtalo de nuevo, ej.: _\"quiero ahorrar 3000 para un viaje\"_."),
  },

  agenda_create: {
    seed(ai) {
      const d = ai.agendaData;
      return {
        title: d?.title ? cap(d.title.trim()) : "",
        description: d?.description,
        location: d?.location,
        startDate: d?.startDate,
        startTime: d?.startTime,
        endDate: d?.endDate,
        endTime: d?.endTime,
        allDay: d?.allDay ?? false,
        repeat: d?.repeat ?? "none",
        reminderMinutesBefore: d?.reminderMinutesBefore,
      } satisfies Draft;
    },

    missing(draft) {
      const q: string[] = [];
      if (!draft.title) q.push("title");
      if (!draft.startDate) q.push("startDate");
      if (!draft.startTime && !draft.allDay) q.push("startTime");
      return q;
    },

    slots: {
      title: {
        key: "title",
        label: "título",
        parse: slotText(2),
        ask: (_draft, ctx) => localized(ctx, "🗓️ Qual o título do compromisso?", "🗓️ ¿Cuál es el título de la cita?"),
        // sem fallback — slot duro
      },
      startDate: {
        key: "startDate",
        label: "data",
        parse: (text) => {
          const parsed = parseReminderDateAnswer(text);
          return parsed ? { ok: true, value: parsed } : { ok: false };
        },
        ask: (_draft, ctx) => localized(ctx, "📅 Para quando? _(ex: \"amanhã\", \"15/08\")_", "📅 ¿Para qué día? _(ej.: \"mañana\", \"15/08\")_"),
        apply: (value, draft, queue) => {
          const parsed = value as { date: string; time?: string };
          draft.startDate = parsed.date;
          if (parsed.time) {
            draft.startTime = parsed.time;
            const timeIndex = queue.indexOf("startTime");
            if (timeIndex >= 0) queue.splice(timeIndex, 1);
          }
        },
        // sem fallback — slot duro
      },
      startTime: {
        key: "startTime",
        label: "horário",
        parse: (text) => {
          if (/^(dia todo|todo el d[ií]a)$/i.test(text.trim())) return { ok: true, value: "ALLDAY" };
          const parsed = parseReminderTimeAnswer(text);
          return parsed ? { ok: true, value: parsed } : { ok: false };
        },
        ask: (_draft, ctx) => localized(ctx, "🕒 Que horas? _(ou responda *dia todo*)_", "🕒 ¿A qué hora? _(o responde *todo el día*)_"),
        fallback: () => "ALLDAY", // sem resposta clara, vira evento de dia inteiro em vez de meia-noite
        apply: (value, draft) => {
          if (value === "ALLDAY") draft.allDay = true;
          else draft.startTime = value;
        },
      },
    },

    async finalize(draft, ctx) {
      const startTime = draft.allDay ? "00:00" : (draft.startTime as string) || "00:00";
      const startAt = spToUTC(`${draft.startDate}T${startTime}:00`);
      const endAt = draft.endDate ? spToUTC(`${draft.endDate}T${(draft.endTime as string) || "00:00"}:00`) : undefined;
      const apt = await createAppointment({
        userId: ctx.userId,
        title: draft.title as string,
        description: draft.description as string | undefined,
        location: draft.location as string | undefined,
        startAt,
        endAt,
        allDay: (draft.allDay as boolean) ?? false,
        repeat: (draft.repeat as "none" | "daily" | "weekly" | "monthly" | "yearly") ?? "none",
        status: "scheduled",
        source: "whatsapp",
      });
      let reply = replyAgendaCreated(apt, ctx.user.locale);
      const reminderMinutesBefore = draft.reminderMinutesBefore as number | undefined;
      if (reminderMinutesBefore && reminderMinutesBefore > 0) {
        const scheduledAt = appointmentReminderAt(apt.startAt, reminderMinutesBefore);
        if (new Date(scheduledAt).getTime() > Date.now()) {
          await createReminder({
            userId: ctx.userId,
            message: `Compromisso: ${apt.title}`,
            phone: ctx.phone,
            scheduledAt,
            repeat: "none",
            mode: ctx.mode,
            recipientType: "self",
          });
          reply += localized(ctx,
            `\n🔔 Vou avisar ${formatReminderOffset(reminderMinutesBefore)} antes.`,
            `\n🔔 Te avisaré ${formatReminderOffset(reminderMinutesBefore)} antes.`);
        } else {
          reply += localized(ctx,
            "\n⚠️ O horário pedido para o lembrete já passou, então não consegui programar o aviso.",
            "\n⚠️ La hora solicitada para el recordatorio ya pasó, por eso no pude programarlo.");
        }
      }
      return reply;
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui agendar — faltou o título ou a data. Tente de novo, ex: _\"agendar reunião amanhã às 14h\"_.",
      "❌ No pude programar la cita porque faltó el título o la fecha. Inténtalo de nuevo, ej.: _\"programar reunión mañana a las 14\"_."),
  },

  vehicle_create: {
    seed(ai, ctx) {
      const v = ai.vehicle;
      return {
        brand: v?.brand ? cap(v.brand.trim()) : "",
        model: v?.model ? cap(v.model.trim()) : "",
        year: v?.year,
        plate: v?.plate?.replace(/[^a-z0-9]/gi, "").toUpperCase(),
        fuelType: v?.fuelType,
        currentKm: v?.currentKm,
        notes: v?.notes,
        mode: v?.mode ?? ctx.mode,
      } satisfies Draft;
    },

    missing(draft) {
      const q: string[] = [];
      if (!draft.brand) q.push("brand");
      if (!draft.model) q.push("model");
      if (!(typeof draft.year === "number" && draft.year >= 1886)) q.push("year");
      return q;
    },

    slots: {
      brand: {
        key: "brand", label: "marca", parse: slotText(2),
        ask: (_draft, ctx) => localized(ctx, "🚗 Qual é a marca do veículo? _(ex: Volkswagen, Honda)_", "🚗 ¿Cuál es la marca del vehículo? _(ej.: Volkswagen, Honda)_"),
      },
      model: {
        key: "model", label: "modelo", parse: slotText(1),
        ask: (_draft, ctx) => localized(ctx, "🚘 Qual é o modelo? _(ex: Gol, Civic)_", "🚘 ¿Cuál es el modelo? _(ej.: Gol, Civic)_"),
      },
      year: {
        key: "year", label: "ano",
        parse: (text) => {
          const match = text.match(/\b((?:19|20)\d{2})\b/);
          if (!match) return { ok: false };
          const year = Number(match[1]);
          return year >= 1886 && year <= new Date().getFullYear() + 1
            ? { ok: true, value: year }
            : { ok: false };
        },
        ask: (_draft, ctx) => localized(ctx, "📅 Qual é o ano do veículo? _(ex: 2020)_", "📅 ¿Cuál es el año del vehículo? _(ej.: 2020)_"),
      },
    },

    async finalize(draft, ctx) {
      const vehicle = await createVehicle({
        userId: ctx.userId,
        brand: cap(draft.brand as string),
        model: cap(draft.model as string),
        year: draft.year as number,
        plate: (draft.plate as string) || "",
        fuelType: (draft.fuelType as FuelType) || "flex",
        currentKm: typeof draft.currentKm === "number" ? draft.currentKm : 0,
        notes: (draft.notes as string) || "",
        mode: (draft.mode as "personal" | "business") || ctx.mode,
      });
      if (ctx.user.locale === "es") {
        const fuelLabels: Record<FuelType, string> = { gasoline: "Gasolina", ethanol: "Etanol", diesel: "Diésel", electric: "Eléctrico", flex: "Flex" };
        return `✅ *¡Vehículo registrado!*

🚗 ${vehicle.brand} ${vehicle.model} (${vehicle.year})
🔖 Matrícula: ${vehicle.plate || "no informada"}
⛽ Combustible: ${fuelLabels[vehicle.fuelType]}
🛣️ Kilometraje actual: ${vehicle.currentKm.toLocaleString("es-419")} km
${vehicle.mode === "business" ? "🏢 Empresa" : "👤 Personal"}`;
      }
      return `✅ *Veículo cadastrado!*

🚗 ${vehicle.brand} ${vehicle.model} (${vehicle.year})
🔖 Placa: ${vehicle.plate || "não informada"}
⛽ Combustível: ${FUEL_TYPE_LABEL[vehicle.fuelType]}
🛣️ Km atual: ${vehicle.currentKm.toLocaleString("pt-BR")}
${vehicle.mode === "business" ? "🏢 Empresa" : "👤 Pessoal"}`;
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui cadastrar o veículo — faltaram marca, modelo ou ano. Tente de novo, ex: _\"cadastre um Volkswagen Gol 2020\"_.",
      "❌ No pude registrar el vehículo porque faltó la marca, el modelo o el año. Inténtalo de nuevo, ej.: _\"registra un Volkswagen Gol 2020\"_."),
  },

  grocery_purchase: {
    seed(ai) {
      const g = ai.grocery;
      return {
        storeName: g?.storeName,
        date: g?.date,
        items: g?.items?.length ? g.items.map(i => ({
          productName: cap(i.productName), category: i.category ?? "Outros",
          price: i.price ?? 0, quantity: i.quantity ?? 1, unit: i.unit ?? "un",
        })) : undefined,
      } satisfies Draft;
    },

    missing(draft) {
      const q: string[] = [];
      if (!draft.storeName) q.push("storeName");
      if (!Array.isArray(draft.items) || draft.items.length === 0) q.push("items");
      return q;
    },

    slots: {
      storeName: {
        key: "storeName",
        label: "mercado",
        parse: slotText(1),
        ask: (_draft, ctx) => localized(ctx, "🏪 Em qual mercado foi a compra?", "🏪 ¿En qué supermercado hiciste la compra?"),
        fallback: (_draft, ctx) => localized(ctx, "Não informado", "No informado"),
      },
      items: {
        key: "items",
        label: "itens",
        parse: (text) => {
          const items = parseGroceryItemsText(text);
          return items ? { ok: true, value: items } : { ok: false };
        },
        ask: (_draft, ctx) => localized(ctx, "🧾 Quais itens? _(ex: \"arroz 25, feijão 8, leite 6\")_", "🧾 ¿Qué artículos? _(ej.: \"arroz 25, frijoles 8, leche 6\")_"),
        // sem fallback — slot duro, compra sem item nenhum não faz sentido
      },
    },

    async finalize(draft, ctx) {
      const items = draft.items as GroceryPurchaseItem[];
      const store = await findOrCreateStore(ctx.userId, (draft.storeName as string) || "Não informado");
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const purchaseDate = (draft.date as string) || todayStrBR();
      const purchase = await addPurchase({
        userId: ctx.userId,
        storeId: store.id,
        storeName: store.name,
        date: purchaseDate,
        items,
        total,
        source: "whatsapp_text",
      });
      // Compra registrava no histórico do Supermercado mas nunca aparecia em
      // Finanças — mesmo gap já corrigido em finalizePurchaseFromChecked e no
      // fluxo de foto de cupom fiscal, faltava só aqui (compra completa via
      // texto, "comprei no Assaí: arroz 25...").
      if (total > 0) {
        const finance = await addFinance({
          userId: ctx.userId, type: "expense", amount: total, category: "Alimentação",
          description: `Compra no ${store.name}`, date: purchaseDate, mode: ctx.mode, source: "whatsapp", registeredBy: ctx.phone,
        });
        await setPurchaseFinanceId(purchase.id, ctx.userId, finance.id);
      }
      return replyGroceryPurchaseSaved(purchase, ctx.user.locale);
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui registrar a compra — faltaram os itens. Tente de novo, ex: _\"comprei no Assaí: arroz 25, feijão 8\"_.",
      "❌ No pude registrar la compra porque faltaron los artículos. Inténtalo de nuevo, ej.: _\"compré en Carrefour: arroz 25, frijoles 8\"_."),
  },

  grocery_purchase_finish: {
    seed(ai) {
      const g = ai.grocery;
      return { storeName: g?.storeName, total: g?.total } satisfies Draft;
    },

    missing(draft) {
      const q: string[] = [];
      if (!draft.storeName) q.push("storeName");
      if (!draft.total) q.push("total");
      return q;
    },

    slots: {
      storeName: {
        key: "storeName",
        label: "mercado",
        parse: slotText(1),
        ask: (_draft, ctx) => localized(ctx, "🏪 Em qual mercado foi a compra?", "🏪 ¿En qué supermercado hiciste la compra?"),
      },
      total: {
        key: "total",
        label: "total",
        parse: (text) => {
          const amount = parseAmountBR(text);
          return amount !== null ? { ok: true, value: amount } : { ok: false };
        },
        ask: (_draft, ctx) => localized(ctx, "💰 Quanto você pagou no total?", "💰 ¿Cuánto pagaste en total?"),
      },
    },

    async finalize(draft, ctx) {
      const result = await finalizePurchaseFromChecked(
        ctx.userId, ctx.mode, draft.storeName as string, draft.total as number, ctx.phone,
      );
      if (!result) return localized(ctx,
        "❓ Sua lista de compras não tem nenhum item marcado. Marca o que você já comprou (ex: _\"comprei o arroz\"_) e chama de novo.",
        "❓ Tu lista de compras no tiene ningún artículo marcado. Marca lo que ya compraste (ej.: _\"compré el arroz\"_) y vuelve a intentarlo.");
      return replyGroceryPurchaseFinished(result.purchase, ctx.user.locale);
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui fechar a compra — faltou o mercado ou o valor. Tente de novo, ex: _\"finalizei a compra no Assaí, foi 120 reais\"_.",
      "❌ No pude finalizar la compra porque faltó el supermercado o el importe. Inténtalo de nuevo, ej.: _\"terminé la compra en Carrefour, fueron 120\"_."),
  },

  employee_create: {
    seed(ai) {
      const e = ai.employee;
      return {
        name: e?.name ? cap(e.name.trim()) : "",
        role: e?.role,
        salary: e?.salary && e.salary > 0 ? e.salary : undefined,
        startDate: e?.startDate,
        phone: e?.phone,
        email: e?.email,
      } satisfies Draft;
    },

    missing(draft) {
      const q: string[] = [];
      if (!draft.name) q.push("name");
      if (!(typeof draft.salary === "number" && draft.salary > 0)) q.push("salary");
      return q;
    },

    slots: {
      name: {
        key: "name",
        label: "nome",
        parse: slotText(2),
        ask: (_draft, ctx) => localized(ctx, "👤 Qual o nome do funcionário?", "👤 ¿Cuál es el nombre del empleado?"),
        // sem fallback — slot duro
      },
      salary: {
        key: "salary",
        label: "salário",
        parse: slotMoney(),
        ask: (_draft, ctx) => localized(ctx, "💰 Qual o salário?", "💰 ¿Cuál es el salario?"),
        // sem fallback — slot duro, corromperia o cálculo de folha
      },
    },

    async finalize(draft, ctx) {
      const employee = await createEmployee({
        userId: ctx.userId,
        name: draft.name as string,
        role: (draft.role as string) || (ctx.user.locale === "es" ? "Empleado" : "Funcionário"),
        salary: draft.salary as number,
        startDate: (draft.startDate as string) || todayStrBR(),
        status: "active",
        phone: draft.phone as string | undefined,
        email: draft.email as string | undefined,
      });
      return replyEmployeeCreated(employee, ctx.user.locale);
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui cadastrar — faltou o nome ou o salário. Tente de novo, ex: _\"cadastra a Ana como vendedora, 2000\"_.",
      "❌ No pude registrar al empleado porque faltó el nombre o el salario. Inténtalo de nuevo, ej.: _\"registra a Ana como vendedora, 2000\"_."),
  },

  customer_create: {
    seed(ai) {
      const c = ai.customer;
      return {
        name: c?.name ? cap(c.name.trim()) : "",
        phone: c?.phone,
        email: c?.email,
        company: c?.company,
        notes: c?.notes,
      } satisfies Draft;
    },

    missing(draft) {
      return draft.name ? [] : ["name"];
    },

    slots: {
      name: {
        key: "name",
        label: "nome",
        parse: slotText(2),
        ask: (_draft, ctx) => localized(ctx, "🧾 Qual o nome do cliente?", "🧾 ¿Cuál es el nombre del cliente?"),
        // sem fallback — slot duro
      },
    },

    async finalize(draft, ctx) {
      const customer = await createCustomer({
        userId: ctx.userId,
        name: draft.name as string,
        phone: draft.phone as string | undefined,
        email: draft.email as string | undefined,
        company: draft.company as string | undefined,
        notes: draft.notes as string | undefined,
        status: "active",
      });
      return replyCustomerCreated(customer, ctx.user.locale);
    },

    giveUp: (_draft, ctx) => localized(ctx,
      "❌ Não consegui cadastrar — faltou o nome. Tente de novo, ex: _\"cadastra o cliente Pedro\"_.",
      "❌ No pude registrar al cliente porque faltó el nombre. Inténtalo de nuevo, ej.: _\"registra al cliente Pedro\"_."),
  },
};

/** Informa ao handler se uma intent especializada realmente precisa fazer
 * perguntas. Usado para não deixar a barreira de baixa confiança bloquear o
 * fluxo que justamente serve para coletar os dados ausentes. */
export function hasMissingSlotFields(ai: AIResult, ctx: SlotCtx): boolean {
  const flow = FLOWS[ai.intent as SlotFillIntent];
  if (!flow) return false;
  const draft = flow.seed(ai, ctx);
  return flow.missing(draft, ctx).length > 0;
}
