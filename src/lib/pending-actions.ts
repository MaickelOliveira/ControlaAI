import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { VehicleExpenseType } from "./vehicles";
import { CATEGORIES_EXPENSE, CATEGORIES_INCOME } from "./finances";

const FILE = path.join(process.cwd(), "data", "pending.json");
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
  amount: number;
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

export type PendingReceiptSave = {
  type: "receipt_save";
  phone: string;
  userId: string;
  fileBase64: string;
  mimeType: string;
  suggestedName: string;
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

export type PendingAction = PendingVehicleSelection | PendingGoalSelection | PendingRecurringConfirmation | PendingMeetAta | PendingMeetConfirm | PendingFinanceSelect | PendingWppName | PendingReceiptSave | PendingInvoiceImport;

type Store = Record<string, PendingAction>;

function load(): Store {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return {}; }
}

function save(store: Store) {
  try { writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch { /* ignore */ }
}

const TTL_MEET_ATA_MS = 4 * 60 * 60 * 1000; // 4 horas

type PendingActionInput =
  | Omit<PendingVehicleSelection, "phone" | "expiresAt">
  | Omit<PendingGoalSelection, "phone" | "expiresAt">
  | Omit<PendingRecurringConfirmation, "phone" | "expiresAt">
  | Omit<PendingMeetAta, "phone" | "expiresAt">
  | Omit<PendingMeetConfirm, "phone" | "expiresAt">
  | Omit<PendingFinanceSelect, "phone" | "expiresAt">
  | Omit<PendingWppName, "phone" | "expiresAt">
  | Omit<PendingReceiptSave, "phone" | "expiresAt">
  | Omit<PendingInvoiceImport, "phone" | "expiresAt">;

export function setPendingAction(phone: string, action: PendingActionInput): void {
  const store = load();
  // remove expirados
  const now = Date.now();
  for (const key of Object.keys(store)) {
    if (new Date(store[key].expiresAt).getTime() < now) delete store[key];
  }
  const ttl =
    action.type === "recurring_confirmation" ? TTL_RECURRING_MS :
    action.type === "meet_ata" ? TTL_MEET_ATA_MS :
    action.type === "invoice_import" ? TTL_INVOICE_MS :
    TTL_MS;
  store[phone] = { ...action, phone, expiresAt: new Date(now + ttl).toISOString() } as PendingAction;
  save(store);
}

export function getPendingAction(phone: string): PendingAction | null {
  const store = load();
  const action = store[phone];
  if (!action) return null;
  if (new Date(action.expiresAt).getTime() < Date.now()) {
    delete store[phone];
    save(store);
    return null;
  }
  return action;
}

export function clearPendingAction(phone: string): void {
  const store = load();
  if (phone in store) {
    delete store[phone];
    save(store);
  }
}

/** Interpreta a resposta do usuário como escolha de meta.
 *  Aceita: "1", "2", parte do título. Retorna índice (0-based) ou -1. */
export function parseGoalChoice(
  text: string,
  goals: Array<{ id: string; title: string; currentAmount: number; targetAmount: number }>
): number {
  const t = text.trim().toLowerCase();
  const num = parseInt(t);
  if (!isNaN(num) && num >= 1 && num <= goals.length) return num - 1;
  for (let i = 0; i < goals.length; i++) {
    if (goals[i].title.toLowerCase().includes(t) || t.includes(goals[i].title.toLowerCase())) return i;
  }
  return -1;
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

/** Interpreta a resposta do usuário como o NOVO VALOR de um lançamento já
 *  escolhido (etapa final de finance_edit, quando falta só o "o que mudar").
 *  Aceita valor em reais (ex: "80 reais", "R$ 80,50") e/ou nome de categoria
 *  conhecida mencionado no texto. Retorna um patch parcial — pode vir vazio
 *  se não reconhecer nada. */
export function parseFinancePatchFromText(text: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const t = text.trim();

  const amountMatch = t.replace(/\./g, "").replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (amountMatch) {
    const val = parseFloat(amountMatch[1]);
    if (!isNaN(val) && val > 0) patch.amount = val;
  }

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
  const t = text.trim().toLowerCase();

  // número direto: "1", "2", etc.
  const num = parseInt(t);
  if (!isNaN(num) && num >= 1 && num <= vehicles.length) return num - 1;

  // match por modelo ou marca
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    if (
      v.model.toLowerCase().includes(t) ||
      v.brand.toLowerCase().includes(t) ||
      t.includes(v.model.toLowerCase()) ||
      t.includes(v.brand.toLowerCase())
    ) {
      return i;
    }
  }

  return -1;
}
