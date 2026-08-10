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
import { todayStrBR, spToUTC } from "./date-br";
import { findOrCreateStore, addPurchase, finalizePurchaseFromChecked, type GroceryPurchaseItem } from "./grocery";
import { createEmployee } from "./employees";
import { createCustomer } from "./customers";
import {
  replyRecurringCreated, replyAgendaCreated, replyGroceryPurchaseSaved, replyGroceryPurchaseFinished, replyEmployeeCreated, replyCustomerCreated,
} from "./bot-replies";
import { formatCurrency } from "./finances";

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

const CANCEL_RE = /^(cancela(r)?|deixa( pra l[áa])?|esquece|para|sair|nada|desisto|n[ãa]o quero)\b/i;
const SKIP_RE = /^(tanto faz|pode ser|voc[êe] escolhe|padr[ãa]o|qualquer|sei l[áa]|como quiser)\b/i;

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
  return /^(gastei|paguei|comprei|recebi|ganhei|quanto|qual|meu saldo|extrato|minhas?|agenda|lembr|ajuda|help|cria|criar|adiciona|marca)\b/i.test(s);
}

function askWithTtl(slot: SlotDef, draft: Draft, ctx: SlotCtx): string {
  return `${slot.ask(draft, ctx)}\n\n⏱ _Válido por 10 min. Responda *cancelar* para desistir._`;
}

