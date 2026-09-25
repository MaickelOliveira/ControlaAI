import { getSupabase } from "./supabase";
import { VehicleExpenseType, type VehicleUpdateInput } from "./vehicles";
import { CATEGORIES_EXPENSE, CATEGORIES_INCOME, parseFinanceDestinationMode } from "./finances";
import type { AIResult, RecurringData } from "./ai-processor";

const TTL_MS = 5 * 60 * 1000; // 5 minutos
const TTL_RECURRING_MS = 12 * 60 * 60 * 1000; // 12 horas
const TTL_INVOICE_MS = 30 * 60 * 1000; // 30 minutos — fatura pode ter muitos lançamentos, dá mais tempo pra revisar

export type PendingVehicleSelection = {
  type: "vehicle_selection";
  phone: string;
  userId: string;
  mode: string;
  /** Ausente em registros antigos significa "expense", por compatibilidade. */
  action?: "expense" | "update" | "delete";
  expenseData?: {
    amount: number;
    expenseType: VehicleExpenseType;
    description: string;
    km?: number;
    date: string;
  };
  patch?: VehicleUpdateInput;
  /** Em update, indica que o veículo já foi escolhido e falta dizer o campo. */
  awaitingPatch?: boolean;
  vehicles: Array<{ id: string; brand: string; model: string; year: number; plate?: string }>;
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
  /** Evita confirmar duas vezes caso outra pessoa já tenha baixado a mesma ocorrência. */
  dueDate?: string;
  description: string;
  amount: number;
  installmentNumber?: number;
  totalInstallments?: number;
  expiresAt: string;
};

export type PendingRecurringSelection = {
  type: "recurring_selection";
  phone: string;
  userId: string;
  candidates: Array<{
    id: string;
    description: string;
    amount: number;
    dueDate: string;
    mode: "personal" | "business";
  }>;
  expiresAt: string;
};

export type PendingClearHistory = {
  type: "confirm_clear_history";
  phone: string;
  userId: string;
  mode: "personal" | "business" | "both";
  count: number; // quantos lançamentos seriam apagados — só informativo, recontado na hora de executar
  expiresAt: string;
};

/** Quando um slot-fill desiste e usa o valor padrão de um campo (ex: dia do
 *  vencimento vira 1º do mês por falta de resposta válida), guarda por um
 *  tempo curto qual campo/registro ficou "no palpite" — se a PRÓXIMA
 *  mensagem for curta e bater exatamente no parser daquele campo (não uma
 *  frase nova qualquer), aplica como correção em vez de ignorar. */
export type PendingSlotCorrection = {
  type: "slot_correction";
  phone: string;
  userId: string;
  entity: "recurring";
  entityId: string;
  field: "dayOfMonth";
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
  items?: Array<{
    title: string;
    description?: string;
    startAt: string;
    endAt: string;
    attendees: Array<{ name: string; phone?: string; email?: string }>;
  }>;
  mode: string;
  expiresAt: string;
};

export type PendingAppointmentSelection = {
  type: "appointment_selection";
  phone: string;
  userId: string;
  action: "update" | "delete" | "done" | "add_meet" | "set_reminder";
  patch?: Record<string, unknown>; // usado só em "update"
  /** Após escolher qual compromisso editar, ainda pode faltar dizer o que
   *  muda. Esse estado impede uma atualização vazia seguida de silêncio. */
  awaitingPatch?: boolean;
  reminderOffsetMinutes?: number;
  mode?: "personal" | "business";
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
  // true = "candidates" já é a seleção final (1 ou vários), só falta a
  // pessoa dizer o que mudar — sem isso, "candidates" é a LISTA pra
  // escolher ainda. Substitui o antigo atalho "candidates.length === 1",
  // que não dava pra distinguir "escolhi 1 de vários" de "ainda escolhendo
  // entre vários" depois que seleção múltipla passou a existir.
  awaitingPatch?: boolean;
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
  accountHint?: string; // nome do banco/cartão identificado no documento (ver accounts.ts resolveAccountForFinance)
  expiresAt: string;
};

