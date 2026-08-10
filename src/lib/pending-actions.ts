import { getSupabase } from "./supabase";
import { VehicleExpenseType } from "./vehicles";
import { CATEGORIES_EXPENSE, CATEGORIES_INCOME } from "./finances";
import type { RecurringData } from "./ai-processor";

const TTL_MS = 5 * 60 * 1000; // 5 minutos
const TTL_RECURRING_MS = 12 * 60 * 60 * 1000; // 12 horas
const TTL_INVOICE_MS = 30 * 60 * 1000; // 30 minutos — fatura pode ter muitos lançamentos, dá mais tempo pra revisar

export type PendingVehicleSelection = {
  type: "vehicle_selection";
  phone: string;
  userId: string;
  mode: string;
  expenseData: {
    amount: number;
    expenseType: VehicleExpenseType;
    description: string;
    km?: number;
    date: string;
  };
  vehicles: Array<{ id: string; brand: string; model: string; year: number }>;
  expiresAt: string;
};

export type PendingGoalSelection = {
  type: "goal_selection";
  phone: string;
  userId: string;
  mode: string;
  action: "add" | "complete" | "cancel";
  amount?: number; // só usado quando action === "add"
  goals: Array<{ id: string; title: string; currentAmount: number; targetAmount: number }>;
  expiresAt: string;
};

export type PendingRecurringConfirmation = {
  type: "recurring_confirmation";
  phone: string;
  userId: string;
  recurringId: string;
  description: string;
  amount: number;
  installmentNumber?: number;
  totalInstallments?: number;
  expiresAt: string;
};

export type PendingMeetAta = {
  type: "meet_ata";
  phone: string;
  userId: string;
  meetId: string;    // agendaAppointmentId
  meetTitle: string;
  expiresAt: string;
};

export type PendingMeetConfirm = {
  type: "meet_confirm";
  phone: string;
  userId: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  attendees: Array<{ name: string; phone?: string; email?: string }>;
  mode: string;
  expiresAt: string;
};

export type PendingAppointmentSelection = {
  type: "appointment_selection";
  phone: string;
  userId: string;
  action: "update" | "delete" | "done" | "add_meet";
  patch?: Record<string, unknown>; // usado só em "update"
  appointments: Array<{ id: string; title: string; startAt: string; location?: string }>;
  expiresAt: string;
};

export type PendingFinanceSelect = {
  type: "finance_select";
  phone: string;
  userId: string;
  action: "edit" | "delete";
  candidates: Array<{ id: string; description: string; amount: number; date: string; category: string; mode: string }>;
  patch?: Record<string, unknown>; // usado só em "edit"
  expiresAt: string;
};

export type PendingWppName = {
  type: "awaiting_wpp_name";
  phone: string;
  userId: string;
  expiresAt: string;
};

/** Coleta nome, vínculo e modo permitido ANTES de vincular o número de fato
 *  (linkPhone só roda depois que os 3 passos terminam) — substitui o fluxo
 *  antigo de vincular na hora e perguntar o nome depois. */
export type PendingWppLinkInfo = {
  type: "awaiting_wpp_link_info";
  phone: string;
  userId: string;
  step: "name" | "relation" | "access";
  name?: string;
  relation?: string;
  expiresAt: string;
};

export type PendingReceiptSave = {
  type: "receipt_save";
  phone: string;
  userId: string;
  fileBase64: string;
  mimeType: string;
  suggestedName: string;
  /** descrição do lançamento vinculado — vai pro campo description do
   *  DriveFile quando o comprovante é salvo, pra não ficar sem descrição
   *  (diferente do caminho de salvamento imediato, que já passa a legenda). */
  description?: string;
  financeId?: string;
  expiresAt: string;
};

export type PendingInvoiceImportItem = { date: string; description: string; amount: number; category: string };

export type PendingInvoiceImport = {
  type: "invoice_import";
  phone: string;
  userId: string;
  mode: "personal" | "business";
  items: PendingInvoiceImportItem[];
  expiresAt: string;
};

/** Intents que podem abrir um fluxo de perguntas (slot-filling) quando a
 *  mensagem original não trouxer todos os campos que mudam comportamento. */
export type SlotFillIntent =
  | "recurring_create"
  | "goal_create"
  | "agenda_create"
  | "vehicle_expense"
  | "vehicle_create"
  | "employee_create"
  | "customer_create"
  | "grocery_purchase";

export type PendingSlotFill = {
  type: "slot_fill";
  phone: string;
  userId: string;
  intent: SlotFillIntent;
  /** campos já resolvidos, vindos da IA ou de respostas anteriores */
  draft: Record<string, unknown>;
  /** slots ainda a perguntar, EM ORDEM — missing[0] é a pergunta no ar.
   *  Fila mutável (não índice): respostas podem remover ou acrescentar
   *  perguntas seguintes (ex: "dia todo" remove a pergunta de horário). */
  missing: string[];
  /** tentativas já feitas no slot atual — guarda contra loop de re-pergunta */
  asked: number;
  mode: "personal" | "business";
  /** mensagem que abriu o fluxo — usada em mensagens de desistência */
  originalText: string;
  expiresAt: string;
};