function defaultReask(slot: SlotDef, draft: Draft, ctx: SlotCtx): string {
  return `❓ Não entendi.\n\n${slot.ask(draft, ctx)}\n\n_Ou responda *cancelar* para deixar pra lá._`;
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
  return `_Não entendi sua última resposta — usei o padrão para: ${usedLabels.join(", ")}._\n\n${base}`;
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
    ...patch,
  };
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
    clearPendingAction(ctx.phone);
    return { reply: await flow.finalize(draft, ctx) };
  }

  setPendingAction(ctx.phone, {
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
  const flow = FLOWS[pending.intent];
  if (!flow) { clearPendingAction(ctx.phone); return { reply: undefined, fallThrough: true }; }
  const slot = flow.slots[pending.missing[0]];
  const draft: Draft = { ...pending.draft };
  const queue = [...pending.missing];
  const trimmed = text.trim();

  if (isCancelWord(trimmed)) {
    clearPendingAction(ctx.phone);
    return { reply: "Cancelado — não registrei nada. 👍", fallThrough: false };
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
        setPendingAction(ctx.phone, reconstruct(pending, { draft, missing: queue, asked: pending.asked + 1 }));
        return { reply: slot.reask ? slot.reask(draft, ctx, pending.asked) : defaultReask(slot, draft, ctx), fallThrough: false };
      }
      clearPendingAction(ctx.phone);
      const result = await finalizeWithDefaults(flow, draft, queue, ctx);
      return { reply: result ?? flow.giveUp(draft, ctx), fallThrough: looksLikeNewCommand(trimmed) };
    }
  }

  queue.shift();
  (slot.apply ?? ((v: unknown, d: Draft) => { d[slot.key] = v; }))(value, draft, queue, ctx);

  if (queue.length === 0) {
    clearPendingAction(ctx.phone);
    return { reply: await flow.finalize(draft, ctx), fallThrough: false };
  }
  setPendingAction(ctx.phone, reconstruct(pending, { draft, missing: queue, asked: 0 }));
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
    if (/^(sempre|vital[íi]ci[oa]|sem fim|para sempre|n[ãa]o tem fim|indetermin|nunca (acaba|termina))/.test(t)) {
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
    if (/^hoje$/.test(t)) return { ok: true, value: today };
    if (/^amanh[ãa]$/.test(t)) {
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

// ── Fluxos ──

// Preenchido progressivamente por fase — apenas os intents já migrados para
// o motor têm entrada aqui. Ver beginSlotFill/runSlotFillTurn para o que
// acontece quando um intent ainda não tem fluxo (não deve ser chamado).
export const FLOWS: Partial<Record<SlotFillIntent, FlowDef>> = {
  recurring_create: {
    seed(ai, ctx) {
      const r = ai.recurring;
      return {
        type: r?.type ?? "expense",
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
      amount: {
        key: "amount",
        label: "valor",
        parse: slotMoney(),
        ask: () => `💰 Qual o valor?`,
        // sem fallback — slot duro, nada pode ser criado sem valor
      },
      totalInstallments: {
        key: "totalInstallments",
        label: "número de parcelas",
        parse: slotCountOrForever(),
        ask: () => `💳 Em quantas vezes? _(ex: "10")_`,
        fallback: () => 1, // sem resposta, assume compra à vista (1 parcela) — encerra sozinho, não fica perpétuo por engano
      },
      term: {
        key: "totalInstallments",
        label: "duração",
        parse: slotCountOrForever(),
        ask: () => `🔁 Por quanto tempo? Responda o número de meses (ex: *12*) — ou *sempre*, se não tiver fim.`,
        fallback: () => null, // sem resposta, mantém o comportamento de hoje: perpétuo
        apply: (value, draft) => { if (value !== null) draft.totalInstallments = value; },
      },
      dayOfMonth: {
        key: "dayOfMonth",
        label: "dia do vencimento",
        parse: slotDayOfMonth(),
        ask: () => `📅 Todo dia quantos vence? _(ex: "10")_`,
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
      return replyRecurringCreated(rec);
    },

    giveUp: () => `❌ Não consegui cadastrar — faltou o valor. Tente de novo, ex: _"academia 100 por mês"_.`,
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
        ask: () => `🎯 Qual o nome da meta?`,
        // sem fallback — slot duro, um título vazio quebra a listagem de metas
      },
      targetAmount: {
        key: "targetAmount",
        label: "valor alvo",
        parse: slotMoney(),
        ask: () => `💰 Qual o valor alvo?`,
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
      const currentLine = goal.currentAmount > 0 ? `\n💵 Já guardado: ${formatCurrency(goal.currentAmount)}` : "";
      const deadlineLine = goal.deadline ? `\n📅 Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}` : "";
      return `✅ *Meta criada com sucesso!*\n\n🎯 *${goal.title}*\n💰 Alvo: ${formatCurrency(goal.targetAmount)}${currentLine}\n📁 Categoria: ${goal.category}${deadlineLine}\n📊 Progresso: ${pct}%\n\nAcompanhe no dashboard → Metas 🚀`;
    },

    giveUp: () => `❌ Não consegui criar a meta — faltou o nome ou o valor. Tente de novo, ex: _"quero guardar 3000 para viagem"_.`,
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
        ask: () => `🗓️ Qual o título do compromisso?`,
        // sem fallback — slot duro
      },
      startDate: {
        key: "startDate",
        label: "data",
        parse: slotDate(),
        ask: () => `📅 Para quando? _(ex: "amanhã", "15/08")_`,
        // sem fallback — slot duro
      },
      startTime: {
        key: "startTime",
        label: "horário",
        parse: (text, draft, ctx) => {
          if (/^dia todo$/i.test(text.trim())) return { ok: true, value: "ALLDAY" };
          return slotTime()(text, draft, ctx);
        },
        ask: () => `🕒 Que horas? _(ou responda *dia todo*)_`,
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
      return replyAgendaCreated(apt);
    },

    giveUp: () => `❌ Não consegui agendar — faltou o título ou a data. Tente de novo, ex: _"agendar reunião amanhã às 14h"_.`,
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
        ask: () => `🏪 Em qual mercado foi a compra?`,
        fallback: () => "Não informado",
      },
      items: {
        key: "items",
        label: "itens",
        parse: (text) => {
          const items = parseGroceryItemsText(text);
          return items ? { ok: true, value: items } : { ok: false };
        },
        ask: () => `🧾 Quais itens? _(ex: "arroz 25, feijão 8, leite 6")_`,
        // sem fallback — slot duro, compra sem item nenhum não faz sentido
      },
    },

    async finalize(draft, ctx) {
      const items = draft.items as GroceryPurchaseItem[];
      const store = await findOrCreateStore(ctx.userId, (draft.storeName as string) || "Não informado");
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const purchase = await addPurchase({
        userId: ctx.userId,
        storeId: store.id,
        storeName: store.name,
        date: (draft.date as string) || todayStrBR(),
        items,
        total,
      });
      return replyGroceryPurchaseSaved(purchase);
    },

    giveUp: () => `❌ Não consegui registrar a compra — faltaram os itens. Tente de novo, ex: _"comprei no Assaí: arroz 25, feijão 8"_.`,
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
        ask: () => `🏪 Em qual mercado foi a compra?`,
      },
      total: {
        key: "total",
        label: "total",
        parse: (text) => {
          const amount = parseAmountBR(text);
          return amount !== null ? { ok: true, value: amount } : { ok: false };
        },
        ask: () => `💰 Quanto você pagou no total?`,
      },
    },

    async finalize(draft, ctx) {
      const result = await finalizePurchaseFromChecked(
        ctx.userId, ctx.mode, draft.storeName as string, draft.total as number, ctx.phone,
      );
      if (!result) return `❓ Sua lista de compras não tem nenhum item marcado. Marca o que você já comprou (ex: _"comprei o arroz"_) e chama de novo.`;
      return replyGroceryPurchaseFinished(result.purchase);
    },

    giveUp: () => `❌ Não consegui fechar a compra — faltou o mercado ou o valor. Tente de novo, ex: _"finalizei a compra no Assaí, foi 120 reais"_.`,
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
        ask: () => `👤 Qual o nome do funcionário?`,
        // sem fallback — slot duro
      },
      salary: {
        key: "salary",
        label: "salário",
        parse: slotMoney(),
        ask: () => `💰 Qual o salário?`,
        // sem fallback — slot duro, corromperia o cálculo de folha
      },
    },

    async finalize(draft, ctx) {
      const employee = await createEmployee({
        userId: ctx.userId,
        name: draft.name as string,
        role: (draft.role as string) || "Funcionário",
        salary: draft.salary as number,
        startDate: (draft.startDate as string) || todayStrBR(),
        status: "active",
        phone: draft.phone as string | undefined,
        email: draft.email as string | undefined,
      });
      return replyEmployeeCreated(employee);
    },

    giveUp: () => `❌ Não consegui cadastrar — faltou o nome ou o salário. Tente de novo, ex: _"cadastra a Ana como vendedora, 2000"_.`,
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
        ask: () => `🧾 Qual o nome do cliente?`,
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
      return replyCustomerCreated(customer);
    },

    giveUp: () => `❌ Não consegui cadastrar — faltou o nome. Tente de novo, ex: _"cadastra o cliente Pedro"_.`,
  },
};