/** Imagem enviada sem legenda. O arquivo fica temporariamente nesta ação
 * enquanto o bot pergunta se deve guardar, pesquisar ou apenas identificar. */
export type PendingImageAction = {
  type: "image_action";
  phone: string;
  userId: string;
  fileBase64: string;
  mimeType: string;
  originalName: string;
  expiresAt: string;
};

/** Intents que podem abrir um fluxo de perguntas (slot-filling) quando a
 *  mensagem original não trouxer todos os campos que mudam comportamento. */
export type SlotFillIntent =
  | "reminder_set"
  | "recurring_create"
  | "goal_create"
  | "agenda_create"
  | "vehicle_expense"
  | "vehicle_create"
  | "employee_create"
  | "customer_create"
  | "contact_create"
  | "grocery_purchase"
  | "grocery_purchase_finish";

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
  /** Lote da mesma intenção. Nada é criado enquanto ainda houver campos
   * obrigatórios faltando. */
  batchDrafts?: Array<Record<string, unknown>>;
  batchMissing?: string[][];
  batchIndex?: number;
  expiresAt: string;
};

/** Continuação genérica para ações que já foram identificadas, mas ainda
 * precisam de um dado obrigatório. Guarda a intenção e os campos extraídos
 * para que respostas curtas ("amanhã", "100 reais", "o arroz") completem o
 * pedido anterior em vez de virarem um comando novo. */