/** Pergunta "para qual funcionário é esse pagamento?" quando recurring_create
 *  identifica um pagamento de funcionário (employeePayment) mas não dá pra
 *  saber sozinho qual — mesmo padrão de PendingVehicleSelection, só que aqui
 *  o alvo final é retomar recurring_create com a descrição já vinculada. */
export type PendingEmployeePaymentSelect = {
  type: "employee_payment_select";
  phone: string;
  userId: string;
  mode: string;
  recurringData: RecurringData;
  originalText: string;
  employees: Array<{ id: string; name: string; role: string }>;
  expiresAt: string;
};

export type PendingAction = PendingVehicleSelection | PendingGoalSelection | PendingAppointmentSelection | PendingRecurringConfirmation | PendingMeetAta | PendingMeetConfirm | PendingFinanceSelect | PendingWppName | PendingWppLinkInfo | PendingReceiptSave | PendingInvoiceImport | PendingSlotFill | PendingEmployeePaymentSelect;

// Cada telefone é sua própria linha (chave primária) — sem precisar mais
// varrer/limpar expirados de um blob único a cada escrita.

const TTL_MEET_ATA_MS = 4 * 60 * 60 * 1000; // 4 horas
// Perguntas de slot-filling podem levar mais de um turno — 10 min é um
// orçamento POR TURNO, não total, já que toda resposta válida renova o TTL
// (setPendingAction é chamado de novo a cada avanço no fluxo).
const TTL_SLOT_FILL_MS = 10 * 60 * 1000;

type PendingActionInput =
  | Omit<PendingVehicleSelection, "phone" | "expiresAt">
  | Omit<PendingGoalSelection, "phone" | "expiresAt">
  | Omit<PendingAppointmentSelection, "phone" | "expiresAt">
  | Omit<PendingRecurringConfirmation, "phone" | "expiresAt">
  | Omit<PendingMeetAta, "phone" | "expiresAt">
  | Omit<PendingMeetConfirm, "phone" | "expiresAt">
  | Omit<PendingFinanceSelect, "phone" | "expiresAt">
  | Omit<PendingWppName, "phone" | "expiresAt">
  | Omit<PendingWppLinkInfo, "phone" | "expiresAt">
  | Omit<PendingReceiptSave, "phone" | "expiresAt">
  | Omit<PendingInvoiceImport, "phone" | "expiresAt">
  | Omit<PendingSlotFill, "phone" | "expiresAt">
  | Omit<PendingEmployeePaymentSelect, "phone" | "expiresAt">;

const TTL_BY_TYPE: Partial<Record<PendingAction["type"], number>> = {
  recurring_confirmation: TTL_RECURRING_MS,
  meet_ata: TTL_MEET_ATA_MS,
  invoice_import: TTL_INVOICE_MS,
  slot_fill: TTL_SLOT_FILL_MS,
};

export async function setPendingAction(phone: string, action: PendingActionInput): Promise<void> {
  const now = Date.now();
  const ttl = TTL_BY_TYPE[action.type] ?? TTL_MS;
  const full = { ...action, phone, expiresAt: new Date(now + ttl).toISOString() } as PendingAction;
  const { error } = await getSupabase().from("pending_actions").upsert({ phone, data: full, updated_at: new Date().toISOString() });
  if (error) console.error("[pending-actions] falha ao gravar:", error.message);
}

export async function getPendingAction(phone: string): Promise<PendingAction | null> {
  const { data, error } = await getSupabase().from("pending_actions").select("data").eq("phone", phone).maybeSingle();
  if (error || !data) return null;
  const action = (data as { data: PendingAction }).data;
  if (new Date(action.expiresAt).getTime() < Date.now()) {
    await clearPendingAction(phone);
    return null;
  }
  return action;
}

export async function clearPendingAction(phone: string): Promise<void> {
  await getSupabase().from("pending_actions").delete().eq("phone", phone);
}

/** Base compartilhada de todo "escolha da lista" por número ou por texto:
 *  número direto (1-based):índice; senão, substring bidirecional contra
 *  qualquer um dos rótulos do item (ex: modelo OU marca de um veículo).
 *  Usada por parseGoalChoice, parseVehicleChoice e pelo slotChoice do motor
 *  de slot-filling — um único algoritmo de "escolha por número ou nome" no
 *  produto todo. Retorna -1 se não reconhecer. */
export function choiceIndexByLabels<T>(text: string, items: T[], getLabels: (item: T) => string[]): number {
  const t = text.trim().toLowerCase();
  const num = parseInt(t);
  if (!isNaN(num) && num >= 1 && num <= items.length) return num - 1;
  for (let i = 0; i < items.length; i++) {
    const labels = getLabels(items[i]).map(l => l.toLowerCase());
    if (labels.some(l => l.includes(t) || t.includes(l))) return i;
  }
  return -1;
}

/** Interpreta a resposta do usuário como escolha de meta.
 *  Aceita: "1", "2", parte do título. Retorna índice (0-based) ou -1. */