export type PendingActionContinuation = {
  type: "action_continuation";
  phone: string;
  userId: string;
  intent: AIResult["intent"];
  partial: AIResult;
  originalText: string;
  answers: string[];
  mode: "personal" | "business";
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

/** Escolha de funcionário para um lançamento comum da categoria Funcionários.
 * Em resume_ai, a despesa ainda não foi gravada; em edit_finances, os IDs já
 * existem e só falta trocar/remover o vínculo. */
export type PendingFinanceEmployeeSelect = {
  type: "finance_employee_select";
  phone: string;
  userId: string;
  mode: string;
  action: "resume_ai" | "edit_finances";
  ai?: AIResult;
  originalText?: string;
  financeIds?: string[];
  employees: Array<{ id: string; name: string; role: string }>;
  expiresAt: string;
};

/** Um comando de correção citou alguém ainda não cadastrado. Coleta o único
 * campo obrigatório restante (salário), cria o funcionário e conclui o vínculo
 * com os lançamentos que motivaram a pergunta. */
export type PendingFinanceEmployeeCreate = {
  type: "finance_employee_create";
  phone: string;
  userId: string;
  mode: string;
  employeeName: string;
  financeIds: string[];
  expiresAt: string;
};

/** Pergunta qual conta/cartão o usuário quis dizer quando o nome citado
 *  (accountHint/keyword) bate em mais de uma conta cadastrada — mesmo padrão
 *  de PendingVehicleSelection/PendingAppointmentSelection. "action" decide o
 *  que fazer com a conta escolhida (ver resolução em message-handler.ts). */
export type PendingAccountSelection = {
  type: "account_selection";
  phone: string;
  userId: string;
  mode: string;
  action: "resume_ai";
  ai: AIResult;
  originalText: string;
  accounts: Array<{ id: string; name: string; type: string }>;
  expiresAt: string;
};

/** O usuário escolheu cadastrar uma conta enquanto havia outra ação em
 * andamento (por exemplo, um gasto). Depois de receber o nome, o bot cria a
 * conta e retoma a ação original já usando essa conta. Sem resumeAi, atende o
 * comando avulso "cadastrar conta" que ainda não informou o nome. */
export type PendingAccountCreateName = {
  type: "account_create_name";
  phone: string;
  userId: string;
  mode: string;
  resumeAi?: AIResult;
  originalText?: string;
  expiresAt: string;
};

/** Depois de cadastrar uma nova conta, confirma se a conta padrão atual deve
 * ser mantida ou se a nova deve assumir como padrão. */
export type PendingAccountDefaultConfirm = {
  type: "account_default_confirm";
  phone: string;
  userId: string;
  mode: string;
  currentAccountId: string;
  currentAccountName: string;
  newAccountId: string;
  newAccountName: string;
  expiresAt: string;
};

export type PendingAction = PendingVehicleSelection | PendingGoalSelection | PendingAppointmentSelection | PendingRecurringConfirmation | PendingRecurringSelection | PendingMeetAta | PendingMeetConfirm | PendingFinanceSelect | PendingWppName | PendingWppLinkInfo | PendingReceiptSave | PendingInvoiceImport | PendingImageAction | PendingSlotFill | PendingActionContinuation | PendingEmployeePaymentSelect | PendingFinanceEmployeeSelect | PendingFinanceEmployeeCreate | PendingAccountSelection | PendingAccountCreateName | PendingAccountDefaultConfirm | PendingClearHistory | PendingSlotCorrection;

// Cada telefone é sua própria linha (chave primária) — sem precisar mais
// varrer/limpar expirados de um blob único a cada escrita.

const TTL_MEET_ATA_MS = 4 * 60 * 60 * 1000; // 4 horas
// Perguntas de slot-filling podem levar mais de um turno — 10 min é um
// orçamento POR TURNO, não total, já que toda resposta válida renova o TTL
// (setPendingAction é chamado de novo a cada avanço no fluxo).
const TTL_SLOT_FILL_MS = 10 * 60 * 1000;
const TTL_SLOT_CORRECTION_MS = 30 * 60 * 1000;

type PendingActionInput =
  | Omit<PendingVehicleSelection, "phone" | "expiresAt">
  | Omit<PendingGoalSelection, "phone" | "expiresAt">
  | Omit<PendingAppointmentSelection, "phone" | "expiresAt">
  | Omit<PendingRecurringConfirmation, "phone" | "expiresAt">
  | Omit<PendingRecurringSelection, "phone" | "expiresAt">
  | Omit<PendingMeetAta, "phone" | "expiresAt">
  | Omit<PendingMeetConfirm, "phone" | "expiresAt">
  | Omit<PendingFinanceSelect, "phone" | "expiresAt">
  | Omit<PendingWppName, "phone" | "expiresAt">
  | Omit<PendingWppLinkInfo, "phone" | "expiresAt">
  | Omit<PendingReceiptSave, "phone" | "expiresAt">
  | Omit<PendingInvoiceImport, "phone" | "expiresAt">
  | Omit<PendingImageAction, "phone" | "expiresAt">
  | Omit<PendingSlotFill, "phone" | "expiresAt">
  | Omit<PendingActionContinuation, "phone" | "expiresAt">
  | Omit<PendingEmployeePaymentSelect, "phone" | "expiresAt">
  | Omit<PendingFinanceEmployeeSelect, "phone" | "expiresAt">
  | Omit<PendingFinanceEmployeeCreate, "phone" | "expiresAt">
  | Omit<PendingAccountSelection, "phone" | "expiresAt">
  | Omit<PendingAccountCreateName, "phone" | "expiresAt">
  | Omit<PendingAccountDefaultConfirm, "phone" | "expiresAt">
  | Omit<PendingClearHistory, "phone" | "expiresAt">
  | Omit<PendingSlotCorrection, "phone" | "expiresAt">;

const TTL_BY_TYPE: Partial<Record<PendingAction["type"], number>> = {
  recurring_confirmation: TTL_RECURRING_MS,
  meet_ata: TTL_MEET_ATA_MS,
  invoice_import: TTL_INVOICE_MS,
  image_action: TTL_SLOT_FILL_MS,
  slot_fill: TTL_SLOT_FILL_MS,
  action_continuation: TTL_SLOT_FILL_MS,
  slot_correction: TTL_SLOT_CORRECTION_MS,
};

export async function setPendingAction(phone: string, action: PendingActionInput): Promise<void> {
  const now = Date.now();
  const ttl = TTL_BY_TYPE[action.type] ?? TTL_MS;
  const full = { ...action, phone, expiresAt: new Date(now + ttl).toISOString() } as PendingAction;
  const { error } = await getSupabase().from("pending_actions").upsert({ phone, data: full, updated_at: new Date().toISOString() });
  if (error) throw new Error(`[pending-actions] falha ao gravar: ${error.message}`);
}

export async function getPendingAction(phone: string): Promise<PendingAction | null> {
  const { data, error } = await getSupabase().from("pending_actions").select("data").eq("phone", phone).maybeSingle();
  if (error) {
    throw new Error(`[pending-actions] falha ao consultar: ${error.message}`);
  }
  if (!data) return null;
  const action = (data as { data: PendingAction }).data;
  if (new Date(action.expiresAt).getTime() < Date.now()) {
    await clearPendingAction(phone);
    return null;
  }
  return action;
}

export async function clearPendingAction(phone: string): Promise<void> {
  const { error } = await getSupabase().from("pending_actions").delete().eq("phone", phone);
  if (error) throw new Error(`[pending-actions] falha ao limpar: ${error.message}`);
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

/** Interpreta a resposta do usuário como escolha de conta/cartão.
 *  Aceita: "1", "2", parte do nome. Retorna índice (0-based) ou -1. */
export function parseAccountChoice(
  text: string,
  accounts: Array<{ id: string; name: string; type: string }>
): number {
  return choiceIndexByLabels(text, accounts, a => [a.name]);
}

/** Detecta a opção textual oferecida junto da lista de contas. Retorna null
 * quando não é um pedido de cadastro, string vazia quando falta o nome e o
 * nome quando a pessoa já responde tudo de uma vez. */
export function parseAccountCreateRequest(text: string): string | null {
  const match = text.trim().match(/^(?:quero\s+)?(?:cadastrar|cadastre|cadastra|criar|crie|cria|adicionar|adicione|adiciona|registrar|registre|registra|crear|crea|agregar|agrega|a[nñ]adir|a[nñ]ade)\s+(?:(?:uma|una|a|la)\s+)?(?:(?:nova|nueva)\s+)?(?:conta|cuenta)\b(?:\s+(?:chamada|llamada|com\s+o\s+nome|con\s+el\s+nombre(?:\s+de)?))?\s*(.*)$/i);
  if (!match) return null;
  return match[1].replace(/^["“”']+|["“”'.!?;,]+$/g, "").trim();
}

export function parseAccountDefaultChoice(
  text: string,
  currentAccountName: string,
  newAccountName: string,
): "keep" | "change" | null {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
  const answer = normalize(text);
  const current = normalize(currentAccountName);
  const next = normalize(newAccountName);

  if (answer === current || /^(?:1|manter|mantem|mantenha|continua|continuar|deixa|deixar|atual|keep|mantener|mantenga|dejar|no|nao)$/.test(answer)) return "keep";
  if (answer === next || /^(?:2|mudar|muda|trocar|troca|alterar|altera|essa|esta|nova|sim|change|cambiar|cambia|esta|nueva|si)$/.test(answer)) return "change";
  return null;
}

/** Escolha de funcionário com uma opção virtual adicional: "sem
 * funcionário". Retorna o índice real, "none", ou null quando não reconhece. */
export function parseFinanceEmployeeChoice(
  text: string,
  employees: Array<{ id: string; name: string; role: string }>,
): number | "none" | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
  if (Number(normalized) === employees.length + 1
    || /^(?:sem|nenhum|nenhuma|sem funcionario|sem colaborador|nao selecionar|remover|excluir|desvincular|sin empleado|ninguno|ninguna|sin seleccionar|quitar|eliminar|desvincular)$/.test(normalized)) {
    return "none";
  }
  const choice = choiceIndexByLabels(text, employees, employee => [employee.name]);
  return choice >= 0 ? choice : null;
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
  if (/^(último|ultimo|mais recente|más reciente|mas reciente|recente|last|o último|o ultimo|el último|el ultimo)$/.test(t)) return 0;

  // Tentativa de match por data: "04/07", "4/7", "04-07", "4 de julho", "hoje", "ontem"
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (t === "hoje" || t === "hoy" || t === "today") {
    const idx = candidates.findIndex(c => c.date === today);
    if (idx !== -1) return idx;
  }
  if (t === "ontem" || t === "ayer" || t === "yesterday") {
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
    enero: "01", febrero: "02", marzo: "03", mayo: "05", junio: "06",
    julio: "07", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
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

/** Interpreta a resposta do usuário como escolha de MÚLTIPLOS lançamentos
 *  de uma lista — número único ("5"), intervalo ("1 a 10", "1 ao 10", "1
 *  até 10", "1-10") ou combinação separada por vírgula/"e"/"ou" ("1, 2 e
 *  5", "1 a 5 e 10 a 15"), e "todos"/"tudo" pra lista inteira. Sempre separa
 *  por "e"/"ou" além de vírgula, pra não juntar dois números que a pessoa
 *  quis dizer separadamente (ex: "1 e 15" não pode virar o intervalo 1-15).
 *  Retorna os índices (0-based, sem duplicar, em ordem) ou [] se nada bater
 *  — nesse caso o chamador cai no parseFinanceChoice (data, "último" etc.)
 *  pra manter compatibilidade com o que já funcionava antes da seleção
 *  múltipla existir. */
export function parseFinanceChoiceMulti(
  text: string,
  candidates: Array<{ id: string; description: string; amount: number; date: string; category: string; mode: string }>
): number[] {
  // A pessoa pode reforçar a data depois dos números ("2 e 3 do dia
  // 07/09/2026"). A data é contexto, não parte do segundo índice.
  const t = text.trim().toLowerCase().replace(
    /\s+(?:(?:do|no)\s+dia|de\s+la\s+fecha|del\s+dia)\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s*$/,
    "",
  );
  if (/^(todos|todas|tudo|todo|all)$/.test(t)) return candidates.map((_, i) => i);

  const tokens = t.split(/\s*,\s*|\s+(?:e|y)\s+|\s+(?:ou|o)\s+/).map(s => s.trim()).filter(Boolean);
  const indices = new Set<number>();
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*(?:a|ao|al|até|ate|hasta|-)\s*(\d+)$/);
    if (rangeMatch) {
      let start = parseInt(rangeMatch[1], 10);
      let end = parseInt(rangeMatch[2], 10);
      if (start > end) [start, end] = [end, start];
      for (let n = start; n <= end; n++) {
        if (n >= 1 && n <= candidates.length) indices.add(n - 1);
      }
      continue;
    }
    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      if (n >= 1 && n <= candidates.length) indices.add(n - 1);
    }
  }
  return [...indices].sort((a, b) => a - b);
}

// Números por extenso em PT (BR/PT) e ES misturados no mesmo mapa — o
// parser não sabe o locale de quem está falando (parseAmountBR/slotMoney
// não recebem essa informação), então precisa reconhecer as duas línguas
// sempre. Onde as grafias coincidem (ex: "tres") o valor já é o mesmo nas
// duas línguas, então não há ambiguidade em compartilhar a entrada.
const WRITTEN_NUMBER_UNITS: Record<string, number> = {
  zero: 0, cero: 0,
  um: 1, uma: 1, uno: 1, una: 1,
  dois: 2, duas: 2, dos: 2,
  tres: 3,
  quatro: 4, cuatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7, siete: 7,
  oito: 8, ocho: 8,
  nove: 9, nueve: 9,
  dez: 10, diez: 10,
  onze: 11, once: 11,
  doze: 12, doce: 12,
  treze: 13, trece: 13,
  quatorze: 14, catorze: 14, catorce: 14,
  quinze: 15, quince: 15,
  dezesseis: 16, dezasseis: 16, dieciseis: 16,
  dezessete: 17, dezassete: 17, diecisiete: 17,
  dezoito: 18, dieciocho: 18,
  dezenove: 19, diecinueve: 19,
  vinte: 20, veinte: 20,
  // ES contrai "veinte y X" numa palavra só; PT já soma via "vinte e X".
  veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  trinta: 30, treinta: 30,
  quarenta: 40, cuarenta: 40,
  cinquenta: 50, cincuenta: 50,
  sessenta: 60, sesenta: 60,
  setenta: 70,
  oitenta: 80, ochenta: 80,
  noventa: 90,
  cem: 100, cento: 100, cien: 100, ciento: 100,
  duzentos: 200, doscientos: 200,
  trezentos: 300, trescientos: 300,
  quatrocentos: 400, cuatrocientos: 400,
  quinhentos: 500, quinientos: 500,
  seiscentos: 600, seiscientos: 600,
  setecentos: 700, setecientos: 700,
  oitocentos: 800, ochocientos: 800,
  novecentos: 900, novecientos: 900,
};

const WRITTEN_NUMBER_MULTIPLIERS: Record<string, number> = {
  mil: 1000,
  milhao: 1_000_000, milhoes: 1_000_000, millon: 1_000_000, millones: 1_000_000,
};

function tokenizeWords(text: string): string[] {
  return text.match(/[a-z]+/g) ?? [];
}

/** Soma uma sequência de palavras numéricas ("mil", "duzentos"/"doscientos",
 *  "e"/"y", "vinte"/"veinte") em um único valor. Ignora silenciosamente
 *  qualquer token desconhecido (ex: "reais", "pesos", "gastei") — é chamada
 *  só depois que não sobrou nenhum dígito no texto, então ser permissiva
 *  aqui não colide com números. */
function sumWrittenNumberTokens(tokens: string[]): { value: number; found: boolean } {
  let total = 0;
  let current = 0;
  let found = false;
  for (const tok of tokens) {
    if (tok === "e" || tok === "y") continue;
    if (tok in WRITTEN_NUMBER_UNITS) {
      current += WRITTEN_NUMBER_UNITS[tok];
      found = true;
    } else if (tok in WRITTEN_NUMBER_MULTIPLIERS) {
      total += (current || 1) * WRITTEN_NUMBER_MULTIPLIERS[tok];
      current = 0;
      found = true;
    }
  }
  return { value: total + current, found };
}

/** Interpreta um valor por extenso — PT ("quatrocentos reais", "mil e
 *  duzentos", "cem reais e cinquenta centavos") ou ES ("cuatrocientos
 *  pesos", "mil doscientos", "cien pesos con cincuenta centavos"). Só é
 *  chamada quando o texto não tem nenhum dígito — evita competir com o
 *  caminho numérico de parseAmountBR. */
function parseWrittenAmountBR(text: string): number | null {
  const normalized = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const tokens = tokenizeWords(normalized);
  const centavosIndex = tokens.findIndex(t => t === "centavo" || t === "centavos" || t === "centimo" || t === "centimos");

  let cents = 0;
  let mainTokens = tokens;
  if (centavosIndex > 0) {
    let start = centavosIndex;
    while (start > 0) {
      const prev = tokens[start - 1];
      if (prev in WRITTEN_NUMBER_UNITS || prev in WRITTEN_NUMBER_MULTIPLIERS || prev === "e" || prev === "y" || prev === "com") {
        start -= 1;
      } else {
        break;
      }
    }
    const centsResult = sumWrittenNumberTokens(tokens.slice(start, centavosIndex));
    if (centsResult.found) cents = centsResult.value;
    mainTokens = tokens.slice(0, start);
  }

  const mainResult = sumWrittenNumberTokens(mainTokens);
  if (!mainResult.found && cents === 0) return null;
  const value = mainResult.value + cents / 100;
  return value > 0 ? value : null;
}

/** Extrai um valor de um texto livre, em PT ou ES (ex: "80 reais", "R$ 80,50",
 *  "11 mil", "quatrocentos reais", "cem reais e cinquenta centavos",
 *  "cuatrocientos pesos", "cien pesos con cincuenta centavos"). Converte
 *  separador decimal BR (vírgula) e remove separador de milhar (ponto) antes
 *  de parsear. Sem nenhum dígito no texto, tenta interpretar o valor por
 *  extenso (não depende do locale do usuário — reconhece as duas línguas).
 *  Retorna null se não achar nada válido. */
export function parseAmountBR(text: string): number | null {
  const lower = text.toLowerCase();
  const milMatch = lower.match(/(\d+(?:,\d+)?)\s*mil\b/);
  if (milMatch) {
    const base = parseFloat(milMatch[1].replace(",", "."));
    if (!isNaN(base) && base > 0) return base * 1000;
  }
  const match = text.replace(/\./g, "").replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val > 0) return val;
    return null;
  }
  return parseWrittenAmountBR(text);
}