export function parseGoalChoice(
  text: string,
  goals: Array<{ id: string; title: string; currentAmount: number; targetAmount: number }>
): number {
  return choiceIndexByLabels(text, goals, g => [g.title]);
}

/** Interpreta a resposta do usuário como escolha de compromisso da agenda.
 *  Aceita: "1", "2", parte do título. Retorna índice (0-based) ou -1. */
export function parseAppointmentChoice(
  text: string,
  appointments: Array<{ id: string; title: string; startAt: string; location?: string }>
): number {
  return choiceIndexByLabels(text, appointments, a => [a.title]);
}

/** Interpreta a resposta do usuário como escolha de lançamento financeiro.
 *  Aceita: "1"/"2"/... (número), "último"/"mais recente", "04/07"/"4 de julho" (data). Retorna índice (0-based) ou -1. */
export function parseFinanceChoice(
  text: string,
  candidates: Array<{ id: string; description: string; amount: number; date: string; category: string; mode: string }>
): number {
  const t = text.trim().toLowerCase();

  // Número direto
  const num = parseInt(t);
  if (!isNaN(num) && num >= 1 && num <= candidates.length) return num - 1;

  // "último", "ultimo", "mais recente", "last", "recente"
  if (/^(último|ultimo|mais recente|recente|last|o último|o ultimo)$/.test(t)) return 0;

  // Tentativa de match por data: "04/07", "4/7", "04-07", "4 de julho", "hoje", "ontem"
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (t === "hoje" || t === "today") {
    const idx = candidates.findIndex(c => c.date === today);
    if (idx !== -1) return idx;
  }
  if (t === "ontem" || t === "yesterday") {
    const idx = candidates.findIndex(c => c.date === yesterday);
    if (idx !== -1) return idx;
  }

  // DD/MM ou D/M
  const dmMatch = t.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dmMatch) {
    const day = dmMatch[1].padStart(2, "0");
    const mon = dmMatch[2].padStart(2, "0");
    const idx = candidates.findIndex(c => c.date.slice(5, 7) === mon && c.date.slice(8, 10) === day);
    if (idx !== -1) return idx;
  }

  // "4 de julho", "4 julho"
  const MONTHS: Record<string, string> = {
    janeiro: "01", fevereiro: "02", março: "03", marco: "03", abril: "04",
    maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
    outubro: "10", novembro: "11", dezembro: "12",
  };
  const monthMatch = t.match(/^(\d{1,2})\s+(?:de\s+)?(\w+)$/);
  if (monthMatch) {
    const day = monthMatch[1].padStart(2, "0");
    const mon = MONTHS[monthMatch[2]];
    if (mon) {
      const idx = candidates.findIndex(c => c.date.slice(5, 7) === mon && c.date.slice(8, 10) === day);
      if (idx !== -1) return idx;
    }
  }

  return -1;
}

/** Extrai um valor em reais de um texto livre (ex: "80 reais", "R$ 80,50").
 *  Converte separador decimal BR (vírgula) e remove separador de milhar
 *  (ponto) antes de parsear. Retorna null se não achar nada válido. */
export function parseAmountBR(text: string): number | null {
  const match = text.replace(/\./g, "").replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return !isNaN(val) && val > 0 ? val : null;
}

/** Interpreta a resposta do usuário como o NOVO VALOR de um lançamento já
 *  escolhido (etapa final de finance_edit, quando falta só o "o que mudar").
 *  Aceita valor em reais, nome de categoria conhecida, e/ou uma nova
 *  descrição ("descrição para X" / "nome para X"). Retorna um patch
 *  parcial — pode vir vazio se não reconhecer nada. */
export function parseFinancePatchFromText(text: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const t = text.trim();

  const descMatch = t.match(/(?:descri[çc][ãa]o|nome)\s+(?:para|pra)\s+(.+)/i);
  if (descMatch) patch.description = descMatch[1].trim();

  const amount = parseAmountBR(t);
  if (amount !== null) patch.amount = amount;

  const lower = t.toLowerCase();
  const allCategories = [...CATEGORIES_EXPENSE, ...CATEGORIES_INCOME];
  const category = allCategories.find((c) => lower.includes(c.toLowerCase()));
  if (category) patch.category = category;

  return patch;
}

/** Interpreta a resposta do usuário como confirmação sim/não.
 *  Retorna true, false, ou null se não reconhecer a resposta. */
export function parseYesNo(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (/^(sim|s|ss|isso|pode|manda|salva|guarda|claro|com certeza|quero|yes|y|ok|beleza|manda ver)\b/.test(t)) return true;
  if (/^(n[ãa]o|nao|n|não quero|nunca|no)\b/.test(t)) return false;
  return null;
}

/** Interpreta a resposta do usuário como escolha de veículo.
 *  Aceita: "1", "2", nome do modelo, nome da marca. Retorna índice (0-based) ou -1. */
export function parseVehicleChoice(
  text: string,
  vehicles: Array<{ id: string; brand: string; model: string; year: number }>
): number {
  return choiceIndexByLabels(text, vehicles, v => [v.model, v.brand]);
}