/** Interpreta a resposta do usuário como o NOVO VALOR de um lançamento já
 *  escolhido (etapa final de finance_edit, quando falta só o "o que mudar").
 *  Aceita valor, nome de categoria conhecida, modo pessoal/empresarial
 *  e/ou uma nova descrição ("descrição para X" / "nome para X"). Retorna um patch
 *  parcial — pode vir vazio se não reconhecer nada. */
export function parseFinancePatchFromText(text: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const t = text.trim();

  const descMatch = t.match(/(?:descri[çc][ãa]o|descripci[oó]n|nome|nombre)\s+(?:para|pra|por|a)\s+(.+)/i);
  if (descMatch) patch.description = descMatch[1].trim();

  const amount = parseAmountBR(t);
  if (amount !== null) patch.amount = amount;

  const lower = t.toLowerCase();
  const allCategories = [...CATEGORIES_EXPENSE, ...CATEGORIES_INCOME];
  const categoryAliases: Record<string, string> = {
    alimentacion: "Alimentação", vivienda: "Moradia", salud: "Saúde", educacion: "Educação",
    ocio: "Lazer", ropa: "Vestuário", tecnologia: "Tecnologia", servicios: "Serviços",
    impuestos: "Impostos", empleados: "Funcionários", proveedores: "Fornecedores", otros: "Outros",
    salario: "Salário", ventas: "Vendas", inversiones: "Investimentos", alquiler: "Aluguel",
  };
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const category = allCategories.find((c) => normalized.includes(c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
    || Object.entries(categoryAliases).find(([alias]) => normalized.includes(alias))?.[1];
  if (category) patch.category = category;

  const destinationMode = parseFinanceDestinationMode(t);
  if (destinationMode) patch.mode = destinationMode;

  return patch;
}

/** Interpreta a resposta do usuário como confirmação sim/não.
 *  Retorna true, false, ou null se não reconhecer a resposta. */
export function parseYesNo(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (/^(sim|s|ss|sí|si|isso|eso|pode|puede|hazlo|manda|envia|salva|guarda|claro|por supuesto|com certeza|quiero|quero|yes|y|ok|vale|beleza|manda ver)\b/.test(t)) return true;
  if (/^(n[ãa]o|nao|n|não quero|nunca|no)\b/.test(t)) return false;
  return null;
}

/** Interpreta a resposta ao aviso de recorrente vencida. `null` significa que
 * a pessoa ignorou a pergunta e enviou outro comando, que deve seguir pelo
 * fluxo normal em vez de ficar preso nesta confirmação. */
export function parseRecurringConfirmationAnswer(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (/^(?:sim|s|s[ií]|foi|j[aá]\s+(?:paguei|recebi)|paguei|recebi|yes|pago|recebido|ok)\b/.test(t)) return true;
  if (/^(?:n|não|nao|no|ainda não|ainda nao|não paguei|nao paguei)\s*[.!?]*$/.test(t)) return false;
  return null;
}

/** Interpreta a resposta do usuário como escolha de veículo.
 *  Aceita: "1", "2", nome do modelo, nome da marca. Retorna índice (0-based) ou -1. */
export function parseVehicleChoice(
  text: string,
  vehicles: Array<{ id: string; brand: string; model: string; year: number; plate?: string }>
): number {
  const byLabel = choiceIndexByLabels(text, vehicles, v => [v.model, v.brand, v.plate || "", `${v.brand} ${v.model}`]);
  if (byLabel >= 0) return byLabel;
  const compact = text.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return vehicles.findIndex(v => Boolean(v.plate) && v.plate!.replace(/[^a-z0-9]/gi, "").toLowerCase() === compact);
}

/** Interpreta a resposta à pergunta "o que deseja alterar?" sem precisar
 * chamar novamente o classificador. Só aceita campos reconhecidos para não
 * transformar uma mensagem qualquer em atualização de veículo. */
export function parseVehiclePatchFromText(text: string): VehicleUpdateInput {
  const patch: VehicleUpdateInput = {};
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const plate = text.match(/\b(?:placa)(?:\s+(?:para|pra|por|a|é|es|e|:))?\s*([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}[- ]?\d{4})\b/i)?.[1];
  if (plate) patch.plate = plate.replace(/[- ]/g, "").toUpperCase();

  const brand = text.match(/\bmarca(?:\s+(?:para|pra|por|a|é|es|e|:))?\s+([^,;]+)$/i)?.[1]?.trim();
  if (brand) patch.brand = brand;

  const model = text.match(/\bmodelo(?:\s+(?:para|pra|por|a|é|es|e|:))?\s+([^,;]+)$/i)?.[1]?.trim();
  if (model) patch.model = model;

  const year = text.match(/\b(?:ano|a[ñn]o)(?:\s+(?:para|pra|por|a|é|es|e|:))?\s+((?:19|20)\d{2})\b/i)?.[1];
  if (year) patch.year = Number(year);

  const km = text.match(/\b(?:km|quilometragem|kilometraje|hod[oô]metro|od[oó]metro)(?:\s+(?:para|pra|por|a|é|es|e|:))?\s+([\d.]+)\b/i)?.[1];
  if (km) patch.currentKm = Number(km.replace(/\./g, ""));

  const notes = text.match(/\b(?:nota|notas|observa[çc][ãa]o|observa[çc][õo]es|observaci[oó]n|observaciones)(?:\s+(?:para|pra|por|a|é|es|e|:))?\s+(.+)$/i)?.[1]?.trim();
  if (notes) patch.notes = notes;

  if (/\b(?:eletric[oa]|electric[oa])\b/.test(normalized)) patch.fuelType = "electric";
  else if (/\bdiesel\b/.test(normalized)) patch.fuelType = "diesel";
  else if (/\betanol|alcool|alcohol\b/.test(normalized)) patch.fuelType = "ethanol";
  else if (/\bgasolina\b/.test(normalized)) patch.fuelType = "gasoline";
  else if (/\bflex\b/.test(normalized)) patch.fuelType = "flex";

  if (/\b(modo\s+)?empresa|empresarial\b/.test(normalized)) patch.mode = "business";
  else if (/\b(modo\s+)?(?:pessoal|personal)\b/.test(normalized)) patch.mode = "personal";

  return patch;
}
