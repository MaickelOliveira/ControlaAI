import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./whatsapp-config";
import { nowBR, nowISOBR, todayStrBR, weekBoundsBR } from "./date-br";
import type { UserMode, User } from "./users";
import { CATEGORIES_EXPENSE, CATEGORIES_INCOME } from "./finances";
import { GROCERY_CATEGORIES, type GroceryCategory } from "./grocery";

export type Intent =
  | "finance_register"
  | "finance_query"
  | "finance_upcoming"
  | "finance_edit"
  | "finance_delete"
  | "finance_analysis"
  | "daily_summary"
  | "weekly_summary"
  | "task_create"
  | "task_update"
  | "task_query"
  | "task_delete"
  | "reminder_set"
  | "reminder_list"
  | "reminder_update"
  | "reminder_delete"
  | "mode_switch"
  | "balance_query"
  | "goal_create"
  | "goal_add"
  | "goal_query"
  | "goal_complete"
  | "goal_cancel"
  | "vehicle_create"
  | "vehicle_update"
  | "vehicle_delete"
  | "vehicle_expense"
  | "vehicle_query"
  | "recurring_create"
  | "recurring_query"
  | "recurring_cancel"
  | "recurring_edit"
  | "drive_search"
  | "drive_rename"
  | "agenda_create"
  | "agenda_list"
  | "agenda_update"
  | "agenda_delete"
  | "agenda_add_meet"
  | "agenda_done"
  | "meet_create"
  | "finance_detail"
  | "finance_confirm_pending"
  | "grocery_list_add"
  | "grocery_list_show"
  | "grocery_list_check"
  | "grocery_list_clear"
  | "grocery_list_remove"
  | "grocery_list_edit"
  | "grocery_purchase"
  | "grocery_purchase_finish"
  | "grocery_list_generate"
  | "grocery_price_compare"
  | "grocery_store_ranking"
  | "grocery_history_query"
  | "grocery_last_purchase_query"
  | "grocery_spend_query"
  | "employee_create"
  | "employee_list"
  | "employee_update"
  | "employee_deactivate"
  | "customer_create"
  | "customer_list"
  | "customer_query"
  | "customer_update"
  | "customer_deactivate"
  | "how_to"
  | "help"
  | "category_create"
  | "finance_clear_history"
  | "unknown";

export type GoalData = {
  title: string;
  targetAmount: number;
  currentAmount?: number;
  deadline?: string;
  category?: string;
  mode?: "personal" | "business"; // detectado automaticamente
};

export type VehicleData = {
  name?: string;
  plate?: string;
  brand?: string;
  model?: string;
  year?: number;
  fuelType?: "gasoline" | "ethanol" | "diesel" | "electric" | "flex";
  currentKm?: number;
  notes?: string;
  /** Novo modo solicitado numa alteração; "mode" identifica o contexto atual. */
  newMode?: "personal" | "business";
  expenseType?: "fuel" | "maintenance" | "insurance" | "tax" | "other";
  amount?: number;
  km?: number;
  description?: string;
  mode?: "personal" | "business"; // detectado automaticamente
};

export type FinanceData = {
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
  mode?: "personal" | "business"; // detectado automaticamente
  accountHint?: string; // nome da conta/cartão mencionado, ex: "no Nubank", "cartão Inter" — ausente = usa a conta padrão
  // true SE E SOMENTE SE a mensagem indicar explicitamente que o valor
  // ainda NÃO foi recebido/pago de fato (é uma expectativa, não algo que já
  // aconteceu) — ver REGRA "A RECEBER"/PENDENTE abaixo. Sem essa indicação
  // explícita, NÃO inclua o campo.
  pending?: boolean;
};

export type AccountData = {
  name?: string; // nome dado pelo usuário, ex: "Nubank", "Cartão Inter"
  type?: "bank" | "credit_card";
  creditLimit?: number; // só faz sentido em credit_card
  closingDay?: number; // só faz sentido em credit_card — dia do mês (1-28) em que a fatura fecha
  dueDay?: number; // só faz sentido em credit_card — dia do mês (1-28) em que a fatura vence
  mode?: "personal" | "business"; // detectado automaticamente
};

export type TaskData = {
  title: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  taskNumber?: number;
  newStatus?: "pending" | "in_progress" | "completed";
  newTitle?: string;
  newDueDate?: string;
  newPriority?: "low" | "medium" | "high";
  clearDueDate?: boolean;
  mode?: "personal" | "business"; // detectado automaticamente
};

export type ReminderData = {
  // obrigatórios em reminder_set; em reminder_update só os campos que mudaram
  message?: string;
  scheduledAt?: string;
  repeat?: "none" | "daily" | "weekly" | "monthly";
  mode?: "personal" | "business"; // detectado automaticamente
  recipientName?: string; // nome de quem deve RECEBER o lembrete, se não for pra quem está pedindo (ex: "Milena", "equipe", "cliente Carlos") — ausente = lembrete pra quem está mandando a mensagem
  recipientPhone?: string; // telefone explícito citado na mensagem pra essa pessoa (só dígitos) — permite lembrete pra alguém NÃO cadastrado como cliente/funcionário/número da família
};

export type MeetData = {
  title?: string;
  description?: string;
  startDate?: string;   // "YYYY-MM-DD" horário SP
  startTime?: string;   // "HH:MM" horário SP
  endDate?: string;
  endTime?: string;
  duration?: number;    // minutos (default 60)
  attendees?: Array<{ name: string; phone?: string; email?: string }>;
};

export type AgendaData = {
  title?: string;
  description?: string;
  location?: string;
  startDate?: string;   // "YYYY-MM-DD" horário SP
  startTime?: string;   // "HH:MM" horário SP
  endDate?: string;
  endTime?: string;
  allDay?: boolean;
  repeat?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  /** Pedido explícito como "me avisa uma hora antes". O handler também
   *  preenche este campo deterministicamente para não depender da IA. */
  reminderMinutesBefore?: number;
};

export type RecurringData = {
  type: "income" | "expense";
  description: string;
  amount: number;
  totalAmount?: number;
  totalInstallments?: number;
  /** true SÓ quando o usuário disser explicitamente que não tem fim ("para
   *  sempre", "vitalício", "sem prazo") — evita perguntar de novo o que já
   *  foi dito. Ausente/false não significa "com prazo", só "não afirmado". */
  lifetime?: boolean;
  recurrenceType: "installment" | "recurring";
  repeatUnit: "monthly" | "weekly" | "daily" | "yearly";
  dayOfMonth?: number;
  startDate?: string;
  category?: string;
  mode?: "personal" | "business"; // detectado automaticamente
  /** true quando a mensagem é sobre PAGAR um funcionário já existente (não
   *  cadastrar um novo — isso é employee_create). O sistema pergunta qual
   *  funcionário antes de criar o recorrente, pra vincular o lançamento a
   *  ele em vez de ficar com descrição genérica "Funcionário". */
  employeePayment?: boolean;
  /** nome do funcionário, se a mensagem já disser (ex: "pago a Ana 2000") */
  employeeName?: string;
};

export type GroceryItemData = {
  productName: string;
  category?: GroceryCategory;
  price?: number;
  quantity?: number;
  unit?: string;
};

export type GroceryData = {
  storeName?: string;
  date?: string;
  items?: GroceryItemData[];
  /** grocery_list_add/grocery_list_check: nomes de itens da lista envolvidos */
  itemNames?: string[];
  /** grocery_list_edit: novo nome, quantidade ou categoria do item. O item
   * original fica em itemNames[0]. */
  newProductName?: string;
  newQuantity?: string;
  newCategory?: GroceryCategory;
  /** grocery_list_add a partir de modelo pronto — chave de LIST_TEMPLATES
   *  (ex: "mercearia", "carnes", "hortifruti", "laticinios", "padaria", "bebidas", "higiene", "limpeza") */
  template?: string;
  /** grocery_list_generate: categorias pedidas (chaves de LIST_TEMPLATES) — vazio/omitido gera de todas */
  categories?: string[];
  /** grocery_purchase_finish: valor total dito pelo usuário, se vier na mesma frase */
  total?: number;
  /** grocery_price_compare: produto específico perguntado (ex: "detergente") */
  productName?: string;
  /** grocery_history_query: categoria perguntada (ex: "quais carnes comprei")
   *  — nome de categoria de verdade (uma de GROCERY_CATEGORIES), diferente
   *  de "categories" acima (que são chaves de template) */
  category?: string;
  /** grocery_history_query: período perguntado, mesmo padrão de FinanceData.period
   *  — SEMPRE usar os valores pré-calculados do início da mensagem, nunca calcular */
  period?: { from?: string; to?: string };
  /** grocery_last_purchase_query: controla se a resposta mostra apenas o
   * total ou também todos os itens da compra mais recente. */
  queryDetail?: "total" | "items";
  /** grocery_history_query: permite buscar todo o histórico em vez de cair
   * no mês atual quando nenhum período foi mencionado. */
  allHistory?: boolean;
  /** grocery_history_query: quantidade e deslocamento no histórico já
   * ordenado do mais recente para o mais antigo. Ex.: penúltima = 1/1. */
  purchaseLimit?: number;
  purchaseOffset?: number;
};

export type EmployeeData = {
  name?: string;
  newName?: string;
  role?: string;
  salary?: number;
  startDate?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

export type CustomerData = {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  address?: string;
  notes?: string;
};

export type AIResult = {
  intent: Intent;
  finance?: FinanceData;
  finances?: FinanceData[]; // múltiplos lançamentos de uma vez
  task?: TaskData;
  reminder?: ReminderData;
  goal?: GoalData;
  vehicle?: VehicleData;
  recurring?: RecurringData;
  agendaData?: AgendaData;
  meetData?: MeetData;
  grocery?: GroceryData;
  account?: AccountData;
  employee?: EmployeeData;
  customer?: CustomerData;
  mode?: UserMode;
  financeType?: "income" | "expense"; // para finance_detail/finance_query/finance_upcoming: qual tipo mostrar (padrão "expense"); para category_create: restringe a categoria a só esse tipo (padrão: ambos)
  keyword?: string; // palavra-chave para buscar lançamento em finance_edit/finance_delete/recurring_cancel/recurring_edit/drive_search/agenda_update/agenda_delete
  personName?: string; // nome OU vínculo (ex: "esposa", "filho") de uma pessoa específica mencionada em finance_query/balance_query/finance_detail (ex: "quanto a Ana gastou", "quanto minha esposa gastou")
  category?: string; // categoria específica perguntada em finance_query/balance_query (ex: "quanto gastei com comida" → "Alimentação")
  newDescription?: string; // finance_edit: novo texto da descrição, quando o usuário quer RENOMEAR o lançamento. Distinto de finance.description, que ecoa o lançamento encontrado e serve de busca.
  period?: { from?: string; to?: string }; // intervalo de datas (YYYY-MM-DD) para finance_query/finance_upcoming/balance_query/finance_detail/finance_analysis quando o período não é o mês atual (ex: "mês passado", "semana passada")
  response?: string; // resposta direta para how_to
  // finance_edit/finance_delete: true quando o pedido é sobre o(s)
  // lançamento(s) que acabaram de ser registrados (mensagem curta, sem
  // citar descrição/keyword específico — ex: "tá errado, são despesas",
  // "apaga esses lançamentos"), pra aplicar em TODOS eles de uma vez (1 ou
  // vários) em vez de buscar/escolher um por um.
  bulkCorrectLastBatch?: boolean;
  categoryName?: string; // category_create: nome exato da categoria a criar
  confidence: number;
};

export type AiContext = {
  user: Pick<User, "activeMode" | "customCategoriesExpense" | "customCategoriesIncome" | "locale">;
  // Últimas mensagens da conversa (mais antiga primeiro), sem incluir a
  // mensagem atual — dá ao classificador memória de curto prazo pra
  // resolver respostas curtas que só fazem sentido junto da pergunta
  // anterior (ex: bot pergunta "qual tipo de pessoa?" e o usuário responde
  // só "participante"). Sem isso o classificador trata cada mensagem como
  // se fosse a primeira da conversa.
  history?: { role: "user" | "assistant"; content: string }[];
};

// Instrução curta de idioma/tom — usada tanto no classificador (volátil, pra
// ele entender vocabulário regional na mensagem recebida) quanto nas funções
// que geram texto de verdade pro usuário (generateAnalysisResponse,
// generateMeetAta). "pt-BR" não precisa de instrução extra — é o padrão em
// que todo o resto do prompt já está escrito.
function localeInstruction(locale?: string): string {
  if (locale === "es") {
    return "El usuario habla español. Responde SIEMPRE en español latinoamericano neutro — usa \"ustedes\" (nunca \"vosotros\"), \"dinero\"/\"efectivo\" (nunca \"plata\"/\"lana\"), \"computadora\" (no \"ordenador\"), \"celular\" (no \"móvil\"), evita modismos de un país específico.";
  }
  if (locale === "pt-PT") {
    return "O utilizador fala português europeu. Responde SEMPRE em português de Portugal — \"telemóvel\" (não \"celular\"), \"pequeno-almoço\" (não \"café da manhã\"), \"fatura\" (não \"boleto\"), construções como \"estou a fazer\" (não \"estou fazendo\").";
  }
  return "";
}

function normalizeCapabilityText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

type DatePeriod = { from: string; to: string };

/** Resolve períodos relativos no próprio sistema, sempre a partir do relógio
 * de São Paulo. Assim consultas não dependem de a IA calcular corretamente
 * expressões como "semana que vem" ou "mês passado". */
export function getExplicitRelativePeriod(message: string, anchor: Date = nowBR()): DatePeriod | null {
  const normalized = normalizeCapabilityText(message.trim());
  const pad = (part: number) => String(part).padStart(2, "0");
  const toYmd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const shiftDate = (date: Date, days: number) => {
    const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
    shifted.setDate(shifted.getDate() + days);
    return shifted;
  };
  const shiftYmd = (value: string, days: number) => {
    const [year, month, day] = value.split("-").map(Number);
    return toYmd(shiftDate(new Date(year, month - 1, day, 12, 0, 0), days));
  };
  const monthBounds = (offset: number): DatePeriod => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1, 12, 0, 0);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + offset + 1, 0, 12, 0, 0);
    return { from: toYmd(first), to: toYmd(last) };
  };
  const [weekFrom, weekTo] = weekBoundsBR(anchor);

  if (/\bproxima\s+semana\b|\bsemana\s+(?:que\s+vem|seguinte|que\s+viene|siguiente)\b/.test(normalized)) {
    return { from: shiftYmd(weekFrom, 7), to: shiftYmd(weekTo, 7) };
  }
  if (/\bultima\s+semana\b|\bsemana\s+(?:passada|anterior|pasada)\b/.test(normalized)) {
    return { from: shiftYmd(weekFrom, -7), to: shiftYmd(weekTo, -7) };
  }
  if (/\b(?:esta|essa|nesta|nessa|desta|atual)\s+semana\b|\bsemana\s+atual\b|\bna\s+semana\b/.test(normalized)) {
    return { from: weekFrom, to: weekTo };
  }
  if (/\bproximo\s+mes\b|\bmes\s+(?:que\s+vem|seguinte|que\s+viene|siguiente)\b/.test(normalized)) return monthBounds(1);
  if (/\bultimo\s+mes\b|\bmes\s+(?:passado|anterior|pasado)\b/.test(normalized)) return monthBounds(-1);
  if (/\b(?:este|esse|neste|nesse|deste|atual)\s+mes\b|\bmes\s+atual\b/.test(normalized)) return monthBounds(0);

  if (/\b(?:ano\s+que\s+vem|proximo\s+ano|ano\s+siguiente)\b/.test(normalized)) {
    const year = anchor.getFullYear() + 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  if (/\b(?:ano\s+passado|ultimo\s+ano|ano\s+anterior|ano\s+pasado)\b/.test(normalized)) {
    const year = anchor.getFullYear() - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  if (/\b(?:este|esse|neste|nesse|deste|atual)\s+ano\b|\bano\s+atual\b/.test(normalized)) {
    return { from: `${anchor.getFullYear()}-01-01`, to: toYmd(anchor) };
  }

  const rollingDays = normalized.match(/\bultim(?:os|as)\s+(7|30)\s+dias\b/);
  if (rollingDays) {
    const days = Number(rollingDays[1]);
    return { from: toYmd(shiftDate(anchor, -(days - 1))), to: toYmd(anchor) };
  }
  if (/\bamanha\b|\bmanana\b/.test(normalized)) {
    const tomorrow = toYmd(shiftDate(anchor, 1));
    return { from: tomorrow, to: tomorrow };
  }
  if (/\bontem\b|\bayer\b/.test(normalized)) {
    const yesterday = toYmd(shiftDate(anchor, -1));
    return { from: yesterday, to: yesterday };
  }
  if (/\bhoje\b|\bhoy\b/.test(normalized)) {
    const today = toYmd(anchor);
    return { from: today, to: today };
  }
  return null;
}

function withExplicitRelativePeriod(message: string, result: AIResult, anchor: Date = nowBR()): AIResult {
  const groceryIntent = result.intent === "grocery_history_query" || result.intent === "grocery_spend_query";
  const period = getExplicitRelativePeriod(message, anchor)
    ?? (groceryIntent ? explicitPurchaseCalendarPeriod(message, anchor) : null);
  if (!period) return result;
  if (groceryIntent) {
    return { ...result, grocery: { ...(result.grocery ?? {}), period } };
  }
  const periodIntents: Intent[] = [
    "finance_query", "finance_upcoming", "daily_summary", "weekly_summary",
    "balance_query", "finance_detail", "finance_analysis",
  ];
  return periodIntents.includes(result.intent) ? { ...result, period } : result;
}

/** Atalho determinístico para perguntas sobre contas futuras. Essa intenção
 * precisa vencer o resumo financeiro genérico: "quais despesas vou pagar"
 * pede uma lista de vencimentos, não quanto já entrou e saiu. Inclui as
 * formas equivalentes em espanhol porque o mesmo classificador atende os
 * três idiomas da plataforma. */
export function getExplicitUpcomingFinanceQueryResult(message: string): AIResult | null {
  const normalized = normalizeCapabilityText(message.trim());
  const hasFinancialSubject = /\b(contas?|despesas?|gastos?|boletos?|parcelas?|pagamentos?|receitas?|recebimentos?|cobrancas?|cuentas?|facturas?|cuotas?|pagos?|ingresos?|cobros?)\b/.test(normalized);
  const hasUpcomingSignal = /\bproxim[oa]s?\b|\b(a|por)\s+pagar\b|\b(a\s+receber|por\s+cobrar)\b|\bpendentes?\b|\bpendientes?\b|\bvenc\w*/.test(normalized);
  const hasQuerySignal = /\b(quais?|quanto|quantas?|o\s+que|liste|listar|mostre|mostrar|tenho|minhas?|meus?|cuales?|cuanto|cuantas?|que|lista|listar|muestra|mostrar|tengo|mis)\b/.test(normalized);
  const isMutation = /\b(registr|cadastr|agend|anot|cri[ae]|adicion|inclu|cancel|apag|exclu|delet|edit|alter|corrig|paguei|recebi|recibi)\w*/.test(normalized);
  // Períodos mais específicos precisam passar pelo classificador completo,
  // que recebe do sistema as datas exatas de "semana que vem", "amanhã",
  // "mês passado" etc. O atalho cobre o caso comum do mês atual sem inventar
  // datas por conta própria.
  const hasSpecificPeriod = /\b(hoje|amanha|ontem|semana|proximo\s+mes|mes\s+que\s+vem|mes\s+passado|ano|hoy|manana|ayer|proximo\s+mes|mes\s+pasado)\b/.test(normalized);

  if (!hasFinancialSubject || !hasUpcomingSignal || !hasQuerySignal || isMutation || hasSpecificPeriod) return null;

  const financeType: "income" | "expense" = /\b(receitas?|recebimentos?|ingresos?|cobros?)\b|\ba\s+receber\b|\bpor\s+cobrar\b/.test(normalized)
    ? "income"
    : "expense";
  const mode: UserMode | undefined = /\b(empresa|empresarial|negocio)\b/.test(normalized)
    ? "business"
    : /\b(pessoal|personal)\b/.test(normalized)
      ? "personal"
      : undefined;

  return {
    intent: "finance_upcoming",
    confidence: 1,
    financeType,
    ...(mode ? { mode } : {}),
  };
}

/** Reconhece os comandos cotidianos de adicionar itens à lista sem depender
 * da variação do modelo externo. O fluxo aceita português e espanhol e deixa
 * perguntas sobre a lista ("o que tem na lista?") seguirem para a intenção
 * de consulta normal. */
export function getExplicitGroceryListAddResult(message: string): AIResult | null {
  const text = message.trim();
  const normalized = normalizeCapabilityText(text);
  const action = /^(?:(?:por\s+favor|por\s+favor,|quero|pode|preciso|quiero|puedes?)\s+)?(?:adicione|adiciona|adicionar|coloque|coloca|poe|ponha|bota|inclua|inclui|agrega|agregue|anade|pon|criar|crie|crear|crea)\b/i;
  const listTarget = /\blista\b.*\b(compras?|supermercado|mercado)\b|\blista\b\s*$/i;
  if (!action.test(normalized) || !listTarget.test(normalized)) return null;

  const templateAliases: Array<[RegExp, string]> = [
    [/\b(?:mercearia|abarrotes)\b/, "mercearia"],
    [/\bcarnes?\b/, "carnes"],
    [/\b(?:hortifruti|frutas?\s+e\s+verduras?|frutas?\s+y\s+verduras?)\b/, "hortifruti"],
    [/\b(?:laticinios|lacteos)\b/, "laticinios"],
    [/\b(?:padaria|panaderia)\b/, "padaria"],
    [/\bbebidas?\b/, "bebidas"],
    [/\b(?:higiene|aseo)\b/, "higiene"],
    [/\b(?:limpeza|limpieza)\b/, "limpeza"],
  ];
  const asksForReadyList = /\b(?:a|uma|la|una)\s+lista\s+(?:de|da|do)\b/.test(normalized);
  if (asksForReadyList) {
    const template = templateAliases.find(([pattern]) => pattern.test(normalized))?.[1];
    if (template) return { intent: "grocery_list_add", confidence: 1, grocery: { template } };
  }

  const verb = "(?:adicione|adiciona|adicionar|coloque|coloca|põe|poe|ponha|bota|inclua|inclui|agrega|agregue|añade|anade|pon)";
  const beforeList = text.match(new RegExp(`${verb}\\s+(.+?)\\s+(?:na|à|a)\\s+(?:minha\\s+|mi\\s+)?lista(?:\\s+(?:de|do|da|del)\\s+(?:compras?|supermercado|mercado))?`, "i"))?.[1];
  const afterList = text.match(new RegExp(`${verb}\\s+(?:na|à|a)\\s+(?:minha\\s+|mi\\s+)?lista(?:\\s+(?:de|do|da|del)\\s+(?:compras?|supermercado|mercado))?[:,]?\\s+(.+)$`, "i"))?.[1];
  const createdList = text.match(/(?:criar|crie|crear|crea)\s+(?:(?:uma|a|una|la)\s+)?lista(?:\s+(?:(?:de|do|da|del)\s+)?(?:compras?|supermercado|mercado))?\s+(?:com|con)\s+(.+)$/i)?.[1];
  const rawItems = (beforeList || afterList || createdList || "").trim().replace(/[\\]+$/, "").trim();
  if (!rawItems) return null;

  const inferCategory = (productName: string): GroceryCategory | undefined => {
    const product = normalizeCapabilityText(productName);
    const groups: Array<[GroceryCategory, RegExp]> = [
      ["Mercearia", /\b(arroz|arrozes|feijao|feijoes|oleos?|acucar|sal|macarrao|massas?|farinhas?|cafes?|molhos?|azeite|aveia|granola|rice|frijoles?|aceite|azucar|harina)\b/],
      ["Carnes", /\b(carnes?|frangos?|peixes?|linguicas?|bacon|presunto|picanha|alcatra|bife|pollo|pescado|chorizo|jamon)\b/],
      ["Hortifruti", /\b(bananas?|macas?|laranjas?|mamao|abacate|limao|tomates?|cebolas?|alho|batatas?|cenouras?|alface|pepino|frutas?|verduras?|manzana|naranja|papa|zanahoria|lechuga)\b/],
      ["Laticínios", /\b(leites?|queijos?|iogurtes?|manteiga|requeijao|creme\s+de\s+leite|mussarela|mucarela|leche|queso|yogur|mantequilla)\b/],
      ["Padaria", /\b(pao|paes|pao\s+de\s+forma|bolachas?|biscoitos?|torradas?|pan|galletas?)\b/],
      ["Bebidas", /\b(agua|refrigerantes?|sucos?|cervejas?|vinhos?|refresco|jugo|bebidas?)\b/],
      ["Limpeza", /\b(detergentes?|sabao|desinfetantes?|agua\s+sanitaria|amaciante|inseticida|esponjas?|limpeza|jabon|cloro|limpieza)\b/],
      ["Higiene", /\b(shampoo|condicionador|sabonetes?|cotonetes?|pasta\s+de\s+dente|papel\s+higienico|desodorantes?|champu|cepillo\s+dental|higiene)\b/],
    ];
    return groups.find(([, pattern]) => pattern.test(product))?.[0];
  };

  const explicitlySeparated = /,|\s+(?:e|y)\s+/i.test(rawItems);
  const knownItemPattern = /\b(p[ãa]o\s+de\s+forma|creme\s+de\s+leite|papel\s+higi[eê]nico|pasta\s+de\s+dente|[áa]gua\s+sanit[áa]ria|amaciante|cotonetes?|inseticida|tomada|alface|mussarela|mu[çc]arela|arroz|feij[ãa]o|leites?|queijos?|detergentes?|sabonetes?|bananas?|tomates?|cebolas?|batatas?|frangos?|carnes?|caf[eé]s?)\b/gi;
  const knownItems = [...rawItems.matchAll(knownItemPattern)].map(match => match[0]);
  const splitItems = explicitlySeparated
    ? rawItems.split(/\s*,\s*|\s+(?:e|y)\s+/i)
    : knownItems.length > 1
      ? knownItems
      : [rawItems];

  const items = splitItems
    .map(raw => raw.trim().replace(/^(?:o|a|os|as|um|uma|el|la|los|las|un|una)\s+/i, ""))
    .filter(Boolean)
    .map(raw => {
      const quantityMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
      const productName = quantityMatch ? quantityMatch[2].trim() : raw;
      const category = inferCategory(productName);
      return {
        productName,
        ...(quantityMatch ? { quantity: Number(quantityMatch[1].replace(",", ".")) } : {}),
        ...(category ? { category } : {}),
      };
    });
  if (!items.length) return null;

  return { intent: "grocery_list_add", confidence: 1, grocery: { items } };
}

/** Comandos operacionais da lista não devem cair no fallback conversacional:
 * cada resultado abaixo corresponde a uma ação real no banco. */
export function getExplicitGroceryListManagementResult(message: string): AIResult | null {
  const text = message.trim().replace(/[\\]+$/, "").trim();
  const normalized = normalizeCapabilityText(text);
  const mentionsList = /\blista\b.*\b(compras?|supermercado|mercado|whatsapp)\b|\b(?:minha|mi)\s+lista\b|\blista\s+(?:inteira|completa)\b|\blista\s*$/.test(normalized);
  if (!mentionsList) return null;

  const clearList = /\b(?:limp\w*|esvazi\w*|vaci\w*)\s+(?:(?:toda|inteira|completa)\s+)?(?:(?:a|la)\s+)?(?:(?:minha|mi)\s+)?lista\b/.test(normalized)
    || /\b(?:apague|apagar|exclua|excluir|delete|deletar|elimine|eliminar|borre|borrar|remova|remover)\s+(?:toda\s+|todos\s+os\s+itens\s+(?:da|de\s+la)\s+)?(?:(?:a|la)\s+)?(?:(?:minha|mi)\s+)?lista\b/.test(normalized);
  if (clearList) return { intent: "grocery_list_clear", confidence: 1 };

  const cleanItemName = (value: string) => value
    .trim()
    .replace(/[.!?;:]+$/, "")
    .replace(/^(?:o|a|os|as|um|uma|el|la|los|las|un|una)\s+/i, "")
    .trim();
  const withoutListSuffix = (value: string) => value
    .replace(/\s+(?:na|da|de|do|del|en\s+la)\s+(?:(?:minha|mi)\s+)?lista(?:\s+(?:de|do|da|del)\s+(?:compras?|supermercado|mercado))?.*$/i, "")
    .trim();

  const editVerb = "(?:altere|alterar|mude|mudar|troque|trocar|renomeie|renomear|edite|editar|cambie|cambiar|cambia)";
  const quantityEdit = text.match(new RegExp(`${editVerb}\\s+(?:(?:a|la)\\s+)?(?:quantidade|cantidad)\\s+(?:do|da|de|del)\\s+(.+?)\\s+(?:para|por|a)\\s+(.+)$`, "i"));
  if (quantityEdit) {
    const target = cleanItemName(withoutListSuffix(quantityEdit[1]));
    const quantity = cleanItemName(withoutListSuffix(quantityEdit[2]));
    if (target && quantity) {
      return { intent: "grocery_list_edit", confidence: 1, grocery: { itemNames: [target], newQuantity: quantity } };
    }
  }

  const categoryEdit = text.match(new RegExp(`${editVerb}\\s+(?:(?:a|la)\\s+)?categoria\\s+(?:do|da|de|del)\\s+(.+?)\\s+(?:para|por|a)\\s+(.+)$`, "i"));
  if (categoryEdit) {
    const target = cleanItemName(withoutListSuffix(categoryEdit[1]));
    const requestedCategory = normalizeCapabilityText(withoutListSuffix(categoryEdit[2]));
    const categoryAliases: Array<[GroceryCategory, RegExp]> = [
      ["Mercearia", /\b(mercearia|abarrotes)\b/], ["Carnes", /\bcarnes?\b/],
      ["Hortifruti", /\b(hortifruti|frutas?\s+e\s+legumes|frutas?\s+y\s+verduras)\b/],
      ["Laticínios", /\b(laticinios|lacteos)\b/], ["Padaria", /\b(padaria|panaderia)\b/],
      ["Bebidas", /\bbebidas?\b/], ["Higiene", /\bhigiene\b/],
      ["Limpeza", /\b(limpeza|limpieza)\b/], ["Outros", /\b(outros|otros)\b/],
    ];
    const category = categoryAliases.find(([, pattern]) => pattern.test(requestedCategory))?.[0];
    if (target && category) {
      return { intent: "grocery_list_edit", confidence: 1, grocery: { itemNames: [target], newCategory: category } };
    }
  }

  const renameEdit = text.match(new RegExp(`${editVerb}\\s+(?:(?:o|a|el|la)\\s+)?(?:item|produto|producto)?\\s*(.+?)\\s+(?:para|por)\\s+(.+)$`, "i"));
  if (renameEdit) {
    const target = cleanItemName(withoutListSuffix(renameEdit[1]));
    const replacement = cleanItemName(withoutListSuffix(renameEdit[2]));
    if (target && replacement) {
      return /^\d/.test(replacement)
        ? { intent: "grocery_list_edit", confidence: 1, grocery: { itemNames: [target], newQuantity: replacement } }
        : { intent: "grocery_list_edit", confidence: 1, grocery: { itemNames: [target], newProductName: replacement } };
    }
  }

  const removeVerb = "(?:remova|remover|remove|exclua|excluir|delete|deletar|apague|apagar|tire|tirar|elimine|eliminar|elimina|borre|borrar)";
  const beforeList = text.match(new RegExp(`${removeVerb}\\s+(.+?)\\s+(?:da|de|do|del)\\s+(?:(?:minha|mi)\\s+)?lista(?:\\s+(?:de|do|da|del)\\s+(?:compras?|supermercado|mercado))?`, "i"))?.[1];
  const afterList = text.match(new RegExp(`${removeVerb}\\s+(?:da|de|do|del)\\s+(?:(?:minha|mi)\\s+)?lista(?:\\s+(?:de|do|da|del)\\s+(?:compras?|supermercado|mercado))?[:,]?\\s+(.+)$`, "i"))?.[1];
  const rawRemovedItems = beforeList || afterList;
  if (rawRemovedItems) {
    const itemNames = rawRemovedItems.split(/\s*,\s*|\s+(?:e|y)\s+/i).map(cleanItemName).filter(Boolean);
    if (itemNames.length) return { intent: "grocery_list_remove", confidence: 1, grocery: { itemNames } };
  }

  const showList = /^(?:(?:por\s+favor[, ]*|pode\s+|puedes?\s+)?(?:mostre|mostrar|mostra|mande|mandar|envie|enviar|me\s+(?:manda|mande|envie|mostre|muestra|ensena)|muestra|mostrar|ensena|quiero\s+ver|quero\s+ver|qual|quais|o\s+que\s+tem|que\s+tem|como\s+esta)|(?:minha|mi)\s+lista|lista\s+(?:de|do|da|del)\s+(?:compras?|supermercado|mercado))\b/.test(normalized)
    || /\bo\s+que\s+(?:falta|preciso)\s+comprar\b|\bque\s+(?:falta|necesito)\s+comprar\b/.test(normalized);
  return showList ? { intent: "grocery_list_show", confidence: 1 } : null;
}

/** Consulta direta da compra mais recente em um mercado específico. Evita
 * responder com o gasto acumulado quando a pessoa pergunta "a última vez". */
export function getExplicitLastGroceryPurchaseResult(message: string): AIResult | null {
  const text = message.trim().replace(/[?!.,;:]+$/, "");
  const normalized = normalizeCapabilityText(text);
  const asksLatest = /\bultima\s+(?:compra|vez)\b|\b(?:compra|vez)\s+mais\s+recente\b/.test(normalized);
  const hasPurchaseQuestion = /\b(gastei|paguei|comprei|compra|itens?|produtos?|articulos?|compre)\b/.test(normalized);
  if (!asksLatest || !hasPurchaseQuestion) return null;

  const storeName = text.match(/(?:[úu]ltima\s+compra|compra\s+mais\s+recente)\s+(?:do|da|no|na|em|del|en)\s+(.+)$/i)?.[1]
    || text.match(/(?:gastei|paguei|comprei|compre)\s+(?:no|na|do|da|em|del|en)\s+(.+?)\s+(?:na\s+|da\s+|la\s+)?[úu]ltima\s+vez$/i)?.[1]
    || text.match(/(?:no|na|do|da|em|del|en)\s+(.+?)\s+(?:na\s+|da\s+|la\s+)?[úu]ltima\s+vez$/i)?.[1];
  const cleanStore = storeName?.replace(/^(?:minha|mi)\s+/i, "").trim();

  const queryDetail: "total" | "items" = /\b(o\s+que|quais?|itens?|produtos?|comprei|compre|articulos?)\b/.test(normalized)
    ? "items"
    : "total";
  return {
    intent: "grocery_last_purchase_query",
    confidence: 1,
    grocery: { ...(cleanStore ? { storeName: cleanStore } : {}), queryDetail },
  };
}

const PURCHASE_MONTHS: Record<string, number> = {
  janeiro: 1, enero: 1, fevereiro: 2, febrero: 2, marco: 3, marzo: 3,
  abril: 4, maio: 5, mayo: 5, junho: 6, junio: 6, julho: 7, julio: 7,
  agosto: 8, setembro: 9, septiembre: 9, outubro: 10, octubre: 10,
  novembro: 11, noviembre: 11, dezembro: 12, diciembre: 12,
};

function explicitPurchaseCalendarPeriod(message: string, anchor: Date): DatePeriod | null {
  const normalized = normalizeCapabilityText(message.trim());
  const pad = (value: number) => String(value).padStart(2, "0");
  const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
  const parseYear = (raw: string | undefined) => {
    if (!raw) return anchor.getFullYear();
    const year = Number(raw);
    return year < 100 ? 2000 + year : year;
  };
  const range = normalized.match(/\b(?:de|entre)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(?:a|ate|e|al)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (range) {
    const endYear = parseYear(range[6]);
    const startYear = range[3] ? parseYear(range[3]) : endYear;
    return { from: ymd(startYear, Number(range[2]), Number(range[1])), to: ymd(endYear, Number(range[5]), Number(range[4])) };
  }
  const singleDate = normalized.match(/\b(?:em|no\s+dia|dia|del)?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (singleDate) {
    const date = ymd(parseYear(singleDate[3]), Number(singleDate[2]), Number(singleDate[1]));
    return { from: date, to: date };
  }
  const monthNames = Object.keys(PURCHASE_MONTHS).join("|");
  const namedMonth = normalized.match(new RegExp(`\\b(${monthNames})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`));
  if (namedMonth) {
    const month = PURCHASE_MONTHS[namedMonth[1]];
    const year = namedMonth[2]
      ? Number(namedMonth[2])
      : month <= anchor.getMonth() + 1 ? anchor.getFullYear() : anchor.getFullYear() - 1;
    return { from: ymd(year, month, 1), to: ymd(year, month, new Date(year, month, 0).getDate()) };
  }
  const explicitYear = normalized.match(/\b(?:(?:no|do|em|del)\s+ano\s+(?:de\s+)?|(?:em|de|no|del)\s+)(20\d{2})\b/);
  if (explicitYear) return { from: `${explicitYear[1]}-01-01`, to: `${explicitYear[1]}-12-31` };
  return null;
}

function extractGroceryStoreFromHistory(message: string): string | undefined {
  const normalized = normalizeCapabilityText(message.trim()).replace(/[?!.,;:]+$/, "");
  const subject = normalized.match(/\b(?:compras?|comprei|compre)\b/);
  if (!subject?.index && subject?.index !== 0) return undefined;
  let tail = normalized.slice(subject.index + subject[0].length);
  const monthNames = Object.keys(PURCHASE_MONTHS).join("|");
  tail = tail
    .replace(/\s+(?:de|entre)\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+(?:a|ate|e|al)\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/i, "")
    .replace(/\s+(?:em|no\s+dia|dia|del)?\s*\d{1,2}\/\d{1,2}\/\d{2,4}$/i, "")
    .replace(new RegExp(`\\s+(?:(?:em|no|na|de|del|en)\\s+)?(?:${monthNames})(?:\\s+(?:de\\s+)?20\\d{2})?$`, "i"), "")
    .replace(/\s+(?:(?:em|no|na|de|del|en)\s+)?(?:o\s+)?ano\s+(?:de\s+)?20\d{2}$/i, "")
    .replace(/\s+(?:em|de|no|del)\s+20\d{2}$/i, "")
    .replace(/\s+(?:nos|nas|en\s+los)\s+ultimos\s+(?:7|30)\s+dias$/i, "")
    .replace(/\s+(?:(?:em|no|na|de|del|en)\s+)?(?:hoje|ontem|hoy|ayer|esta\s+semana|essa\s+semana|semana\s+passada|este\s+mes|esse\s+mes|mes\s+passado|este\s+ano|ano\s+passado|esta\s+semana|semana\s+pasada|este\s+mes|mes\s+pasado|este\s+ano|ano\s+pasado)$/i, "")
    .trim();
  const prepositions = [...tail.matchAll(/\b(?:no|na|do|da|em|en|del)\s+/g)];
  const lastPreposition = prepositions.at(-1);
  const captured = (lastPreposition?.index !== undefined ? tail.slice(lastPreposition.index + lastPreposition[0].length) : "").trim()
    .replace(/^(?:mercado|supermercado)\s+/i, "")
    .replace(/\s+(?:ultima|penultima|antepenultima)\s+vez$/i, "")
    .trim();
  if (!captured || /^(?:mercado|supermercado|compras?)$/i.test(captured)) return undefined;
  return captured;
}

function groceryCategoryFromQuery(normalized: string): GroceryCategory | undefined {
  const categories: Array<[RegExp, GroceryCategory]> = [
    [/\b(carnes?|carniceria)\b/, "Carnes"],
    [/\b(mercearia|abarrotes)\b/, "Mercearia"],
    [/\b(hortifruti|frutas?\s+e\s+legumes|frutas?\s+y\s+verduras)\b/, "Hortifruti"],
    [/\b(laticinios|lacteos)\b/, "Laticínios"],
    [/\b(padaria|panaderia)\b/, "Padaria"],
    [/\b(bebidas?)\b/, "Bebidas"],
    [/\b(limpeza|limpieza)\b/, "Limpeza"],
    [/\b(higiene)\b/, "Higiene"],
  ];
  return categories.find(([pattern]) => pattern.test(normalized))?.[1];
}

/** Atalho determinístico para consultas ao histórico de compras. Garante os
 * filtros essenciais mesmo quando o classificador externo interpreta
 * "todas", "últimas 3" ou "penúltima" de forma inconsistente. */
export function getExplicitGroceryHistoryQueryResult(message: string, anchor: Date = nowBR()): AIResult | null {
  const normalized = normalizeCapabilityText(message.trim());
  const hasPurchaseSubject = /\b(compras?|comprei|compre)\b/.test(normalized);
  const hasQuerySignal = /\b(o\s+que|que|quais?|quanto|valor|total|mostre|mostrar|liste|listar|historico|minhas?|mis|todas?|todos?|ultimas?|penultima|antepenultima)\b/.test(normalized);
  const isShoppingList = /\blista\s+(?:de|do|da|del)\s+(?:compras?|supermercado)\b/.test(normalized);
  const isMutation = /\b(registr|cadastr|adicion|inclu|anot|apag|exclu|delet|remov|alter|edit|corrig)\w*/.test(normalized);
  const isSingleLatest = /\b(?:ultima|mais\s+recente)\s+compra\b|\bcompra\s+mais\s+recente\b/.test(normalized);
  if (!hasPurchaseSubject || !hasQuerySignal || isShoppingList || isMutation || isSingleLatest) return null;

  const period = getExplicitRelativePeriod(message, anchor) ?? explicitPurchaseCalendarPeriod(message, anchor);
  const storeName = extractGroceryStoreFromHistory(message);
  const numberWords: Record<string, number> = { uma: 1, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, una: 1, dos: 2 };
  const latestCount = normalized.match(/\bultimas?\s+(\d+|uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|una|dos)\s+compras?\b/);
  let purchaseLimit = latestCount ? (Number(latestCount[1]) || numberWords[latestCount[1]]) : undefined;
  let purchaseOffset: number | undefined;
  if (/\bantepenultima\s+compra\b/.test(normalized)) { purchaseLimit = 1; purchaseOffset = 2; }
  else if (/\bpenultima\s+compra\b|\bsegunda\s+compra\s+mais\s+recente\b/.test(normalized)) { purchaseLimit = 1; purchaseOffset = 1; }
  const asksForItems = /\b(o\s+que|que\s+compre|quais?|itens?|produtos?|articulos?|comprei|compre)\b/.test(normalized);
  const asksOnlyTotal = /\b(quanto|valor|total|gastei|paguei)\b/.test(normalized) && !asksForItems;
  const allHistory = !period && (/\b(todas?(?:\s+(?:as?|minhas?|mis)){0,2}\s+compras?|todo\s+(?:(?:o|meu|mi)\s+)?historico|historial\s+completo)\b/.test(normalized) || !!storeName || !!purchaseLimit || purchaseOffset !== undefined);
  const category = groceryCategoryFromQuery(normalized);

  return {
    intent: "grocery_history_query",
    confidence: 1,
    grocery: {
      ...(storeName ? { storeName } : {}),
      ...(period ? { period } : {}),
      ...(category ? { category } : {}),
      ...(allHistory ? { allHistory: true } : {}),
      ...(purchaseLimit ? { purchaseLimit } : {}),
      ...(purchaseOffset !== undefined ? { purchaseOffset } : {}),
      queryDetail: asksOnlyTotal ? "total" : "items",
    },
  };
}

/** "Resumo da semana" é um briefing transversal do assessor (agenda +
 * compromissos financeiros futuros), não sinônimo de extrato. Pedidos que
 * dizem explicitamente "financeiro" continuam no classificador de finanças. */
export function getExplicitWeeklySummaryResult(message: string, anchor: Date = nowBR()): AIResult | null {
  const normalized = normalizeCapabilityText(message.trim());
  const asksWeeklySummary = /\b(?:resumo|resumen)\s+(?:(?:da|de|desta|dessa|esta|la)\s+)*(?:(?:proxima|ultima)\s+)?semana\b|\b(?:resumo|resumen)\s+semanal\b/.test(normalized);
  const explicitlyFinancialOnly = /\b(financeir\w*|finanz\w*|so\s+(?:de\s+)?(?:dinheiro|gastos?|despesas?|ingresos?))\b/.test(normalized);
  if (!asksWeeklySummary || explicitlyFinancialOnly) return null;

  return withExplicitRelativePeriod(message, { intent: "weekly_summary", confidence: 1 }, anchor);
}

/** Mesmo briefing transversal para hoje, ontem ou amanhã. O período relativo
 * é resolvido localmente para não depender do cálculo do modelo. */
export function getExplicitDailySummaryResult(message: string, anchor: Date = nowBR()): AIResult | null {
  const normalized = normalizeCapabilityText(message.trim());
  const asksDailySummary = /\bresumo\s+(?:do\s+dia(?:\s+de\s+(?:hoje|ontem|amanha))?|de\s+(?:hoje|ontem|amanha)|diario)\b|\bresumen\s+(?:del\s+dia(?:\s+de\s+(?:hoy|ayer|manana))?|de\s+(?:hoy|ayer|manana)|diario)\b/.test(normalized);
  const explicitlyFinancialOnly = /\b(financeir\w*|finanz\w*|so\s+(?:de\s+)?(?:dinheiro|gastos?|despesas?|ingresos?))\b/.test(normalized);
  if (!asksDailySummary || explicitlyFinancialOnly) return null;
  return withExplicitRelativePeriod(message, { intent: "daily_summary", confidence: 1 }, anchor);
}

function supportInsidePlatformLine(locale?: string): string {
  if (locale === "es") {
    return "Si necesitas ayuda, entra al panel de Zelo y abre *Suporte* en la esquina inferior derecha.";
  }
  if (locale === "pt-PT") {
    return "Se precisares de ajuda, entra no painel do Zelo e abre o *Suporte* no canto inferior direito.";
  }
  return "Se precisar de ajuda, acesse o painel do Zelo e abra o *Suporte* no canto inferior direito.";
}

function addDaysToBRDate(days: number): string {
  const [year, month, day] = todayStrBR().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Atalho determinístico para o formato explícito "Tarefa: ...". Além de
 * reduzir latência, garante que esse comando básico continue funcionando
 * mesmo se o provedor de IA estiver indisponível ou se houver outro assunto
 * no histórico. Formatos mais ambíguos continuam sendo classificados pela IA. */
export function getExplicitTaskCreateResult(message: string): AIResult | null {
  const match = message.trim().match(/^tarefa\s*(?:[:.\-–—]\s*|\s+)(.+)$/i);
  if (!match) return null;

  const body = match[1].trim();
  if (!body || /\b(conclu\w*|complet\w*|finaliz\w*|feit[ao]s?|apag\w*|exclu\w*|remov\w*|list\w*|minhas?)\b/i.test(body)) {
    return null;
  }

  const normalized = normalizeCapabilityText(body);
  let dueDate: string | undefined;
  if (/\bamanha\b/.test(normalized)) dueDate = addDaysToBRDate(1);
  else if (/\bhoje\b/.test(normalized)) dueDate = addDaysToBRDate(0);
  else if (/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b|\bdia\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/.test(normalized)) {
    return null;
  }

  const title = body
    .replace(/^(?:tem\s+que|preciso(?:\s+de)?|devo)\s+/i, "")
    .replace(/\s*(?:,\s*)?(?:(?:para|at[eé])\s+)?(?:hoje|amanh[ãa])\s*[.!?]*$/i, "")
    .trim()
    .replace(/[.!?]+$/, "");
  if (!title) return null;

  const priority = /\b(urgente|importante|prioridade|quanto antes)\b/.test(normalized)
    ? "high"
    : /\b(sem pressa|quando der|nao urgente)\b/.test(normalized)
      ? "low"
      : "medium";

  return {
    intent: "task_create",
    confidence: 1,
    task: { title, priority, ...(dueDate ? { dueDate } : {}) },
  };
}

const REMINDER_ACTION_VERBS = "comprar|ver|marcar|fazer|hacer|ligar|llamar|levar|llevar|buscar|pegar|recoger|enviar|mandar|pagar|agendar|programar|limpar|limpiar|trocar|cambiar|consertar|arreglar|revisar";

function reminderChecklist(body: string, language: "pt" | "es" = "pt"): string {
  const cleaned = body
    .replace(/\b(do|da|de|o|a)\s*,\s*\1\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  if (!cleaned) return "";

  const chunks = cleaned
    .split(new RegExp(`\\s*;\\s*|\\s*,\\s*|\\s+(?:e|y)\\s+(?=(?:${REMINDER_ACTION_VERBS})\\b)`, "i"))
    .map(part => part.replace(/^(?:(?:e|y)\s+|para\s+)/i, "").trim())
    .filter(Boolean);
  if (chunks.length <= 1) return cleaned;

  const inheritedVerb = chunks[0].match(new RegExp(`^(${REMINDER_ACTION_VERBS})\\b`, "i"))?.[1];
  const tasks = chunks.map((part, index) => {
    const hasActionVerb = new RegExp(`^(?:${REMINDER_ACTION_VERBS})\\b`, "i").test(part);
    const withVerb = index > 0 && !hasActionVerb && inheritedVerb?.toLowerCase() === "comprar"
      ? `comprar ${part}`
      : part;
    return withVerb ? withVerb.charAt(0).toUpperCase() + withVerb.slice(1) : withVerb;
  });
  return `${language === "es" ? "Tareas" : "Tarefas"}:\n${tasks.map(task => `• ${task}`).join("\n")}`;
}

/** Pedido de lembrete sem data não deve cair em fallback nem ser confundido
 * com consulta de tarefas. Preserva o conteúdo e deixa o motor de campos
 * faltantes perguntar apenas quando deve avisar. */
export function getExplicitUnscheduledReminderResult(
  message: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): AIResult | null {
  const text = message.trim();
  const normalized = normalizeCapabilityText(text);
  const hasConcreteSchedule = /\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|todo\s+dia|toda\s+semana|todo\s+mes|daqui\s+a\s+\d+|dentro\s+de\s+\d+)\b|\b(?:dia|el\s+dia)\s+\d{1,2}\b|\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|mayo|junio|julio|septiembre|octubre|noviembre|diciembre)\b|\b(?:as|a\s+las)\s+\d{1,2}\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(normalized);

  const directPt = text.match(/^(?:(?:por\s+favor|favor)[, ]*)?(?:me\s+)?(?:lembra|lembre)(?:-me)?\s+(?:depois\s+)?(?:de\s+)?(.*)$/i);
  const directEs = text.match(/^(?:por\s+favor[, ]*)?(?:recu[eé]rdame|recordarme)\s+(?:m[aá]s\s+tarde\s+)?(?:que\s+|de\s+)?(.*)$/i);
  const direct = directPt ?? directEs;
  if (direct && !hasConcreteSchedule) {
    const reminderMessage = reminderChecklist(direct[1] || "", directEs ? "es" : "pt");
    return { intent: "reminder_set", confidence: 1, reminder: { ...(reminderMessage ? { message: reminderMessage } : {}) } };
  }

  const isTaskReminderClarification = /^(?:ah[, ]*)?(?:eu\s+)?(?:preciso|quero|gostaria)\s+(?:de\s+)?(?:um\s+)?lembrete\s+(?:de|das?)\s+tarefas(?:[, ]*por\s+favor)?[.!?]*$/i.test(text)
    || /^(?:ah[, ]*)?(?:necesito|quiero)\s+(?:un\s+)?recordatorio\s+de\s+tareas(?:[, ]*por\s+favor)?[.!?]*$/i.test(text);
  if (!isTaskReminderClarification) return null;

  for (const previous of [...history].reverse()) {
    if (previous.role !== "user") continue;
    const recovered = getExplicitUnscheduledReminderResult(previous.content);
    if (recovered?.reminder?.message) return recovered;
  }

  return { intent: "reminder_set", confidence: 1, reminder: {} };
}

const VEHICLE_NOUN_RE = /\b(ve[ií]culo|carro|moto|caminh[ãa]o|van)\b/i;
const VEHICLE_EXPENSE_RE = /\b(gasto|despesa|abastec|paguei|comprei|troca|manuten[çc][ãa]o|revis[ãa]o|conserto|oficina|ipva|imposto|[óo]leo|pneu)\b/i;

function parseFuelType(text: string): VehicleData["fuelType"] | undefined {
  const normalized = normalizeCapabilityText(text);
  if (/\beletric[oa]\b/.test(normalized)) return "electric";
  if (/\bdiesel\b/.test(normalized)) return "diesel";
  if (/\betanol|alcool\b/.test(normalized)) return "ethanol";
  if (/\bgasolina\b/.test(normalized)) return "gasoline";
  if (/\bflex\b/.test(normalized)) return "flex";
  return undefined;
}

function cleanVehicleTarget(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/\b(meu|minha|o|a|um|uma|ve[ií]culo|carro|moto|caminh[ãa]o|van)\b/gi, " ")
    .replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/, "");
  return cleaned || undefined;
}

/** Atalho para comandos explícitos de CRUD de veículo. Além de reduzir a
 * dependência do classificador externo, garante que frases básicas como
 * "quero alterar meu veículo" nunca terminem sem resposta. Os dados que não
 * forem encontrados serão coletados pelo fluxo conversacional. */
export function getExplicitVehicleCrudResult(message: string): AIResult | null {
  const text = message.trim();
  const normalized = normalizeCapabilityText(text);
  const hasVehicleContext = VEHICLE_NOUN_RE.test(text)
    || /\b(placa|quilometragem|hodometro)\b/.test(normalized);
  if (!hasVehicleContext) return null;

  const isDelete = /\b(excluir|exclua|apagar|apague|remover|remova|deletar|delete)\b/.test(normalized);
  if (isDelete) {
    const afterNoun = text.match(/\b(?:ve[ií]culo|carro|moto|caminh[ãa]o|van)\b\s+(.+)$/i)?.[1];
    const keyword = cleanVehicleTarget(afterNoun);
    return { intent: "vehicle_delete", confidence: 1, ...(keyword ? { keyword } : {}) };
  }

  const isUpdate = /\b(alterar|altere|editar|edite|mudar|mude|atualizar|atualize|corrigir|corrija)\b/.test(normalized);
  if (isUpdate) {
    const vehicle: VehicleData = {};
    const plateChange = text.match(/placa\s+(?:do|da)?\s*(.+?)\s+(?:para|pra)\s+([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}[- ]?\d{4})\b/i);
    const brandChange = text.match(/marca\s+(?:do|da)?\s*(.+?)\s+(?:para|pra)\s+([^,;]+)$/i);
    const modelChange = text.match(/modelo\s+(?:do|da)?\s*(.+?)\s+(?:para|pra)\s+([^,;]+)$/i);
    const yearChange = text.match(/ano\s+(?:do|da)?\s*(.+?)\s+(?:para|pra)\s+((?:19|20)\d{2})\b/i);
    const kmChange = text.match(/(?:km|quilometragem|hod[oô]metro)\s+(?:do|da)?\s*(.+?)\s+(?:para|pra)\s+([\d.]+)\s*(?:km)?\b/i);
    if (plateChange) vehicle.plate = plateChange[2].replace(/[- ]/g, "").toUpperCase();
    if (brandChange) vehicle.brand = brandChange[2].trim();
    if (modelChange) vehicle.model = modelChange[2].trim();
    if (yearChange) vehicle.year = Number(yearChange[2]);
    if (kmChange) vehicle.currentKm = Number(kmChange[2].replace(/\./g, ""));
    const fuelType = parseFuelType(
      text.match(/(?:combust[ií]vel|motoriza[çc][ãa]o).*(?:para|pra)\s+(.+)$/i)?.[1]
      || text.match(/(?:para|pra)\s+(gasolina|etanol|[áa]lcool|diesel|el[eé]tric[oa]|flex)\b/i)?.[1]
      || "",
    );
    if (fuelType) vehicle.fuelType = fuelType;
    if (/\bpara\s+(?:o\s+)?(?:modo\s+)?empresa\b|\bpara\s+empresarial\b/.test(normalized)) vehicle.newMode = "business";
    if (/\bpara\s+(?:o\s+)?modo\s+pessoal\b/.test(normalized)) vehicle.newMode = "personal";

    const target = plateChange?.[1] || brandChange?.[1] || modelChange?.[1] || yearChange?.[1] || kmChange?.[1]
      || text.match(/\b(?:ve[ií]culo|carro|moto|caminh[ãa]o|van)\b\s+(.+?)(?:\s+(?:para|pra|com)\b|$)/i)?.[1];
    const keyword = cleanVehicleTarget(target);
    const mentionsSpecificField = /\b(placa|marca|modelo|ano|km|quilometragem|hodometro|combustivel|motorizacao)\b/.test(normalized);
    // Ordem/frase complexa: deixa o classificador completo extrair os campos
    // em vez de interceptar e devolver uma alteração vazia.
    if (mentionsSpecificField && !Object.keys(vehicle).length) return null;
    return { intent: "vehicle_update", confidence: 1, vehicle, ...(keyword ? { keyword } : {}) };
  }

  const isCreate = /\b(cadastrar|cadastre|registrar|registre|adicionar|adicione|incluir|inclua|novo|nova)\b/.test(normalized);
  if (!isCreate || VEHICLE_EXPENSE_RE.test(text)) return null;

  const vehicle: VehicleData = {};
  const brand = text.match(/\bmarca\s+([^,;]+?)(?=\s+modelo\b|\s+ano\b|\s+placa\b|$)/i)?.[1]?.trim();
  const model = text.match(/\bmodelo\s+([^,;]+?)(?=\s+marca\b|\s+ano\b|\s+placa\b|$)/i)?.[1]?.trim();
  const year = text.match(/\b(?:ano\s+)?((?:19|20)\d{2})\b/)?.[1];
  const plate = text.match(/\bplaca\s+([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}[- ]?\d{4})\b/i)?.[1];
  const km = text.match(/\b([\d.]+)\s*(?:km|quil[oô]metros?)\b/i)?.[1];
  if (brand) vehicle.brand = brand;
  if (model) vehicle.model = model;
  if (year) vehicle.year = Number(year);
  if (plate) vehicle.plate = plate.replace(/[- ]/g, "").toUpperCase();
  if (km) vehicle.currentKm = Number(km.replace(/\./g, ""));
  const fuelType = parseFuelType(text);
  if (fuelType) vehicle.fuelType = fuelType;
  if (/\b(empresa|empresarial)\b/.test(normalized)) vehicle.mode = "business";
  else if (/\bpessoal\b/.test(normalized)) vehicle.mode = "personal";

  // Formato natural sem rótulos: "cadastre um Volkswagen Gol 2020".
  if (!vehicle.brand && !vehicle.model) {
    const free = text.match(/\b(?:ve[ií]culo|carro|moto|caminh[ãa]o|van)\b\s+(.+)$/i)?.[1]
      ?.replace(/\b(?:ano|placa)\s+/gi, "")
      .replace(/\b(?:19|20)\d{2}\b/g, "")
      .replace(/\b[A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2}\b/gi, "")
      .replace(/\b[\d.]+\s*(?:km|quil[oô]metros?)\b/gi, "")
      .replace(/\b(gasolina|etanol|[áa]lcool|diesel|el[eé]tric[oa]|flex|pessoal|empresa|empresarial)\b/gi, "")
      .replace(/\b(com|de|do|da)\b/gi, "")
      .replace(/\s+/g, " ").trim();
    const parts = free?.split(" ").filter(Boolean) || [];
    if (parts.length === 1) vehicle.model = parts[0];
    else if (parts.length > 1) {
      vehicle.brand = parts.shift();
      vehicle.model = parts.join(" ");
    }
  }

  return { intent: "vehicle_create", confidence: 1, vehicle };
}

/** Resposta determinística para impedir que o modelo invente conexão
 * bancária, menus ou um fluxo de Open Finance que o produto não oferece. */
export function getUnsupportedBankConnectionResponse(
  message: string,
  locale?: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): string | null {
  const current = normalizeCapabilityText(message);
  // O histórico serve apenas para reconhecer uma continuação curta como
  // "e onde faço isso?". Nunca misture todo o histórico com a mensagem
  // atual: a própria resposta do Zelo cita "Open Finance" e, se essa frase
  // entrar na detecção direta, todos os turnos seguintes ficam presos na
  // mesma resposta — inclusive pedidos válidos de tarefa, agenda e ajuda.
  const lastUserMessage = [...history].reverse().find(item => item.role === "user")?.content ?? "";
  const previousUser = normalizeCapabilityText(lastUserMessage);

  const mentionsOpenFinance = /\bopen\s*(finance|banking)\b/.test(current);
  const mentionsBankAccount = /\bcontas?\s+bancari[ao]s?\b/.test(current);
  const mentionsBankOrCard = /\b(bancos?|cart(?:ao|oes)(?:\s+de\s+credito)?)\b/.test(current);
  const setupVerb = /\b(conect\w*|integr\w*|vincul\w*|sincron\w*|acess\w*|adicion\w*|cadastr\w*)\b/;
  const asksForSetup = setupVerb.test(current);
  const cannotFindSetup = /\b(nao\s+encontr\w*|onde|local)\b/.test(current)
    && (asksForSetup || mentionsBankAccount || mentionsBankOrCard);
  const priorBankSetup = /\bopen\s*(finance|banking)\b/.test(previousUser)
    || (/\b(contas?\s+bancari[ao]s?|bancos?|cart(?:ao|oes)(?:\s+de\s+credito)?)\b/.test(previousUser)
      && setupVerb.test(previousUser));
  const followUpText = current.replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
  const shortFollowUp = current.length <= 100
    && (
      /^(?:e\s+)?(?:onde|como)(?:\s+eu)?(?:\s+(?:faco|acho|encontro|acesso|ativo|conecto|adiciono|cadastro|fica))?(?:\s+para\s+(?:fazer|acessar|ativar|conectar|adicionar|cadastrar))?(?:\s+(?:isso|essa\s+opcao|esse\s+menu|essa\s+funcao|la))?$/.test(followUpText)
      || /^(?:e\s+)?nao\s+(?:encontrei|achei)(?:\s+(?:isso|essa\s+opcao|esse\s+menu|essa\s+funcao))?$/.test(followUpText)
    );
  const genericAccountSetup = current.length <= 100
    && /\bcontas?\b/.test(current)
    && setupVerb.test(current)
    && !/\b(luz|agua|internet|boleto|pagar|recorrente|despesa|gasto)\b/.test(current);

  if (
    !mentionsOpenFinance
    && !(mentionsBankAccount && (asksForSetup || cannotFindSetup))
    && !(mentionsBankOrCard && asksForSetup)
    && !(priorBankSetup && shortFollowUp)
    && !genericAccountSetup
  ) {
    return null;
  }

  const limitation = locale === "es"
    ? "Por el momento, no es posible registrar ni conectar cuentas bancarias o tarjetas en Zelo. Zelo no utiliza Open Finance ni Open Banking."
    : locale === "pt-PT"
      ? "Neste momento, não é possível registar nem ligar contas bancárias ou cartões no Zelo. O Zelo não utiliza Open Finance nem Open Banking."
      : "No momento, não é possível cadastrar nem conectar contas bancárias ou cartões no Zelo. O Zelo não utiliza Open Finance nem Open Banking.";

  return `${limitation}\n\n${supportInsidePlatformLine(locale)}`;
}

/** Parte do prompt que muda a cada chamada (data, calendário, períodos
 *  pré-calculados, categorias do usuário — incluindo as personalizadas,
 *  invisíveis pra IA antes disso — e modo ativo). Fica no início da
 *  mensagem do turno, não no systemInstruction, porque systemInstruction é
 *  fixo por modelo — só o que realmente muda por chamada deve estar aqui,
 *  senão nenhuma otimização de cache de contexto se aplica. */
function buildVolatileContext(ctx?: AiContext): string {
  const hoje = todayStrBR();
  const agora = nowISOBR();

  // Gera mini-calendário dos próximos 8 dias para evitar erros de cálculo de dia da semana
  const DIAS = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const nextDays: string[] = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(hoje + "T12:00:00-03:00");
    d.setDate(d.getDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    const dow = DIAS[d.getDay()];
    const label = i === 0 ? " ← hoje" : i === 1 ? " ← amanhã" : "";
    nextDays.push(`  ${dow}: ${ymd}${label}`);
  }

  // Pré-calcula intervalos de datas para os períodos relativos mais comuns em
  // perguntas financeiras ("mês passado", "semana passada" etc.) — a IA deve
  // copiar esses valores prontos em vez de calcular datas por conta própria,
  // que é uma fonte recorrente de erro.
  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  const todayAnchor = new Date(hoje + "T12:00:00-03:00");
  const ty = todayAnchor.getFullYear();
  const tm = todayAnchor.getMonth(); // 0-indexed
  const mkNoon = (yy: number, mm: number, dd: number) => new Date(yy, mm, dd, 12, 0, 0);
  const monthLabel = (yy: number, mm: number) => mkNoon(yy, mm, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const curMonthFrom = mkNoon(ty, tm, 1);
  const curMonthTo = mkNoon(ty, tm + 1, 0);
  const nextMonthFrom = mkNoon(ty, tm + 1, 1);
  const nextMonthTo = mkNoon(ty, tm + 2, 0);
  const lastMonthFrom = mkNoon(ty, tm - 1, 1);
  const lastMonthTo = mkNoon(ty, tm, 0);
  const tomorrow = new Date(todayAnchor); tomorrow.setDate(todayAnchor.getDate() + 1);
  const yesterday = new Date(todayAnchor); yesterday.setDate(todayAnchor.getDate() - 1);

  const todayDow = todayAnchor.getDay(); // 0=domingo..6=sábado
  const diffToMonday = todayDow === 0 ? -6 : 1 - todayDow;
  const thisWeekMon = new Date(todayAnchor); thisWeekMon.setDate(todayAnchor.getDate() + diffToMonday);
  const thisWeekSun = new Date(thisWeekMon); thisWeekSun.setDate(thisWeekMon.getDate() + 6);
  const nextWeekMon = new Date(thisWeekMon); nextWeekMon.setDate(thisWeekMon.getDate() + 7);
  const nextWeekSun = new Date(thisWeekSun); nextWeekSun.setDate(thisWeekSun.getDate() + 7);
  const lastWeekMon = new Date(thisWeekMon); lastWeekMon.setDate(thisWeekMon.getDate() - 7);
  const lastWeekSun = new Date(thisWeekMon); lastWeekSun.setDate(thisWeekMon.getDate() - 1);

  const firstWeekFrom = mkNoon(ty, tm, 1);
  const firstWeekTo = mkNoon(ty, tm, 7);
  const yearFrom = mkNoon(ty, 0, 1);
  const lastYearFrom = mkNoon(ty - 1, 0, 1);
  const lastYearTo = mkNoon(ty - 1, 11, 31);

  const periodsRef = [
    `- Hoje: from "${hoje}" to "${hoje}"`,
    `- Amanhã: from "${toYMD(tomorrow)}" to "${toYMD(tomorrow)}"`,
    `- Ontem: from "${toYMD(yesterday)}" to "${toYMD(yesterday)}"`,
    `- Este mês / mês atual (${monthLabel(ty, tm)}): from "${toYMD(curMonthFrom)}" to "${toYMD(curMonthTo)}"`,
    `- Próximo mês / mês que vem (${monthLabel(ty, tm + 1)}): from "${toYMD(nextMonthFrom)}" to "${toYMD(nextMonthTo)}"`,
    `- Mês passado (${monthLabel(ty, tm - 1)}): from "${toYMD(lastMonthFrom)}" to "${toYMD(lastMonthTo)}"`,
    `- Esta semana: from "${toYMD(thisWeekMon)}" to "${toYMD(thisWeekSun)}"`,
    `- Próxima semana / semana que vem: from "${toYMD(nextWeekMon)}" to "${toYMD(nextWeekSun)}"`,
    `- Semana passada: from "${toYMD(lastWeekMon)}" to "${toYMD(lastWeekSun)}"`,
    `- Primeira semana deste mês: from "${toYMD(firstWeekFrom)}" to "${toYMD(firstWeekTo)}"`,
    `- Este ano: from "${toYMD(yearFrom)}" to "${hoje}"`,
    `- Ano passado: from "${toYMD(lastYearFrom)}" to "${toYMD(lastYearTo)}"`,
  ].join("\n");

  const expenseCats = [...CATEGORIES_EXPENSE, ...(ctx?.user.customCategoriesExpense ?? [])];
  const incomeCats = [...CATEGORIES_INCOME, ...(ctx?.user.customCategoriesIncome ?? [])];
  const modeLine = ctx?.user.activeMode
    ? `\nModo ativo do usuário agora: ${ctx.user.activeMode === "business" ? "empresa" : "pessoal"} — use como padrão quando a mensagem não deixar claro qual modo usar.`
    : "";
  const localeLine = localeInstruction(ctx?.user.locale) ? `\n${localeInstruction(ctx?.user.locale)}` : "";

  const historyBlock = ctx?.history?.length
    ? `\n\nHISTÓRICO RECENTE DA CONVERSA (mais antiga primeiro — a mensagem atual do usuário vem separada, no final desta mensagem):\n${ctx.history
        .map(h => `${h.role === "user" ? "Usuário" : "Você"}: ${h.content}`)
        .join("\n")}\n⚠️ Use esse histórico pra entender o contexto: se a mensagem atual parecer curta demais ou incompleta sozinha (ex: responde uma pergunta que VOCÊ fez na última mensagem, corrige algo que acabou de ser registrado, ou continua um assunto em aberto), interprete-a à luz do que já foi dito — não trate a conversa como se começasse do zero a cada mensagem.`
    : "";

  return `Hoje é: ${new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} (${hoje}) — Agora são: ${agora.slice(11,16)} (horário de Brasília/São Paulo).${localeLine}
Use sempre datas no formato YYYY-MM-DD e horários no formato YYYY-MM-DDTHH:MM:SS.

Calendário dos próximos dias (use para resolver dias da semana sem errar):
${nextDays.join("\n")}

⚠️ Períodos relativos JÁ CALCULADOS — use EXATAMENTE esses valores no campo "period" quando a mensagem mencionar o período correspondente (finance_query, finance_upcoming, daily_summary, weekly_summary, balance_query, finance_detail, finance_analysis, grocery_history_query, grocery_spend_query). NUNCA calcule essas datas por conta própria:
${periodsRef}

CATEGORIAS DE DESPESA: ${expenseCats.join(", ")}
CATEGORIAS DE RECEITA: ${incomeCats.join(", ")}
CATEGORIAS DE SUPERMERCADO (para grocery.items[].category): ${GROCERY_CATEGORIES.join(", ")}${modeLine}

Endereço do painel web do Zelo (use SEMPRE este exato, nunca invente outro domínio tipo "app.zelo.com.br" — esse não existe): ${process.env.NEXT_PUBLIC_APP_URL || "https://zelogestaointeligente.com.br"}${historyBlock}`;
}

/** Parte do prompt que NÃO muda entre chamadas — vai no systemInstruction
 *  do modelo (fixo, fora do turno), o que permite cache de contexto no
 *  provedor em vez de reprocessar as mesmas ~700 linhas de instrução a
 *  cada mensagem. */
function buildStaticInstructions() {
  return `Você é um assistente de análise de intenções para um sistema de gestão pessoal e empresarial via WhatsApp em português brasileiro.
Analise a mensagem do usuário e retorne APENAS um JSON com a estrutura abaixo.
Use sempre datas no formato YYYY-MM-DD e horários no formato YYYY-MM-DDTHH:MM:SS.
As categorias válidas, a data de hoje, o calendário e os períodos pré-calculados vêm no início da mensagem do usuário a cada chamada — use sempre os valores de lá, nunca invente.

PRIORIDADE DE INTERPRETAÇÃO:
1. Obedeça primeiro ao pedido explícito da mensagem ATUAL.
2. Use o histórico somente para resolver referências como "isso", "ela" ou uma resposta curta a uma pergunta anterior.
3. Nunca troque um comando atual por outro apenas porque o histórico estava falando de um assunto relacionado.
4. Escolha a intenção mais específica disponível. Por exemplo, valores ainda a pagar/receber são finance_upcoming, não um resumo genérico finance_query.
5. Se o usuário pediu uma AÇÃO, mas não informou todos os dados necessários, mantenha a intenção dessa ação e retorne os campos que conseguiu extrair. NÃO transforme em "unknown", consulta ou lista e NÃO invente o que faltou: o sistema perguntará somente os campos ausentes e continuará a mesma ação na resposta seguinte.

⚠️ CONTINUAÇÃO DE AÇÃO: quando a mensagem vier no formato "Pedido original" + "Informação complementar", una todas as partes como um único comando. A informação complementar responde à pergunta feita pelo sistema; preserve a intenção original e complete somente os campos novos.

INTENÇÕES POSSÍVEIS:
- finance_register: registrar um ou VÁRIOS gastos/receitas. Se a mensagem listar múltiplos lançamentos, use o campo "finances" (array) em vez de "finance" (singular).
- finance_edit: alterar/corrigir um lançamento existente ("errei o valor", "corrija o gasto de X", "muda o valor de X para Y"). Se o usuário quiser RENOMEAR a descrição (ex: "muda a descrição do ifood para almoço com cliente", "corrige o nome do lançamento X para Y"), use "newDescription" com o novo texto — NÃO confundir com "keyword"/"finance.description", que são o termo de busca do lançamento original. Se o usuário quiser corrigir um lançamento que foi contabilizado por engano como já recebido/pago, dizendo que na verdade ainda está "a receber"/"a pagar"/"é recebimento futuro" (ex: "lança como a receber", "isso ainda não recebi, marca como pendente"), inclua "finance.pending": true — o sistema tira o valor do saldo sem apagar o lançamento. Se o usuário disser que o TIPO está errado — era despesa, não receita, ou vice-versa (ex: "isso é despesa, não receita", "errei, é gasto"), inclua "finance.type" com o tipo certo ("income" ou "expense"). Use "keyword" com o termo de busca de qual lançamento (se o histórico da conversa deixar claro qual foi, reaproveite a descrição/nome citado ali).
  ⚠️ CORREÇÃO EM LOTE do que acabou de ser registrado: se a mensagem for uma correção CURTA e GENÉRICA, sem citar a descrição de um lançamento específico, logo depois de você (o assistente) ter confirmado um registro — de 1 lançamento OU de vários de uma vez (ex: usuário registrou várias despesas e depois manda só "tá errado, são despesas", "errei, isso tudo é receita", "na verdade é a receber", "muda pra despesa") — marque "bulkCorrectLastBatch": true e preencha em "finance" SOMENTE os campos que mudaram (type e/ou pending e/ou category — o que a mensagem indicar). NÃO invente "keyword" nesse caso (deixe vazio) — o sistema já sabe aplicar a correção em cima do que foi registrado por último, um ou vários, sem precisar buscar por nome. Só use isso quando o histórico deixar claro que a mensagem é sobre o registro mais recente, não sobre um lançamento antigo específico.
- finance_delete: excluir/apagar um lançamento ("apaga o gasto de X", "remove o lançamento do ifood", "cancela a despesa de X"). ⚠️ Se o pedido for genérico e curto, sem citar a descrição de um lançamento específico, logo depois de você ter confirmado um registro — de 1 lançamento OU de vários de uma vez (ex: "apaga isso", "apaga esses lançamentos", "remove tudo que acabei de mandar", "cancela esses"), marque "bulkCorrectLastBatch": true e NÃO invente "keyword" — o sistema apaga todo o registro mais recente (um ou vários) de uma vez. Só use isso quando ficar claro pelo histórico que é sobre o registro mais recente, não sobre um lançamento antigo específico.
- finance_query: perguntar sobre saldo, extrato, gastos totais do mês ("quanto gastei", "resumo do mês", "extrato"). ⚠️ Se a pergunta mencionar o NOME de uma pessoa específica em vez de "eu" (ex: "quanto a Ana gastou esse mês", "quanto o Gabriel gastou", "gastos do João", "extrato da Maria"), inclua "personName" com esse nome (ex: "Ana", "Gabriel", "João", "Maria"). ⚠️ Se em vez de um nome a pergunta citar um VÍNCULO familiar/social ("quanto minha esposa gastou", "quanto meu filho gastou", "gastos do meu sócio"), inclua "personName" com a palavra do vínculo em si (ex: "esposa", "filho", "sócio"), NÃO invente um nome próprio. Isso é usado em contas compartilhadas por várias pessoas da família/equipe, cada uma com seu próprio número de WhatsApp vinculado (identificadas por nome OU por vínculo cadastrado), para filtrar só os gastos registrados por aquela pessoa.
  ⚠️ DISTINÇÃO IMPORTANTE — categoria genérica vs comerciante/app específico:
  • CATEGORIA/ASSUNTO amplo (ex: "quanto gastei com comida", "gastos com transporte", "quanto gastei de mercado"): inclua "category" com o nome EXATO de uma das categorias listadas em CATEGORIAS DE DESPESA/RECEITA (no início da mensagem) (ex: "comida"/"mercado"/"restaurante" → "Alimentação"; "uber"/"gasolina"/"combustível" → "Transporte").
  • COMERCIANTE/APP/MARCA específico (ex: "quanto gastei com ifood", "gastos no aiqfome", "quanto gastei no 99", "gasto com uber eats", "quanto gastei na farmácia X"): inclua "keyword" com o nome do comerciante (NÃO use "category" nesse caso — a descrição do lançamento pode estar abreviada, ex: "IFD" em vez de "iFood", e o sistema já sabe expandir essas variantes a partir do "keyword").
  Em ambos os casos, inclua "financeType" com "expense" ou "income" conforme o verbo da REGRA CRÍTICA abaixo (padrão "expense"). ⚠️ Se a pergunta mencionar um PERÍODO diferente do mês atual (ex: "mês passado", "semana passada", "essa semana", "primeira semana do mês", "esse ano"), inclua "period" usando EXATAMENTE os valores da lista de períodos pré-calculados no início de cada mensagem — NUNCA calcule essas datas você mesmo. Sem período mencionado, não inclua "period" (o sistema usa o mês atual por padrão).
- finance_upcoming: listar valores que AINDA precisam ser pagos ou recebidos, com vencimentos e previsão de saldo ("quais são as próximas despesas para pagar esse mês?", "que contas tenho a pagar?", "o que vence esta semana?", "próximas receitas a receber", em espanhol: "gastos por pagar", "cuentas pendientes", "ingresos por cobrar"). Use "financeType": "expense" para contas/despesas a pagar e "income" para receitas/valores a receber. Não confunda com finance_query: finance_query resume o que JÁ aconteceu; finance_upcoming mostra pendências, parcelas e recorrentes que AINDA vão impactar o saldo. Se o usuário especificar empresa ou pessoal, inclua "mode". Se mencionar período diferente do mês atual, use "period" com os valores pré-calculados.
- weekly_summary: briefing geral quando a pessoa disser "resumo da semana", "resumo semanal", "resumen de la semana" ou equivalente. Esta intenção reúne compromissos/reuniões, contas a pagar, valores a receber e previsão de saldo; NÃO use finance_query, pois um simples resumo de dinheiro está incompleto. Se disser explicitamente "resumo financeiro da semana", aí use finance_query. Para semana passada ou outra semana, inclua "period" com os valores pré-calculados.
- daily_summary: o mesmo briefing geral para "resumo do dia", "resumo de hoje", "resumen del día" ou equivalente: compromissos/reuniões, contas a pagar, valores a receber e previsão de saldo daquele dia. NÃO use finance_query. Se pedir outro dia (ontem/amanhã/data), inclua "period" com from e to iguais à data correta do calendário.
- finance_detail: extrato DETALHADO do mês atual (ou do período pedido), listando cada lançamento por categoria. Inclua "financeType": se a mensagem contém "receitas", "entradas", "recebimentos", "income" → financeType: "income"; se contém "despesas", "gastos", "saídas", "expense" → financeType: "expense"; se não especificado → financeType: "expense" (padrão). Exemplos de ativadores: "extrato detalhado", "lista todas as despesas", "detalhe dos gastos", "extrato de despesas do mês", "extrato de receitas", "lista todas as receitas", "extrato detalhado empresa", "extrato receitas empresa", "cria uma planilha", "manda minha planilha", "quero uma planilha das entradas/saídas", "envia o extrato", "me manda um relatório". ⚠️ O sistema não gera arquivo de planilha (.xlsx/.csv) — quando o pedido usar a palavra "planilha", ainda assim use finance_detail (o sistema manda a lista de lançamentos em texto), NUNCA responda how_to/unknown só porque a palavra usada foi "planilha" em vez de "extrato". Se mencionar "empresa" ou "empresarial" inclua mode: "business"; se mencionar "pessoal" inclua mode: "personal". Se mencionar um período diferente do mês atual (ex: "extrato do mês passado", "extrato detalhado da semana passada"), inclua "period" com os valores pré-calculados no topo do prompt.
- balance_query: saldo atual ("qual meu saldo", "quanto tenho"). Aplica-se a mesma regra de "personName", "category" e "period" do finance_query quando a pergunta cita outra pessoa, uma categoria específica, ou um período diferente do mês atual.
- finance_confirm_pending: confirmar/antecipar um lançamento AGENDADO (data futura, ainda não contabilizado) antes da data chegar sozinha ("já paguei aquela conta que agendei", "confirma o pagamento do aluguel que tá agendado", "antecipa o lançamento de X"). Use "keyword" com o termo de busca do lançamento.
- finance_analysis: análise de padrões de gasto ("no que eu gastei mais", "onde estou gastando mais", "quais meus maiores gastos", "me ajude a economizar", "dicas para guardar dinheiro", "análise dos meus gastos", "onde estou perdendo dinheiro", "como posso gastar menos", "resumo por categoria", "em que categoria gasto mais"). Se mencionar período diferente do mês atual (ex: "no que gastei mais mês passado"), inclua "period" com os valores pré-calculados no topo do prompt.
- task_create: criar uma tarefa ("cria uma tarefa", "lembra de", "preciso fazer", "anota a tarefa"). Extraia SEMPRE que possível: "priority" ("high" se a mensagem disser "urgente"/"importante"/"prioridade"/"o quanto antes"; "low" se disser "sem pressa"/"quando der"/"não urgente"; senão "medium"); "dueDate" (YYYY-MM-DD, se a mensagem mencionar um prazo — use o calendário do início da mensagem pra resolver dias da semana).
- task_update: atualizar/concluir uma tarefa. Use "taskNumber" (posição na lista de "minhas tarefas") ou "title" (palavra-chave do título atual) pra identificar qual. Para editar dados, use somente os campos alterados: "newTitle", "newDueDate", "newPriority" ou "clearDueDate": true. Para mudar o andamento, use "newStatus".
- task_delete: apagar/excluir uma tarefa ("apaga a tarefa 3", "remove a tarefa de ligar pro cliente", "deleta essa tarefa"). Use "taskNumber" ou "title" igual ao task_update.
- task_query: listar tarefas
- reminder_set: criar lembrete agendado. ⚠️ Se a mensagem pedir pra avisar/lembrar OUTRA PESSOA em vez de quem está mandando a mensagem (ex: "lembra a Milena de pagar amanhã às 10h", "avisa o cliente Carlos que a reunião é sexta", "manda um lembrete pra equipe às 9h", "lembra o João de ligar pro fornecedor"), inclua "reminder.recipientName" com o nome citado (ex: "Milena", "Carlos", "equipe", "João"). Sem menção a outra pessoa, NÃO inclua "recipientName" — o lembrete é pra quem está mandando a mensagem, como sempre. Se a mensagem TAMBÉM citar um número de telefone explícito pra essa pessoa (ex: "lembra o João, número 5544999999999, de pagar o boleto amanhã às 10h", "avisa a Maria no 44988887777 que a entrega chegou"), inclua "reminder.recipientPhone" com só os dígitos informados (com DDD, e código do país se a pessoa disser) — isso permite criar o lembrete pra alguém que ainda não está cadastrado como cliente/funcionário/número da família. Sem número explícito na mensagem, NÃO inclua "recipientPhone".
- reminder_list: listar lembretes ativos ("meus lembretes", "quais lembretes eu tenho", "o que eu tenho agendado pra me avisar")
- reminder_update: editar um lembrete existente — mensagem, data/hora ou repetição ("muda o lembrete do remédio pra 8h", "troca o lembrete da conta de luz pra todo dia 5"). Use "keyword" com o termo de busca e "reminder" com os novos valores (só os campos que mudaram).
- reminder_delete: cancelar/apagar um lembrete ("cancela o lembrete do remédio", "apaga o lembrete da reunião", "não precisa mais me lembrar disso"). Use "keyword" com o termo de busca.
- goal_create: criar meta financeira ("meta", "guardar", "juntar", "economizar para", "quero juntar X para Y", "quero guardar X para Z"). SEMPRE inclua "title" com o nome da meta e "targetAmount" com o valor alvo. Se o usuário mencionar "já tenho X", "ja tenho X", "tenho X guardado", inclua "currentAmount" com esse valor. Se o valor alvo não for especificado, use targetAmount: 0 (o sistema pedirá ao usuário).
- goal_add: adicionar valor a uma meta EXISTENTE ("adicionei X na meta", "coloquei X para X", "juntei mais X")
- goal_query: ver metas ("minhas metas", "metas", "quais são meus objetivos")
- goal_complete: concluir uma meta ("concluí meta", "meta atingida", "atingi o objetivo", "meta viagem concluída"). SEMPRE inclua "title" com o nome da meta.
- goal_cancel: cancelar/desistir de uma meta ("cancela a meta da viagem", "desisti de juntar pra isso", "apaga essa meta"). Use "keyword" com o nome da meta.
- recurring_create: cadastrar despesa ou receita parcelada ou recorrente ("comprei geladeira em 10x", "pago netflix todo mês", "recebo salário todo dia 10", "parcela do carro", "assinatura mensal"). Use recurrenceType: "installment" para parcelamentos (compra dividida em N vezes, tem totalInstallments) e "recurring" para recorrentes contínuos (assinatura, mensalidade, conta fixa). Campos que ajudam MUITO se a mensagem trouxer (extraia sempre que possível, mas não invente se não tiver pista):
  • "dayOfMonth": o dia do mês em que vence, se mencionado (ex: "todo dia 10" → dayOfMonth: 10). Sem isso o sistema pergunta ao usuário, porque o dia do vencimento muda quando o cron avisa.
  • "repeatUnit": "monthly" (padrão), "weekly", "daily" ou "yearly" — só usa algo diferente de monthly se a mensagem disser claramente ("toda semana" → weekly, "todo ano"/"anual" → yearly).
  • "totalInstallments": nº de parcelas (installment) OU nº de meses/ocorrências de um recorrente com PRAZO (ex: "academia por 12 meses", "assinatura por 6 meses" → recurrenceType: "recurring" + totalInstallments: 12/6 — NÃO "installment", já que não é uma compra parcelada). Se o recorrente não tiver prazo mencionado (a maioria dos casos: netflix, aluguel, salário), NÃO inclua "totalInstallments" — fica perpétuo.
  • "lifetime": true SE E SOMENTE SE o usuário disser explicitamente que não tem fim ("para sempre", "vitalício", "sem prazo", "indefinidamente"). Isso evita que o sistema pergunte de novo algo que já foi respondido. Na dúvida (a maioria das mensagens não fala nada sobre prazo), NÃO inclua "lifetime" nem "totalInstallments" — o sistema pergunta se for realmente necessário.
  • "startDate": data de início, se mencionada explicitamente (padrão é hoje).
  • "totalAmount": valor total da compra, se mencionado (só faz sentido em installment; o sistema calcula sozinho se não vier).
- recurring_query: ver lançamentos recorrentes/parcelados ("minhas parcelas", "contas recorrentes", "o que tenho parcelado", "meus recorrentes")
- recurring_cancel: cancelar um recorrente/parcelado ("cancela a parcela da geladeira", "para o netflix", "remove o recorrente do aluguel")
- recurring_edit: editar um recorrente/parcelado ("muda o netflix para 65", "altera o valor da parcela da geladeira para 450")
- drive_search: buscar arquivo no Drive ("ache meu comprovante do mecânico", "me manda o contrato de aluguel", "cadê meu PDF do seguro", "encontra a foto da vistoria", "quero o boleto do banco"). Use "keyword" com os termos de busca.
- drive_rename: renomear ou descrever o arquivo salvo recentemente no Drive ("altere e salve como comprovante de pagamento thalita", "renomeia o arquivo para contrato assinado", "muda o nome para boleto de agosto", "salva como recibo do fornecedor"). Use "keyword" com o novo nome/descrição.
- agenda_create: agendar um compromisso, reunião, consulta ou evento com data e hora ("agendar reunião amanhã às 14h", "consulta médica sexta às 10h", "evento no sábado às 9h"). Use "agendaData" com título, startDate, startTime e opcionalmente location, description, endDate, endTime, repeat, allDay (true se for um evento de dia inteiro, sem horário específico, ex: "aniversário dia 15" sem hora).
- agenda_list: ver os próximos compromissos agendados ("meus compromissos", "agenda de hoje", "o que tenho essa semana", "próximos eventos").
- agenda_done: marcar um compromisso já realizado/concluído ("já fiz a reunião de ontem", "marca a consulta como feita", "concluí o compromisso com o cliente"). Use "keyword" com APENAS o nome/assunto do compromisso (ex: "reunião", "consulta") — NUNCA inclua dia/data/hora no keyword, já que a busca compara com o título salvo (que não tem essas palavras) e um keyword mais longo que o título nunca bate. NÃO confunda com agenda_delete (que apaga o compromisso) — agenda_done só marca como realizado, mantém o histórico.
- agenda_update: reagendar ou editar um compromisso existente — apenas data, hora ou local ("reagendar a reunião para segunda às 10h", "muda o horário da consulta para 15h", "altera o local da reunião para Zoom"). Use "keyword" com APENAS o nome/assunto do compromisso (ex: de "reagendar a reunião para segunda às 10h" extraia keyword: "reunião", NÃO "reunião para segunda") e "agendaData" com os novos valores. NÃO use para adicionar Meet link.
- agenda_delete: cancelar ou excluir um compromisso ("cancelar a reunião de amanhã", "apaga o compromisso de sexta", "remove a consulta médica"). Use "keyword" com APENAS o nome/assunto do compromisso (ex: de "apaga o compromisso de sexta" extraia keyword: "compromisso", NÃO "compromisso de sexta"; de "cancelar a reunião de amanhã" extraia "reunião", NÃO "reunião de amanhã").
- agenda_add_meet: adicionar link do Google Meet a um compromisso já existente na agenda ("coloca meet nessa reunião", "adiciona meet no compromisso", "cria link de meet para a reunião", "coloca via meet", "quero que tenha meet", "adiciona videoconferência", "transforma em meet"). Use "keyword" com APENAS o nome/assunto do compromisso, sem dia/data/hora. NÃO confunda com meet_create (que cria reunião nova) — agenda_add_meet adiciona Meet a compromisso existente.
- meet_create: criar uma reunião do Google Meet ("criar meet amanhã às 14h", "meet hoje às 16h com João", "agendar videoconferência sexta às 10h com maria@email.com"). Use "meetData" com título, startDate, startTime, duration (em minutos, default 60), e attendees (lista de {name, phone?, email?}). Diferente de agenda_create — esse cria um link real do Google Meet.
- vehicle_create: cadastrar um veículo novo ("cadastre meu carro", "adiciona uma moto", "novo veículo Volkswagen Gol 2020"). Use "vehicle.brand", "vehicle.model", "vehicle.year", "vehicle.plate", "vehicle.fuelType" e "vehicle.currentKm" quando informados. Marca, modelo e ano são coletados depois se faltarem. NÃO use para gasto/abastecimento/manutenção.
- vehicle_update: alterar os dados de um veículo existente ("altere a placa do Gol para ABC1D23", "muda o km da moto para 35000", "quero alterar meu veículo"). Use "keyword" com marca, modelo ou placa do veículo original e em "vehicle" SOMENTE os novos campos. Para mudar entre pessoal e empresa, use "vehicle.newMode". Se a pessoa só disser que quer alterar, sem dizer o campo, deixe os novos campos vazios: o sistema perguntará.
- vehicle_delete: excluir um veículo ("exclua o Gol", "remova minha moto"). Use "keyword" com marca, modelo ou placa quando houver. Se não identificar qual, o sistema mostrará a lista.
- vehicle_expense: registrar gasto com veículo, carro, moto ou caminhão ("abasteci", "revisão no carro", "troca de óleo", "seguro do carro", "manutenção do carro/moto/caminhão", "conserto do carro", "paguei IPVA", "pneu do carro", "gasto com a moto", "oficina"). Se a mensagem mencionar veículo ou carro/moto/caminhão, use vehicle_expense. Inclua expenseType: fuel para combustível, maintenance para manutenção/revisão/conserto/pneu/óleo, insurance para seguro, tax para IPVA/impostos, other para outros. NÃO confunda com vehicle_create/update/delete.
- vehicle_query: ver gastos de veículos ("gastos do carro", "meus veículos")
- grocery_list_add: adicionar item(ns) à lista de compras de mercado ("põe arroz na lista", "adiciona leite e ovos na lista de compras", "preciso comprar detergente"). Use "grocery.items" com productName (e category se der pra inferir). ⚠️ Se pedir uma lista PRONTA por categoria ("põe a lista de mercearia", "quero a lista de carnes", "adiciona os itens de limpeza"), use "grocery.template" com a chave em minúsculo sem acento (mercearia, carnes, hortifruti, laticinios, padaria, bebidas, higiene, limpeza) em vez de "items".
- grocery_list_show: ver a lista de compras ("o que tem na lista de compras", "minha lista do mercado", "o que falta comprar")
- grocery_list_check: marcar item(ns) da lista como já comprado(s) ("comprei o arroz", "já peguei leite e ovos", "risca o detergente da lista"). Use "grocery.itemNames" com os nomes mencionados.
- grocery_list_clear: apagar TODOS os itens da lista ("limpe minha lista de compras", "esvazie a lista inteira"). Não use quando a pessoa citar itens específicos.
- grocery_list_remove: excluir item(ns) específicos sem marcar como comprados ("remova arroz da lista", "apague leite e pão da minha lista"). Use "grocery.itemNames".
- grocery_list_edit: alterar um item que já está na lista. Use o nome atual em "grocery.itemNames[0]" e apenas o que mudar: "grocery.newProductName" para renomear, "grocery.newQuantity" para quantidade ou "grocery.newCategory" para categoria.
- grocery_purchase: registrar uma compra de mercado COMPLETA, com itens e valores ("comprei no Assaí: arroz 25, feijão 8, leite 6"). Use "grocery.storeName" e "grocery.items" (productName, price, quantity). ⚠️ DIFERENTE de finance_register: se a mensagem só disser um valor total sem listar os itens ("gastei 350 no mercado"), é finance_register (categoria Alimentação), NÃO grocery_purchase — só use grocery_purchase quando os itens individuais forem listados.
- grocery_purchase_finish: fechar a compra a partir dos itens JÁ MARCADOS na lista de compras, sem listar os itens de novo ("finalizei a compra no Assaí, foi 120 reais", "terminei as compras, gastei 85", "fechei a lista"). Use "grocery.storeName" e "grocery.total" se vierem na mensagem (se não vierem, será perguntado depois). ⚠️ DIFERENTE de grocery_purchase: aqui os itens NÃO são listados na mensagem, vêm da lista de compras já marcada.
- grocery_list_generate: gerar/sugerir uma lista de compras básica ("gera uma lista de carnes e verduras pro dia a dia", "monta uma lista básica de mercearia pra mim", "sugere o que comprar"). Use "grocery.categories" com as chaves mencionadas (mercearia, carnes, hortifruti, laticinios, padaria, bebidas, higiene, limpeza) — se nenhuma categoria for citada, deixe vazio (gera de todas).
- grocery_price_compare: perguntar o preço de UM produto específico entre os mercados que a pessoa já comprou ("quanto pago no detergente", "onde o leite tá mais barato", "qual o preço do arroz nos mercados que comprei"). Use "grocery.productName" com o nome do produto perguntado. ⚠️ DIFERENTE de grocery_spend_query: aqui é sobre o PREÇO de um item específico comparado entre lojas, não sobre gasto total/mercado favorito.
- grocery_store_ranking: perguntar qual mercado é mais barato NO GERAL, considerando os itens comprados em comum entre eles ("qual mercado é mais barato pra mim", "onde compensa mais eu comprar", "ranking dos mercados que eu compro")
- grocery_history_query: listar as COMPRAS de mercado de fato, opcionalmente filtradas por mercado, categoria, período e posição/quantidade ("o que comprei no Muffato em agosto", "qual carne comprei semana passada", "todas as minhas compras", "minhas últimas 3 compras", "minha penúltima compra"). Use "grocery.storeName" para o mercado, "grocery.category" para uma categoria válida, "grocery.period" para o período, "grocery.allHistory": true quando pedir todo o histórico, "grocery.purchaseLimit" para últimas N, "grocery.purchaseOffset": 1 para penúltima e 2 para antepenúltima. Use "grocery.queryDetail": "items" quando pedir o que comprou ou "total" quando pedir só valores. ⚠️ DIFERENTE de grocery_spend_query (resumo total por mercado) e grocery_price_compare (preço de um produto). Para períodos relativos, copie as datas pré-calculadas.
- grocery_last_purchase_query: consultar a compra MAIS RECENTE, com ou sem mercado específico ("quanto gastei na minha última compra", "o que comprei no Muffato última vez"). Use "grocery.storeName" quando citado e "grocery.queryDetail": "total" quando pedir quanto gastou, ou "items" quando pedir o que comprou.
- grocery_spend_query: perguntar sobre gasto TOTAL/mercado favorito, sem listar itens ("quanto gastei no mercado esse mês", "quanto gastei no Muffato em agosto", "qual mercado eu gasto mais"). Quando houver, use "grocery.storeName" e "grocery.period" para filtrar corretamente.
- employee_create: cadastrar um novo funcionário ("cadastra a Ana como vendedora, 2000", "contrata o João de auxiliar, salário 1800", "registra funcionário"). Use "employee.name", "employee.role", "employee.salary". ⚠️ DIFERENTE de recurring_create: "cadastra a Ana como vendedora, salário 2000" é employee_create (está criando o REGISTRO da funcionária); "pago o funcionário 2000 todo dia 5" ou "pago a Ana 2000 todo mês" é recurring_create (está registrando o PAGAMENTO recorrente de alguém que já é funcionário) — o sinal é se a mensagem fala em CADASTRAR/CONTRATAR uma pessoa (employee_create) ou em PAGAR/UM VALOR RECORRENTE (recurring_create). Nesse segundo caso, inclua SEMPRE "recurring.employeePayment": true, e "recurring.employeeName" com o nome se a mensagem citar um (o sistema pergunta qual funcionário se não der pra saber sozinho).
- employee_list: ver funcionários e folha de pagamento ("meus funcionários", "quanto pago de folha", "lista de funcionários")
- employee_update: alterar dados de um funcionário existente ("muda o salário da Ana para 2200", "atualiza o cargo do João", "troca o nome da Ana para Mariana"). Use "keyword" com o nome atual e "employee" com os campos novos; para renomear, use "employee.newName".
- employee_deactivate: desativar/remover/demitir um funcionário, preservando o histórico financeiro ("demite o João", "desativa a Ana", "apague o funcionário João", "o João não trabalha mais aqui"). Use "keyword" com o nome.
- customer_create: cadastrar um novo CLIENTE da empresa (quem COMPRA/contrata, não quem trabalha lá) ("cadastra o cliente Pedro", "adiciona a empresa XPTO como cliente", "novo cliente: Maria, telefone 11999999999"). Use "customer.name" (obrigatório), e opcionalmente "customer.phone", "customer.email", "customer.company", "customer.address", "customer.notes". ⚠️ DIFERENTE de employee_create (funcionário TRABALHA na empresa) e de recurring_create/finance_register (lançar um valor não é cadastrar um cliente).
- customer_list: ver TODOS os clientes cadastrados ("meus clientes", "lista de clientes", "quais clientes eu tenho") — sem citar nome específico.
- customer_query: perguntar um dado (telefone, email, endereço, empresa) de UM cliente específico pelo nome ("qual o telefone do meu cliente Bruno", "qual o email da Maria", "endereço do cliente Pedro Silva"). Use "keyword" com o nome citado (pode ser só o primeiro nome, ou nome completo se a mensagem já disser sobrenome/identificação — quanto mais específico o nome citado, melhor a busca acha só um cliente).
- customer_update: alterar dados de um cliente existente ("muda o telefone do Pedro", "atualiza o email da Maria"). Use "keyword" com o nome e "customer" com os campos novos.
- customer_deactivate: desativar/remover um cliente ("remove o cliente Pedro", "esse cliente não compra mais comigo"). Use "keyword" com o nome.
- mode_switch: trocar modo (pessoal/empresa/empresarial)
- how_to: o usuário quer saber COMO USAR o bot ("como faço para", "como registro", "como funciona", "como crio", "como apago", "me explica", "como uso", "quais comandos", "posso adicionar alguém aqui", "como adiciono uma pessoa", "como acesso o painel/site", "qual o site/link do Zelo", "estou conectado no Google", "como conecto o Google", "verificar conexão do Google"). Nesse caso, escreva uma explicação clara e amigável no campo "response", com base SÓ no que o sistema realmente faz (nunca invente passos, funcionalidades ou endereços/links que não existem). ⚠️ Se a resposta precisar citar o endereço do painel, use EXATAMENTE o "Endereço do painel web" informado no início da mensagem — nunca invente um domínio diferente.
  ⚠️ LIMITES DO PRODUTO: neste momento NÃO é possível cadastrar, acessar, conectar ou sincronizar contas bancárias/cartões no Zelo. O Zelo NÃO usa e NÃO oferecerá instruções de Open Finance/Open Banking. Nunca mande procurar menus como "Conexões", "Integrações Bancárias" ou "Minhas Contas" e nunca crie um passo a passo bancário. Para esse pedido, informe a indisponibilidade e oriente: "Acesse o painel do Zelo e abra o *Suporte* no canto inferior direito."
  ⚠️ Se o usuário perguntar sobre qualquer funcionalidade que não esteja descrita nestas instruções, ou se você não tiver informação confirmada para responder, NÃO improvise. Diga que não consegue confirmar por ali e oriente a acessar o painel do Zelo e abrir o *Suporte* no canto inferior direito.
  ⚠️ Pergunta sobre "adicionar/incluir uma pessoa" é ambígua e o sistema tem DUAS coisas diferentes pra isso — explique as duas, deixando claro que são coisas distintas:
  1) Cadastrar como registro no painel, SEM a pessoa poder falar com o bot (funcionário: "cadastra a Ana como vendedora, salário 2000"; cliente: "cadastra o cliente Pedro, telefone 11999999999"; participante de reunião/Meet: ao criar o Meet, junto com o convite; lembrete pra outra pessoa: "lembra a Milena de pagar amanhã às 10h").
  2) Vincular o WhatsApp de outra pessoa (funcionário, sócio, familiar) pra ela poder conversar com o bot como se fosse a própria conta: a pessoa (ou o dono da conta, se estiver com o número dela em mãos) digita "vincular número" aqui no chat OU acessa Configurações → "Vincular WhatsApp" no painel — isso gera um código de 4 dígitos válido por 10 minutos; a pessoa manda esse código PARA ESTE MESMO NÚMERO do Zelo no WhatsApp dela, e o bot pergunta o nome, o vínculo (ex: "funcionário", "sócio") e o tipo de acesso (pessoal/empresa/ambos) — depois disso ela já pode registrar gastos, tarefas etc. direto pelo WhatsApp dela.
  ⚠️ Pergunta sobre conexão com o GOOGLE (Calendar/Meet) — se está conectado, como conectar, ou como trocar a conta conectada: SEMPRE responda mandando a pessoa entrar no painel web do Zelo (use o endereço informado no início da mensagem) → Configurações → seção "Google Calendar / Meet". Lá tem o status da conexão (mostra o e-mail conectado quando já está) e o botão "Conectar Google" (ou "Desconectar" se já estiver). Não existe forma de conectar/verificar isso pelo próprio WhatsApp — nunca invente um jeito de fazer isso por aqui.
- help: pedir lista de comandos ("ajuda", "help", "o que você faz")
- category_create: criar uma categoria personalizada de despesa/receita ("cria a categoria Nubank", "adiciona categoria Consórcio", "nova categoria Investimentos"). Use "categoryName" com o nome exato dito. ⚠️ AÇÃO DE 1 PASSO SÓ, sem perguntar nada: por padrão cria a categoria pra despesa E receita ao mesmo tempo — só restrinja a um tipo só se o usuário disser explicitamente ("categoria de receita chamada X", "só pra despesa"), usando "financeType" ("expense"/"income") nesse caso. NÃO existe limite/meta de orçamento por categoria no sistema — nunca pergunte sobre isso nem sobre mais configurações.
- finance_clear_history: apagar/limpar/zerar TODO o histórico financeiro de uma vez — não é apagar 1 lançamento específico (isso é finance_delete), é remover TUDO ("apaga todo o histórico", "limpa tudo", "zera meus registros financeiros", "apaga todas as despesas e receitas"). Se a mensagem disser claramente "pessoal", "empresa" ou "os dois"/"tudo", inclua "mode" ("personal"/"business" — se for os dois, deixe "mode" vazio, o sistema pergunta). ⚠️ Essa intent SÓ inicia a confirmação — o sistema mostra quantos lançamentos seriam apagados e pede uma confirmação forte antes de executar de verdade; você nunca confirma nem executa a exclusão sozinho no campo "response" ou em texto livre.
- unknown: não identificado

⚠️ REGRA CRÍTICA — tipo income vs expense:
Palavras que indicam RECEITA (type: "income"): recebi, ganhei, entrou, faturei, vendi, lucrei, recebo, entrada de, receita de, faturamento, pagamento recebido
Palavras que indicam DESPESA (type: "expense"): gastei, paguei, comprei, saiu, despesa, gasto, conta, fatura, parcela, custo
Se a mensagem contém "recebi", "ganhei" ou "entrou" → type DEVE ser "income", independentemente da categoria.
Exemplo: "recebi 500 de vendas" → type: "income", category: "Vendas"
Exemplo: "vendas do mês foram 2000" → type: "income", category: "Vendas"
Exemplo: "gastei 500 com vendedor" → type: "expense", category: "Outros"

⚠️ REGRA CRÍTICA — "a receber"/"a pagar" (pending), NÃO confundir com já recebido/pago:
Se a mensagem disser explicitamente que o valor está "a receber", "à receber", "contas a receber", "recebimento futuro", "ainda vou receber", "falta receber", "a pagar" (ainda não pago) — inclua "pending": true nesse(s) item(ns) de "finances"/"finance". Isso é DIFERENTE de "recebi"/"paguei" (que é o oposto: já aconteceu, não é pending) e também diferente de uma data futura já preenchida no campo "date" (que o sistema já trata como agendado automaticamente, sem precisar de "pending"). Uma lista colada com cabeçalho "À Receber"/"A Receber" ANTES dos itens significa que TODOS os itens daquela lista são "pending": true, mesmo que cada linha individual não repita a palavra.
Exemplo: "À Receber:\n10.119,00 Geo ch\n43.796,00 Rafael mcv" → dois finances, ambos com type: "income", pending: true.
Exemplo: "recebi 500 do cliente" → type: "income", SEM "pending" (já recebido).
Exemplo: "vou receber 2000 do aluguel semana que vem" → type: "income", pending: true.

As categorias válidas (incluindo as personalizadas do usuário, se houver) vêm no início da mensagem, em CATEGORIAS DE DESPESA/CATEGORIAS DE RECEITA.

MODO (business ou personal) — ⚠️ REGRA VALE PARA TODOS OS REGISTROS, não só finanças: finance_register, finance_edit, task_create, goal_create, vehicle_create, vehicle_update, vehicle_expense, recurring_create, recurring_edit, reminder_set. Sempre que a intenção criar/editar algo, tente identificar o campo "mode":
1. PRIORIDADE MÁXIMA — pedido explícito: se a mensagem disser "modo empresa"/"empresarial"/"para empresa"/"na empresa" → mode: "business". Se disser "modo pessoal"/"pessoal" → mode: "personal". Isso vale mesmo que o conteúdo pareça sugerir o modo contrário — o pedido explícito do usuário sempre vence.
2. Sem pedido explícito, infira pelo CONTEÚDO/CONTEXTO:
   - business: menções a FGTS, INSS, funcionário(s), salário de funcionário, folha, fornecedor, marketing, nota fiscal, cliente, faturamento, ou nome de projeto/cliente que soe como trabalho (ex: "construir site [nome de cliente]", "reunião com [cliente]", "entregar proposta para [empresa]"), ou categoria Funcionários/Marketing/Fornecedores/Impostos de empresa
   - personal: mercado, casa, família, lazer, saúde pessoal, contas domésticas etc. — despesa/receita/tarefa/meta claramente pessoal
3. Se realmente não der para identificar nada (ambíguo, sem pistas), não inclua o campo "mode" no JSON — o sistema usa o modo ativo do usuário como padrão.

Para datas relativas: use SEMPRE o calendário informado no início de cada mensagem para resolver dias da semana — não calcule por conta própria. Ex: se hoje é domingo e o usuário diz "terça-feira", pegue a data de terça-feira listada lá.

Retorne SOMENTE JSON válido, sem markdown:

Exemplo despesa:
{
  "intent": "finance_register",
  "confidence": 0.95,
  "finance": {
    "type": "expense",
    "amount": 45.50,
    "category": "Alimentação",
    "description": "almoço no restaurante",
    "date": "2026-07-03",
    "mode": "personal"
  }
}

Exemplo receita ("recebi 500 vendas" → DEVE ser income):
{
  "intent": "finance_register",
  "confidence": 0.95,
  "finance": {
    "type": "income",
    "amount": 500.00,
    "category": "Vendas",
    "description": "vendas",
    "date": "2026-07-03"
  }
}

Exemplo MÚLTIPLOS lançamentos em uma mensagem ("registrar os seguintes recebimentos na empresa\naluguel 1500 dia 10\niFood 50 dia 10"):
{
  "intent": "finance_register",
  "confidence": 0.95,
  "finances": [
    { "type": "income", "amount": 1500.00, "category": "Aluguel", "description": "Aluguel", "date": "2026-07-10", "mode": "business" },
    { "type": "expense", "amount": 50.00, "category": "Alimentação", "description": "iFood", "date": "2026-07-10" }
  ]
}
⚠️ Use "finances" (array) sempre que houver 2 ou mais lançamentos na mesma mensagem. Cada item segue a mesma estrutura de "finance". O mode da mensagem principal se aplica a todos quando não especificado por item.

Exemplo modo empresa:
{
  "intent": "finance_register",
  "confidence": 0.95,
  "finance": {
    "type": "expense",
    "amount": 500.00,
    "category": "Funcionários",
    "description": "FGTS",
    "date": "2026-07-03",
    "mode": "business"
  }
}

Exemplo finance_query com nome de pessoa ("quanto a Ana gastou esse mês?"):
{
  "intent": "finance_query",
  "confidence": 0.9,
  "personName": "Ana"
}

Exemplo finance_query com vínculo em vez de nome ("quanto minha esposa gastou esse mês?" — "esposa" é o vínculo, não um nome inventado):
{
  "intent": "finance_query",
  "confidence": 0.9,
  "personName": "esposa"
}

Exemplo finance_query com categoria e período — "quanto gastei com comida mes passado" (⚠️ os valores de "period" aqui são só ilustrativos; SEMPRE use os valores reais da lista de períodos pré-calculados no início de cada mensagem):
{
  "intent": "finance_query",
  "confidence": 0.9,
  "category": "Alimentação",
  "financeType": "expense",
  "period": { "from": "2026-07-01", "to": "2026-07-31" }
}

Exemplo finance_query com período de semana, sem categoria ("quanto gastei essa semana"):
{
  "intent": "finance_query",
  "confidence": 0.9,
  "financeType": "expense",
  "period": { "from": "2026-08-04", "to": "2026-08-10" }
}

Exemplo finance_query com comerciante específico — "quanto gastei com ifood mes passado" (⚠️ "ifood" é um APP/COMERCIANTE, não uma categoria genérica — use "keyword", NÃO "category"; valores de "period" ilustrativos):
{
  "intent": "finance_query",
  "confidence": 0.9,
  "keyword": "ifood",
  "financeType": "expense",
  "period": { "from": "2026-07-01", "to": "2026-07-31" }
}

Exemplo how_to ("como faço para registrar uma despesa?"):
{
  "intent": "how_to",
  "confidence": 0.95,
  "response": "Para registrar uma despesa, é simples! Me mande uma mensagem assim:\n\n• _\"Gastei 50 no mercado\"_\n• _\"Paguei 120 de conta de luz\"_\n• _\"Comprei R$200 de roupa\"_\n\nIdentificou automaticamente o valor, categoria e data de hoje! 😊"
}

OU para tarefa:
{
  "intent": "task_create",
  "confidence": 0.9,
  "task": {
    "title": "Ligar para o cliente João",
    "priority": "high",
    "dueDate": "2026-07-04",
    "mode": "business"
  }
}

Exemplo tarefa com modo pedido explicitamente ("cadastra no modo empresa a tarefa ligar pro fornecedor"):
{
  "intent": "task_create",
  "confidence": 0.9,
  "task": {
    "title": "Ligar pro fornecedor",
    "priority": "medium",
    "mode": "business"
  }
}

Exemplo tarefa com modo identificado pelo contexto, sem pedido explícito ("agende uma tarefa construir site Vitalli" — nome de projeto/cliente indica trabalho):
{
  "intent": "task_create",
  "confidence": 0.85,
  "task": {
    "title": "Construir site Vitalli",
    "priority": "medium",
    "mode": "business"
  }
}

Exemplo tarefa claramente pessoal, sem pedido explícito ("me lembra de levar o cachorro no veterinário"):
{
  "intent": "task_create",
  "confidence": 0.9,
  "task": {
    "title": "Levar o cachorro no veterinário",
    "priority": "medium",
    "mode": "personal"
  }
}

OU para atualização de tarefa:
{
  "intent": "task_update",
  "confidence": 0.9,
  "task": {
    "taskNumber": 1,
    "title": "",
    "priority": "medium",
    "newStatus": "completed"
  }
}

Exemplo para editar os dados de uma tarefa ("mude o prazo da tarefa relatório para amanhã"):
{
  "intent": "task_update",
  "confidence": 0.9,
  "task": {
    "title": "relatório",
    "priority": "medium",
    "newDueDate": "2026-07-05"
  }
}

OU para apagar tarefa ("apaga a tarefa 3"):
{
  "intent": "task_delete",
  "confidence": 0.9,
  "task": {
    "taskNumber": 3,
    "title": "",
    "priority": "medium"
  }
}

Exemplo apagar tarefa por título ("remove a tarefa de ligar pro cliente"):
{
  "intent": "task_delete",
  "confidence": 0.85,
  "task": {
    "title": "ligar pro cliente",
    "priority": "medium"
  }
}

OU para lembrete:
{
  "intent": "reminder_set",
  "confidence": 0.9,
  "reminder": {
    "message": "Pagar conta de água",
    "scheduledAt": "2026-07-05T09:00:00",
    "repeat": "monthly"
  }
}

OU para lembrete pra OUTRA pessoa ("lembra a Milena de pagar amanhã às 10h"):
{
  "intent": "reminder_set",
  "confidence": 0.9,
  "reminder": {
    "message": "Pagar",
    "scheduledAt": "2026-07-06T10:00:00",
    "repeat": "none",
    "recipientName": "Milena"
  }
}

OU para lembrete pra OUTRA pessoa com telefone citado explicitamente ("lembra o João, número 5544999999999, de pagar o boleto amanhã às 10h"):
{
  "intent": "reminder_set",
  "confidence": 0.9,
  "reminder": {
    "message": "Pagar o boleto",
    "scheduledAt": "2026-07-06T10:00:00",
    "repeat": "none",
    "recipientName": "João",
    "recipientPhone": "5544999999999"
  }
}

OU para listar lembretes ("meus lembretes"):
{
  "intent": "reminder_list",
  "confidence": 0.9
}

OU para editar lembrete ("muda o lembrete do remédio pra 8h"):
{
  "intent": "reminder_update",
  "confidence": 0.9,
  "keyword": "remédio",
  "reminder": {
    "message": "",
    "scheduledAt": "2026-07-05T08:00:00",
    "repeat": "daily"
  }
}

OU para cancelar lembrete ("cancela o lembrete do remédio"):
{
  "intent": "reminder_delete",
  "confidence": 0.9,
  "keyword": "remédio"
}

OU para editar lançamento (finance_edit) — "keyword" é o TERMO DE BUSCA do lançamento original, "finance" contém os NOVOS VALORES:
⚠️ REGRA CRÍTICA para finance_edit e finance_delete: "keyword" é SEMPRE o nome/descrição do lançamento que o usuário quer alterar. Mesmo que essa palavra também indique tipo (ex: "receita", "gasto", "despesa"), use-a como keyword de busca. Exemplo: "corrigir a receita para 2000" → keyword: "receita" (é o nome do lançamento), não registre como novo lançamento.
{
  "intent": "finance_edit",
  "confidence": 0.9,
  "keyword": "ifood",
  "finance": {
    "type": "expense",
    "amount": 60.00,
    "category": "Alimentação",
    "description": "ifood",
    "date": "2026-07-03"
  }
}

Exemplo renomear a descrição ("muda a descrição do ifood para almoço com cliente"):
{
  "intent": "finance_edit",
  "confidence": 0.9,
  "keyword": "ifood",
  "newDescription": "almoço com cliente"
}

Exemplo onde a descrição do lançamento é uma palavra que também indica tipo ("corrija a receita para 2000 no modo pessoal"):
{
  "intent": "finance_edit",
  "confidence": 0.95,
  "keyword": "receita",
  "finance": {
    "type": "income",
    "amount": 2000.00,
    "category": "Outros",
    "description": "receita",
    "date": "2026-07-04",
    "mode": "personal"
  }
}

OU para excluir lançamento (finance_delete) — "keyword" é o TERMO DE BUSCA:
{
  "intent": "finance_delete",
  "confidence": 0.9,
  "keyword": "ifood",
  "finance": {
    "type": "expense",
    "amount": 0,
    "category": "",
    "description": "ifood",
    "date": ""
  }
}

OU para criar meta (goal_create) — "title" é o NOME da meta, "targetAmount" é o valor alvo, "currentAmount" é o que já tem (opcional):
{
  "intent": "goal_create",
  "confidence": 0.9,
  "goal": {
    "title": "Viagem para a praia",
    "targetAmount": 3000.00,
    "deadline": "2026-12-31",
    "category": "Viagem"
  }
}

Exemplo goal_create sem prazo ("quero guardar 500 para emergência"):
{
  "intent": "goal_create",
  "confidence": 0.9,
  "goal": {
    "title": "Reserva de emergência",
    "targetAmount": 500.00,
    "category": "Emergência"
  }
}

Exemplo goal_create com valor já guardado ("crie a meta carro 50000 ja tenho 15000"):
{
  "intent": "goal_create",
  "confidence": 0.9,
  "goal": {
    "title": "carro",
    "targetAmount": 50000.00,
    "currentAmount": 15000.00,
    "category": "Carro"
  }
}

Exemplo goal_create no modo empresa ("cria uma meta empresa de 10000 pra reformar o escritório"):
{
  "intent": "goal_create",
  "confidence": 0.9,
  "goal": {
    "title": "Reformar o escritório",
    "targetAmount": 10000.00,
    "category": "Geral",
    "mode": "business"
  }
}

Exemplo goal_create sem valor informado ("crie uma meta pra mim") — SEM valor alvo, use targetAmount: 0:
{
  "intent": "goal_create",
  "confidence": 0.7,
  "goal": {
    "title": "",
    "targetAmount": 0
  }
}

OU para adicionar valor em meta existente (goal_add) — "title" é o nome da meta para busca:
{
  "intent": "goal_add",
  "confidence": 0.9,
  "goal": {
    "title": "viagem",
    "targetAmount": 900.00
  }
}

OU para concluir meta ("meta viagem concluída", "atingi a meta do computador") — "title" é o nome da meta para busca:
{
  "intent": "goal_complete",
  "confidence": 0.9,
  "goal": {
    "title": "viagem"
  }
}

OU para cancelar meta ("cancela a meta da viagem"):
{
  "intent": "goal_cancel",
  "confidence": 0.9,
  "keyword": "viagem"
}

OU para gasto de veículo (vehicle_expense) — SEMPRE inclua "amount" com o valor e "expenseType" correto:
{
  "intent": "vehicle_expense",
  "confidence": 0.95,
  "vehicle": {
    "amount": 50.00,
    "expenseType": "fuel",
    "description": "combustível",
    "name": ""
  }
}

OU para cadastrar veículo ("cadastre meu Volkswagen Gol 2020, placa ABC1D23"):
{
  "intent": "vehicle_create",
  "confidence": 0.95,
  "vehicle": {
    "brand": "Volkswagen",
    "model": "Gol",
    "year": 2020,
    "plate": "ABC1D23"
  }
}

OU para alterar veículo ("mude a quilometragem do Gol para 45000"):
{
  "intent": "vehicle_update",
  "confidence": 0.95,
  "keyword": "Gol",
  "vehicle": {
    "currentKm": 45000
  }
}

OU para excluir veículo ("exclua o Gol"):
{
  "intent": "vehicle_delete",
  "confidence": 0.95,
  "keyword": "Gol"
}

Exemplo manutenção ("gastei 300 de revisão no Gol"):
{
  "intent": "vehicle_expense",
  "confidence": 0.95,
  "vehicle": {
    "amount": 300.00,
    "expenseType": "maintenance",
    "description": "revisão",
    "name": "Gol"
  }
}

Exemplo IPVA ("paguei 800 de IPVA"):
{
  "intent": "vehicle_expense",
  "confidence": 0.95,
  "vehicle": {
    "amount": 800.00,
    "expenseType": "tax",
    "description": "IPVA",
    "name": ""
  }
}

Exemplo veículo da empresa ("no modo empresa, gastei 200 de combustível na Van"):
{
  "intent": "vehicle_expense",
  "confidence": 0.95,
  "vehicle": {
    "amount": 200.00,
    "expenseType": "fuel",
    "description": "combustível",
    "name": "Van",
    "mode": "business"
  }
}

OU para adicionar item à lista de compras ("põe arroz e feijão na lista"):
{
  "intent": "grocery_list_add",
  "confidence": 0.9,
  "grocery": {
    "items": [
      { "productName": "Arroz", "category": "Mercearia" },
      { "productName": "Feijão", "category": "Mercearia" }
    ]
  }
}

OU para adicionar lista pronta por categoria ("põe a lista de mercearia"):
{
  "intent": "grocery_list_add",
  "confidence": 0.9,
  "grocery": { "template": "mercearia" }
}

OU para ver a lista de compras ("o que tem na lista de compras"):
{
  "intent": "grocery_list_show",
  "confidence": 0.9
}

OU para marcar item como comprado ("já comprei o arroz"):
{
  "intent": "grocery_list_check",
  "confidence": 0.9,
  "grocery": { "itemNames": ["arroz"] }
}

OU para limpar a lista inteira ("limpe minha lista de compras"):
{
  "intent": "grocery_list_clear",
  "confidence": 0.95
}

OU para excluir itens específicos ("remova arroz e leite da lista"):
{
  "intent": "grocery_list_remove",
  "confidence": 0.95,
  "grocery": { "itemNames": ["arroz", "leite"] }
}

OU para alterar um item ("mude arroz para arroz integral na lista"):
{
  "intent": "grocery_list_edit",
  "confidence": 0.95,
  "grocery": { "itemNames": ["arroz"], "newProductName": "arroz integral" }
}

OU para registrar compra completa ("comprei no Assaí: arroz 25, feijão 8"):
{
  "intent": "grocery_purchase",
  "confidence": 0.9,
  "grocery": {
    "storeName": "Assaí",
    "items": [
      { "productName": "Arroz", "category": "Mercearia", "price": 25.00, "quantity": 1 },
      { "productName": "Feijão", "category": "Mercearia", "price": 8.00, "quantity": 1 }
    ]
  }
}

OU para gasto de mercado específico num período ("quanto gastei no Muffato em agosto de 2026"):
{
  "intent": "grocery_spend_query",
  "confidence": 0.9,
  "grocery": { "storeName": "Muffato", "period": { "from": "2026-08-01", "to": "2026-08-31" } }
}

OU para finalizar compra a partir da lista marcada ("finalizei a compra no Assaí, foi 120 reais"):
{
  "intent": "grocery_purchase_finish",
  "confidence": 0.9,
  "grocery": { "storeName": "Assaí", "total": 120.00 }
}

OU para gerar lista sugerida ("gera uma lista de carnes e verduras pro dia a dia"):
{
  "intent": "grocery_list_generate",
  "confidence": 0.9,
  "grocery": { "categories": ["carnes", "hortifruti"] }
}

OU para comparar preço de um item específico ("quanto pago no detergente"):
{
  "intent": "grocery_price_compare",
  "confidence": 0.9,
  "grocery": { "productName": "detergente" }
}

OU para ranking de mercado mais barato ("qual mercado é mais barato pra mim"):
{
  "intent": "grocery_store_ranking",
  "confidence": 0.85
}

OU para listar compras por categoria ("qual carne comprei semana passada" — valores de "period" ilustrativos, sempre usar os pré-calculados de verdade):
{
  "intent": "grocery_history_query",
  "confidence": 0.9,
  "grocery": { "category": "Carnes", "period": { "from": "2026-08-04", "to": "2026-08-10" } }
}

OU para listar todas as compras do mês, sem filtro ("o que comprei no mercado esse mês"):
{
  "intent": "grocery_history_query",
  "confidence": 0.9,
  "grocery": {}
}

OU para listar todo o histórico de um mercado ("mostre todas as compras do Muffato"):
{
  "intent": "grocery_history_query",
  "confidence": 0.95,
  "grocery": { "storeName": "Muffato", "allHistory": true, "queryDetail": "items" }
}

OU para consultar a penúltima compra ("quanto foi minha penúltima compra no Assaí"):
{
  "intent": "grocery_history_query",
  "confidence": 0.95,
  "grocery": { "storeName": "Assaí", "allHistory": true, "purchaseLimit": 1, "purchaseOffset": 1, "queryDetail": "total" }
}

OU para consultar a última compra de um mercado ("o que comprei no Muffato última vez"):
{
  "intent": "grocery_last_purchase_query",
  "confidence": 0.95,
  "grocery": { "storeName": "Muffato", "queryDetail": "items" }
}

OU para cadastrar funcionário ("cadastra a Ana como vendedora, salário 2000"):
{
  "intent": "employee_create",
  "confidence": 0.9,
  "employee": {
    "name": "Ana",
    "role": "Vendedora",
    "salary": 2000.00
  }
}

OU para listar funcionários/folha ("meus funcionários", "quanto pago de folha"):
{
  "intent": "employee_list",
  "confidence": 0.9
}

OU para editar funcionário ("muda o salário da Ana para 2200"):
{
  "intent": "employee_update",
  "confidence": 0.9,
  "keyword": "Ana",
  "employee": { "salary": 2200.00 }
}

Exemplo para renomear funcionário ("troca o nome da Ana para Mariana"):
{
  "intent": "employee_update",
  "confidence": 0.9,
  "keyword": "Ana",
  "employee": { "newName": "Mariana" }
}

OU para desativar funcionário ("demite o João"):
{
  "intent": "employee_deactivate",
  "confidence": 0.9,
  "keyword": "João"
}

OU para cadastrar cliente ("cadastra o cliente Pedro, telefone 11999999999" — Pedro COMPRA da empresa, não trabalha nela):
{
  "intent": "customer_create",
  "confidence": 0.9,
  "customer": {
    "name": "Pedro",
    "phone": "11999999999"
  }
}

OU para listar clientes ("meus clientes", "lista de clientes"):
{
  "intent": "customer_list",
  "confidence": 0.9
}

OU para perguntar um dado de um cliente específico ("qual o telefone do meu cliente Bruno"):
{
  "intent": "customer_query",
  "confidence": 0.9,
  "keyword": "Bruno"
}

Exemplo customer_query com nome mais específico ("qual o telefone do Bruno Ciola" — sobrenome incluído ajuda a achar só um, se houver mais de um Bruno):
{
  "intent": "customer_query",
  "confidence": 0.9,
  "keyword": "Bruno Ciola"
}

OU para editar cliente ("muda o telefone do Pedro para 11988887777"):
{
  "intent": "customer_update",
  "confidence": 0.9,
  "keyword": "Pedro",
  "customer": { "phone": "11988887777" }
}

OU para remover cliente ("remove o cliente Pedro"):
{
  "intent": "customer_deactivate",
  "confidence": 0.9,
  "keyword": "Pedro"
}

OU para parcelamento ("comprei geladeira 5000 em 10x de 500 todo dia 10"):
{
  "intent": "recurring_create",
  "confidence": 0.95,
  "recurring": {
    "type": "expense",
    "description": "Geladeira",
    "totalAmount": 5000,
    "amount": 500,
    "totalInstallments": 10,
    "recurrenceType": "installment",
    "repeatUnit": "monthly",
    "dayOfMonth": 10,
    "category": "Outros"
  }
}

OU para recorrente mensal despesa ("pago netflix 55 todo mês"):
{
  "intent": "recurring_create",
  "confidence": 0.95,
  "recurring": {
    "type": "expense",
    "description": "Netflix",
    "amount": 55,
    "recurrenceType": "recurring",
    "repeatUnit": "monthly",
    "category": "Lazer"
  }
}

Exemplo com prazo dito explicitamente como indefinido ("pago netflix 55 todo mês dia 10, para sempre" — "lifetime": true porque o usuário AFIRMOU que não tem fim):
{
  "intent": "recurring_create",
  "confidence": 0.95,
  "recurring": {
    "type": "expense",
    "description": "Netflix",
    "amount": 55,
    "recurrenceType": "recurring",
    "repeatUnit": "monthly",
    "dayOfMonth": 10,
    "lifetime": true,
    "category": "Lazer"
  }
}

OU para recorrente mensal receita ("recebo salário todo dia 10, 3000"):
{
  "intent": "recurring_create",
  "confidence": 0.95,
  "recurring": {
    "type": "income",
    "description": "Salário",
    "amount": 3000,
    "recurrenceType": "recurring",
    "repeatUnit": "monthly",
    "dayOfMonth": 10,
    "category": "Salário"
  }
}

⚠️ Exemplo IMPORTANTE — recorrente com PRAZO não é parcelamento ("academia 100 por mês, por 12 meses"): a academia é uma mensalidade (recorrente), só que com data pra acabar — NÃO é uma compra dividida. Use recurrenceType "recurring" (não "installment") com totalInstallments indicando quantos meses:
{
  "intent": "recurring_create",
  "confidence": 0.9,
  "recurring": {
    "type": "expense",
    "description": "Academia",
    "amount": 100,
    "totalInstallments": 12,
    "recurrenceType": "recurring",
    "repeatUnit": "monthly",
    "category": "Saúde"
  }
}

Exemplo pagamento de funcionário sem nome citado ("pago o funcionário 2000 todo dia 5" — funcionário indica modo empresa; "employeePayment":true porque é PAGAMENTO, não cadastro; o sistema pergunta qual funcionário):
{
  "intent": "recurring_create",
  "confidence": 0.9,
  "recurring": {
    "type": "expense",
    "description": "Funcionário",
    "amount": 2000,
    "recurrenceType": "recurring",
    "repeatUnit": "monthly",
    "dayOfMonth": 5,
    "category": "Funcionários",
    "mode": "business",
    "employeePayment": true
  }
}

Exemplo pagamento de funcionário COM nome citado ("pago a Ana 2000 todo mês" — inclua "employeeName" além de "employeePayment"):
{
  "intent": "recurring_create",
  "confidence": 0.9,
  "recurring": {
    "type": "expense",
    "description": "Funcionário",
    "amount": 2000,
    "recurrenceType": "recurring",
    "repeatUnit": "monthly",
    "category": "Funcionários",
    "mode": "business",
    "employeePayment": true,
    "employeeName": "Ana"
  }
}

OU para listar recorrentes ("minhas parcelas"):
{
  "intent": "recurring_query",
  "confidence": 0.9
}

OU para cancelar recorrente ("cancela a parcela da geladeira"):
{
  "intent": "recurring_cancel",
  "confidence": 0.9,
  "keyword": "geladeira"
}

OU para editar recorrente ("muda o netflix para 65"):
{
  "intent": "recurring_edit",
  "confidence": 0.9,
  "keyword": "netflix",
  "recurring": {
    "type": "expense",
    "description": "Netflix",
    "amount": 65,
    "recurrenceType": "recurring",
    "repeatUnit": "monthly",
    "category": "Lazer"
  }
}

OU para buscar arquivo no Drive ("ache o comprovante do mecânico"):
{
  "intent": "drive_search",
  "confidence": 0.9,
  "keyword": "comprovante mecânico"
}

OU para renomear/descrever último arquivo salvo ("altere e salve como comprovante de pagamento thalita"):
{
  "intent": "drive_rename",
  "confidence": 0.9,
  "keyword": "comprovante de pagamento thalita"
}

OU para agendar compromisso ("agendar reunião com cliente amanhã às 14h"):
{
  "intent": "agenda_create",
  "confidence": 0.95,
  "agendaData": {
    "title": "Reunião com cliente",
    "startDate": "2026-07-05",
    "startTime": "14:00"
  }
}

OU para agendar com local ("agendar almoço sexta às 12h no Restaurante Central"):
{
  "intent": "agenda_create",
  "confidence": 0.95,
  "agendaData": {
    "title": "Almoço",
    "startDate": "2026-07-10",
    "startTime": "12:00",
    "location": "Restaurante Central"
  }
}

OU para listar compromissos ("meus compromissos de hoje"):
{
  "intent": "agenda_list",
  "confidence": 0.9
}

OU para reagendar ("reagendar reunião com cliente para segunda às 10h") — "keyword" é o TERMO DE BUSCA do compromisso:
{
  "intent": "agenda_update",
  "confidence": 0.9,
  "keyword": "reunião com cliente",
  "agendaData": {
    "startDate": "2026-07-06",
    "startTime": "10:00"
  }
}

OU para cancelar compromisso ("cancelar o almoço de sexta") — "keyword" é o TERMO DE BUSCA:
{
  "intent": "agenda_delete",
  "confidence": 0.9,
  "keyword": "almoço"
}

OU para marcar compromisso como realizado ("já fiz a reunião com o cliente"):
{
  "intent": "agenda_done",
  "confidence": 0.9,
  "keyword": "reunião com o cliente"
}

OU para adicionar Meet a compromisso existente ("coloca via meet essa reunião", "adiciona meet no compromisso de sexta"):
{
  "intent": "agenda_add_meet",
  "confidence": 0.95,
  "keyword": "reunião"
}

OU para criar meet ("criar meet amanhã às 14h com João 11999999999"):
{
  "intent": "meet_create",
  "confidence": 0.95,
  "meetData": {
    "title": "Reunião",
    "startDate": "2026-07-05",
    "startTime": "14:00",
    "duration": 60,
    "attendees": [{"name": "João", "phone": "11999999999"}]
  }
}

OU para criar meet com e-mail ("meet hoje às 16h com cliente maria@empresa.com por 2 horas"):
{
  "intent": "meet_create",
  "confidence": 0.95,
  "meetData": {
    "title": "Reunião com cliente",
    "startDate": "2026-07-04",
    "startTime": "16:00",
    "duration": 120,
    "attendees": [{"name": "Maria", "email": "maria@empresa.com"}]
  }
}

OU para extrato detalhado de despesas ("extrato detalhado", "lista todas as despesas", "quero ver cada gasto do mês"):
{
  "intent": "finance_detail",
  "confidence": 0.9,
  "financeType": "expense"
}

OU para extrato detalhado da empresa ("extrato detalhado da empresa", "extrato despesas empresa"):
{
  "intent": "finance_detail",
  "confidence": 0.9,
  "financeType": "expense",
  "mode": "business"
}

OU para extrato de receitas ("extrato de receitas", "lista todas as receitas", "quero ver as entradas do mês"):
{
  "intent": "finance_detail",
  "confidence": 0.9,
  "financeType": "income"
}

OU para extrato de receitas da empresa ("extrato receitas empresa", "entradas da empresa"):
{
  "intent": "finance_detail",
  "confidence": 0.9,
  "financeType": "income",
  "mode": "business"
}

OU para trocar modo:
{
  "intent": "mode_switch",
  "confidence": 0.95,
  "mode": "business"
}

OU para análise de gastos ("no que eu gastei mais", "me ajude a economizar"):
{
  "intent": "finance_analysis",
  "confidence": 0.9
}

OU para confirmar lançamento agendado antes da data ("já paguei aquele aluguel que tinha agendado"):
{
  "intent": "finance_confirm_pending",
  "confidence": 0.9,
  "keyword": "aluguel"
}

OU genérico:
{
  "intent": "finance_query",
  "confidence": 0.85
}`;
}

export async function processMessage(message: string, ctx?: AiContext): Promise<AIResult> {
  const explicitUnscheduledReminder = getExplicitUnscheduledReminderResult(message, ctx?.history);
  if (explicitUnscheduledReminder) return explicitUnscheduledReminder;

  const explicitTask = getExplicitTaskCreateResult(message);
  if (explicitTask) return explicitTask;

  const explicitVehicle = getExplicitVehicleCrudResult(message);
  if (explicitVehicle) return explicitVehicle;

  const explicitUpcomingFinance = getExplicitUpcomingFinanceQueryResult(message);
  if (explicitUpcomingFinance) return explicitUpcomingFinance;

  const explicitGroceryListAdd = getExplicitGroceryListAddResult(message);
  if (explicitGroceryListAdd) return explicitGroceryListAdd;

  const explicitGroceryListManagement = getExplicitGroceryListManagementResult(message);
  if (explicitGroceryListManagement) return explicitGroceryListManagement;

  const explicitLastGroceryPurchase = getExplicitLastGroceryPurchaseResult(message);
  if (explicitLastGroceryPurchase) return explicitLastGroceryPurchase;

  const explicitGroceryHistory = getExplicitGroceryHistoryQueryResult(message);
  if (explicitGroceryHistory) return explicitGroceryHistory;

  const explicitWeeklySummary = getExplicitWeeklySummaryResult(message);
  if (explicitWeeklySummary) return explicitWeeklySummary;

  const explicitDailySummary = getExplicitDailySummaryResult(message);
  if (explicitDailySummary) return explicitDailySummary;

  const unsupportedBankConnection = getUnsupportedBankConnectionResponse(
    message,
    ctx?.user.locale,
    ctx?.history,
  );
  if (unsupportedBankConnection) {
    return { intent: "how_to", confidence: 1, response: unsupportedBankConnection };
  }

  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    console.error("[ai-processor] chave Gemini não configurada — salve em WhatsApp Bot no admin");
    return { intent: "unknown", confidence: 0 };
  }

  console.log(`[ai-processor] processando mensagem (${message.length} caracteres)`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // systemInstruction fica fora do turno — não muda entre chamadas, então
    // o provedor pode cachear/reaproveitar em vez de reprocessar as ~700
    // linhas de instrução a cada mensagem. Só o volátil (data, categorias,
    // modo do usuário) vai no conteúdo do turno.
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: buildStaticInstructions(),
      generationConfig: { temperature: 0.1 }, // classificador — não texto criativo
    });

    const result = await model.generateContent(
      `${buildVolatileContext(ctx)}\n\nMensagem do usuário: "${message}"`
    );
    const text = result.response.text().trim()
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const parsed = withExplicitRelativePeriod(message, JSON.parse(text) as AIResult);
    console.log(`[ai-processor] intent=${parsed.intent} confidence=${parsed.confidence}`);
    return parsed;
  } catch (e) {
    console.error("[ai-processor] Erro Gemini:", String(e));
    return { intent: "unknown", confidence: 0 };
  }
}

/** Chamada só no caminho de fallback (classificador não reconheceu a
 *  intenção) — troca o template fixo de replyUnknown() por uma pergunta de
 *  esclarecimento específica pro que a pessoa disse, usando o histórico
 *  recente pra soar como assessor de verdade em vez de "não entendi" toda
 *  vez. Retorna null se a chamada falhar (chamador cai pro template fixo). */
export async function generateFallbackResponse(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  locale?: string,
): Promise<string | null> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return null;

  const historyText = history.length
    ? history.map(h => `${h.role === "user" ? "Usuário" : "Você"}: ${h.content}`).join("\n")
    : "(sem mensagens anteriores)";

  const prompt = `Você é o Zelo, um assessor pessoal via WhatsApp para usuários brasileiros — não um chatbot genérico. Tom caloroso, direto e seguro, como alguém de confiança que cuida da vida financeira/organização da pessoa.

O sistema NÃO conseguiu identificar automaticamente o que a pessoa quer fazer com a mensagem abaixo. Sua única tarefa aqui é responder de um jeito humano e específico ao que ela disse, para entender o que ela precisa — nunca confirme que algo foi feito/registrado/agendado, porque NADA foi executado ainda.${localeInstruction(locale) ? `\n${localeInstruction(locale)}` : ""}

HISTÓRICO RECENTE DA CONVERSA:
${historyText}

MENSAGEM ATUAL QUE NÃO FOI ENTENDIDA: "${message}"

O que você sabe fazer (só pra te orientar, não repita essa lista pronta): registrar/editar/apagar despesas e receitas (inclusive marcar algo como "a receber"/"a pagar" ainda não recebido), ver saldo e extrato, tarefas, lembretes (inclusive pra outra pessoa), metas financeiras, gastos de veículo, contas recorrentes/parceladas, funcionários e clientes (cadastro no painel), lista de compras de mercado, agenda/reuniões no Google Meet, vincular o WhatsApp de outra pessoa à conta (código de 4 dígitos via "vincular número" ou em Configurações).

Instruções:
- Olhe o histórico: se a mensagem atual parece responder algo que VOCÊ perguntou antes, ou continuar uma correção em andamento, reconheça isso e peça a informação que ainda falta de forma pontual — não repita uma lista genérica de exemplos.
- Se a mensagem for vaga/sem relação clara com nada acima, faça 1 pergunta objetiva e específica ao que ela disse pra entender a intenção (não uma lista de todos os comandos possíveis).
- No máximo 2-3 frases curtas. Sem emoji em excesso (no máximo 1). Sem "🎉"/entusiasmo artificial.
- ⚠️ Nunca invente que o sistema tem uma funcionalidade que não está na lista acima. Isso inclui NUNCA simular um fluxo de configuração em várias etapas (tipo perguntar "quer definir um limite/meta pra isso?", "quer configurar mais alguma coisa?") pra algo que você não tem certeza que existe de verdade. Se o pedido não estiver claramente coberto pela lista ou faltar informação confirmada, diga isso com naturalidade e oriente a pessoa a entrar no painel do Zelo e abrir o *Suporte* no canto inferior direito. Uma pergunta genuína pra entender o pedido é ok; fingir que está "coletando dados" pra uma ação que não existe não é.
- ⚠️ Não existe conexão/cadastro de contas bancárias ou cartões e não existe Open Finance/Open Banking no Zelo. Nunca invente menus ou instruções para essas funcionalidades.
- Se no histórico você (o assistente) já vinha fazendo perguntas sobre algo que também não está na lista de capacidades, pare de continuar esse fluxo — reconheça que aquilo não é algo que você faz por aqui em vez de insistir na sequência de perguntas.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (!text) return null;
    if (/\b(suporte|support|soporte)\b/i.test(text)) return text;
    return `${text}\n\n${supportInsidePlatformLine(locale)}`;
  } catch (e) {
    console.error("[ai-processor] Erro generateFallbackResponse:", e);
    return null;
  }
}

export async function generateAnalysisResponse(
  question: string,
  data: {
    mode: string;
    balance: { income: number; expense: number; balance: number };
    topExpenses: Array<{ category: string; amount: number }>;
    topIncomes: Array<{ category: string; amount: number }>;
    month: string;
  },
  locale?: string
): Promise<string> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return "❌ IA não configurada.";

  const modeLabel = data.mode === "business" ? "Empresa" : "Pessoal";
  const expText = data.topExpenses.length
    ? data.topExpenses.map((e, i) => `${i + 1}. ${e.category}: R$ ${e.amount.toFixed(2)}`).join("\n")
    : "Nenhuma despesa registrada";
  const incText = data.topIncomes.length
    ? data.topIncomes.map((e, i) => `${i + 1}. ${e.category}: R$ ${e.amount.toFixed(2)}`).join("\n")
    : "Nenhuma receita registrada";

  const localeNote = localeInstruction(locale);
  const prompt = `Você é o Zelo, um assessor pessoal via WhatsApp para usuários brasileiros — não um chatbot genérico. Fale como alguém de confiança que cuida das finanças da pessoa: tom caloroso, direto e seguro, sem exagerar em formalidade nem em entusiasmo artificial (nada de "🎉 incrível!" — prefira uma segurança tranquila, tipo "aqui está o que encontrei" ou "reparei que...").${localeNote ? `\n${localeNote}` : ""}
Responda à pergunta do usuário de forma PERSONALIZADA com base nos dados REAIS dele.
Use negrito com *asterisco* (formato WhatsApp) e listas com • quando ajudar a organizar; emojis com moderação, só onde fizer sentido.
Máximo 250 palavras.

DADOS DO USUÁRIO (${modeLabel}) — ${data.month}:
Receitas: R$ ${data.balance.income.toFixed(2)}
Despesas: R$ ${data.balance.expense.toFixed(2)}
Saldo: R$ ${data.balance.balance.toFixed(2)}

Maiores despesas por categoria:
${expText}

Maiores receitas por categoria:
${incText}

Pergunta: "${question}"

Instruções:
- Se perguntou "no que gastou mais" → mostre o ranking das categorias com valores reais, destaque a maior
- Se pediu dicas para economizar → analise as categorias com mais gastos e dê 3-4 dicas práticas e específicas para esse perfil
- Se pediu análise geral → dê uma visão personalizada do perfil financeiro com base nos dados
- Sempre baseie a resposta nos dados reais, não em exemplos genéricos`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (e) {
    console.error("[ai-processor] Erro generateAnalysisResponse:", e);
    return "❌ Não consegui gerar a análise agora. Tente novamente.";
  }
}

/** Categoriza um arquivo do Drive E sugere um nome legível baseado no
 *  CONTEÚDO real (buffer), não no nome que o WhatsApp manda — que quase
 *  sempre é genérico tipo "arquivo_1723300000000.png", sem nenhuma pista do
 *  que é. Categorizar só pelo nome garantia pasta "Outros" e keywords
 *  inventadas, e o arquivo ficava salvo com esse nome sem sentido para
 *  sempre — depois ninguém acha de novo com "ache o contrato do João" etc.
 *  Quando dá pra ver o conteúdo (imagem/PDF), a IA descreve o que é de
 *  verdade; heuristicName é o fallback só quando a IA falha ou não há chave
 *  configurada, pra nunca cair de volta no nome genérico do WhatsApp. */
export async function categorizeDriveFile(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  defaultFolders: string[],
  captionHint?: string,
): Promise<{ folder: string; keywords: string[]; suggestedName: string }> {
  const ext = (originalName.match(/\.[a-z0-9]+$/i) || [""])[0];
  const heuristicName = `${captionHint?.trim() || "Arquivo"} ${todayStrBR()}${ext}`;

  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return { folder: "Outros", keywords: [], suggestedName: heuristicName };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([
      `Analise o CONTEÚDO deste arquivo (imagem ou documento) — o nome original ("${originalName}") normalmente é genérico e não ajuda, ignore-o.
${captionHint ? `Legenda enviada pelo usuário: "${captionHint}"` : ""}
Pastas disponíveis: ${defaultFolders.join(", ")}.

Retorne APENAS JSON válido no formato:
{"folder": "NomeDaPasta", "keywords": ["palavra1","palavra2","palavra3"], "suggestedName": "Nome curto e descritivo"}
- folder: a pasta mais adequada para este arquivo
- keywords: 3-5 palavras-chave em português que descrevem o conteúdo (úteis para busca futura)
- suggestedName: nome curto (até 6 palavras) e descritivo do que É o arquivo, em português, baseado no que você vê (ex: "Contrato de aluguel assinado", "Foto da fachada da loja", "Comprovante de transferência"). NUNCA use nomes genéricos como "Arquivo" ou "Imagem" — descreva o conteúdo real. Se a imagem for ilegível/genérica demais pra descrever, use a legenda do usuário como base.
Não use markdown.`,
      { inlineData: { data: buffer.toString("base64"), mimeType: mimeType || "image/jpeg" } },
    ]);
    const text = result.response.text().trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(text);
    const aiName = String(parsed.suggestedName || "").trim();
    return {
      folder: defaultFolders.includes(parsed.folder) ? parsed.folder : "Outros",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      suggestedName: aiName ? `${aiName}${ext}` : heuristicName,
    };
  } catch {
    return { folder: "Outros", keywords: [], suggestedName: heuristicName };
  }
}

export async function findDriveFileByAI(
  query: string,
  files: Array<{ id: string; originalName: string; description?: string; aiKeywords?: string[] }>
): Promise<string | null> {
  if (!files.length) return null;
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const fileList = files.map((f, i) => `${i + 1}. id="${f.id}" nome="${f.originalName}"${f.description ? ` desc="${f.description}"` : ""}${f.aiKeywords?.length ? ` keywords="${f.aiKeywords.join(",")}"` : ""}`).join("\n");
    const result = await model.generateContent(
      `Busca: "${query}"\n\nArquivos disponíveis:\n${fileList}\n\nRetorne APENAS o id do arquivo mais compatível com a busca. Se nenhum arquivo for compatível, retorne "null". Retorne APENAS o id ou "null", sem mais nada.`
    );
    const text = result.response.text().trim().replace(/"/g, "");
    return text === "null" || !text ? null : text;
  } catch {
    return null;
  }
}

export async function generateMeetAta(
  notes: string,
  meetTitle: string,
  attendeeNames: string[],
  locale?: string
): Promise<{ summary: string; decisions: string[]; tasks: string[] }> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return { summary: notes, decisions: [], tasks: [] };

  const attendeesLine = attendeeNames.length
    ? `Participantes: ${attendeeNames.join(", ")}.`
    : "";
  const localeNote = localeInstruction(locale);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(
      `Você é um assistente de ata de reunião. Com base nas notas abaixo, gere uma ata estruturada.${localeNote ? `\n${localeNote}` : ""}
${attendeesLine}
Reunião: "${meetTitle}"

Notas: "${notes}"

Retorne APENAS JSON válido no formato:
{
  "summary": "resumo objetivo da reunião em 2-4 frases",
  "decisions": ["decisão 1", "decisão 2"],
  "tasks": ["tarefa 1", "tarefa 2"]
}

- summary: o que foi discutido e decidido, de forma objetiva
- decisions: lista de decisões tomadas (máx 5)
- tasks: lista de tarefas/próximas ações (máx 8, frases curtas imperativas)
Não use markdown.`
    );
    const text = result.response.text().trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || notes,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return { summary: notes, decisions: [], tasks: [] };
  }
}

export async function extractFinanceFromDocument(
  buffer: Buffer,
  mimeType: string,
  caption?: string
): Promise<{ type: "income" | "expense"; amount: number; description: string; category: string; date: string; mode?: "personal" | "business" } | null> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return null;

  const hoje = todayStrBR();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      `Analise esta imagem/documento e determine se é um documento financeiro (nota fiscal, recibo, boleto, comprovante de pagamento, cupom fiscal, extrato bancário, fatura, etc.).

Hoje é: ${hoje}
${caption ? `\nLegenda enviada pelo usuário: "${caption}"` : ""}

Se for um documento financeiro, extraia os dados e retorne JSON:
{
  "isFinancial": true,
  "type": "expense" ou "income",
  "amount": número (valor total a pagar/recebido),
  "description": "descrição curta do que é (ex: Conta de luz, Nota fiscal Mercado, Boleto aluguel)",
  "category": "uma das categorias abaixo",
  "date": "YYYY-MM-DD (data do documento, ou hoje se não encontrar)",
  "mode": "personal" ou "business" (omitir se não puder identificar)
}

Se NÃO for um documento financeiro, retorne:
{"isFinancial": false}

CATEGORIAS DE DESPESA: ${CATEGORIES_EXPENSE.join(", ")}
CATEGORIAS DE RECEITA: ${CATEGORIES_INCOME.join(", ")}

Retorne APENAS JSON válido, sem markdown.`,
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: mimeType || "image/jpeg",
        },
      },
    ]);

    const text = result.response.text().trim()
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(text);

    if (!parsed.isFinancial) return null;

    // Normaliza formato brasileiro: "1.500,90" → 1500.90, "99,90" → 99.90
    const rawAmount = String(parsed.amount ?? "0")
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}[,.])/g, "")  // remove separador de milhar (ponto antes de 3 dígitos)
      .replace(",", ".");                // troca vírgula decimal por ponto
    const amount = Number(rawAmount);
    if (isNaN(amount) || amount <= 0) return null;

    // Valida data no formato YYYY-MM-DD
    const rawDate = String(parsed.date || "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : hoje;

    return {
      type: parsed.type === "income" ? "income" : "expense",
      amount,
      description: String(parsed.description || "documento"),
      category: String(parsed.category || "Outros"),
      date,
      mode: parsed.mode === "business" || parsed.mode === "personal" ? parsed.mode : undefined,
    };
  } catch (e) {
    console.error("[ai-processor] Erro extractFinanceFromDocument:", e);
    return null;
  }
}

export type InvoiceTransaction = { date: string; description: string; amount: number; category: string };
export type InvoiceExtraction = { transactions: InvoiceTransaction[]; bankName?: string };

/** Extrai TODAS as transações de uma fatura de cartão de crédito ou extrato (várias
 *  linhas), diferente de extractFinanceFromDocument que assume um único lançamento
 *  (uma nota/recibo/boleto). Retorna null se o documento não parecer uma fatura/extrato
 *  com múltiplos lançamentos. */
export async function extractInvoiceTransactions(
  buffer: Buffer,
  mimeType: string,
  caption?: string
): Promise<InvoiceExtraction | null> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return null;

  const hoje = todayStrBR();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      `Analise este documento e determine se é uma FATURA DE CARTÃO DE CRÉDITO ou EXTRATO com MÚLTIPLAS transações/lançamentos (compras individuais).

Hoje é: ${hoje}
${caption ? `\nLegenda enviada pelo usuário: "${caption}"` : ""}

Se for uma fatura/extrato com várias transações, extraia CADA lançamento de compra individual (ignore o "total da fatura", "pagamento efetuado", "saldo anterior" e "valor mínimo" — esses NÃO são transações individuais, são resumo/pagamento da fatura em si) e retorne JSON:
{
  "isInvoice": true,
  "bankName": "nome do banco/cartão impresso no documento, se identificável (ex: 'Nubank', 'Itaú', 'Inter', 'Bradesco') — null se não conseguir identificar",
  "transactions": [
    { "date": "YYYY-MM-DD (data da compra; se só tiver dia/mês, use o ano da fatura)", "description": "descrição curta e legível (ex: Uber, Supermercado Extra, Netflix)", "amount": número positivo, "category": "uma das categorias abaixo" }
  ]
}

Se NÃO for uma fatura/extrato com múltiplas transações (ex: é só um recibo único, uma nota fiscal, um boleto simples), retorne:
{"isInvoice": false}

CATEGORIAS: ${CATEGORIES_EXPENSE.join(", ")}

Retorne APENAS JSON válido, sem markdown, sem comentários.`,
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: mimeType || "application/pdf",
        },
      },
    ]);

    const text = result.response.text().trim()
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(text);

    if (!parsed.isInvoice || !Array.isArray(parsed.transactions)) return null;

    const transactions: InvoiceTransaction[] = [];
    for (const t of parsed.transactions) {
      const rawAmount = String(t?.amount ?? "0")
        .replace(/\s/g, "")
        .replace(/\.(?=\d{3}[,.])/g, "")
        .replace(",", ".");
      const amount = Number(rawAmount);
      if (isNaN(amount) || amount <= 0) continue;

      const rawDate = String(t?.date || "");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : hoje;

      const description = String(t?.description || "").trim().slice(0, 80) || "Lançamento da fatura";
      const category = String(t?.category || "Outros");

      transactions.push({ date, description, amount, category });
    }

    if (transactions.length === 0) return null;
    const bankName = String(parsed.bankName || "").trim() || undefined;
    return { transactions, bankName };
  } catch (e) {
    console.error("[ai-processor] Erro extractInvoiceTransactions:", e);
    return null;
  }
}

export type GroceryReceiptItem = { productName: string; category: GroceryCategory; unitPrice: number; quantity: number; unit: string };

/** Extrai os PRODUTOS individuais de um cupom fiscal de supermercado (não
 *  confundir com extractInvoiceTransactions, que é fatura de cartão com
 *  várias TRANSAÇÕES de valor único cada — aqui é uma compra ÚNICA com
 *  vários ITENS). Mesmo padrão de classificação interna (retorna null se
 *  não bater) usado em extractInvoiceTransactions/extractFinanceFromDocument. */
export async function extractGroceryReceiptItems(
  buffer: Buffer, mimeType: string, caption?: string
): Promise<{ storeName: string; date: string; items: GroceryReceiptItem[]; total: number } | null> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return null;

  const hoje = todayStrBR();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      `Analise esta imagem e determine se é um CUPOM FISCAL/NOTA FISCAL DE SUPERMERCADO com MÚLTIPLOS PRODUTOS individuais (cada linha um item comprado, com preço).

Hoje é: ${hoje}
${caption ? `\nLegenda enviada pelo usuário: "${caption}"` : ""}

⚠️ NÃO é cupom fiscal de mercado (retorne isGroceryReceipt: false nesses casos): boleto de cobrança, comprovante de PIX/transferência, fatura de cartão de crédito, conta de luz/água/internet, nota fiscal de serviço (sem lista de produtos), recibo genérico sem itens discriminados.

⚠️ DESCONTOS: é muito comum o cupom trazer uma linha de desconto (ex: "Desconto Clube X", "Desconto Fidelidade", "Vale Compras") logo ABAIXO de um produto — esse desconto vale só pra aquele item específico, não é um item novo. Quando isso acontecer:
- NÃO crie uma entrada separada pra linha de desconto.
- Subtraia o valor do desconto do "lineTotal" desse produto (lineTotal líquido = lineTotal bruto da linha do produto − desconto).
- Recalcule "unitPrice" como lineTotal líquido ÷ quantity, pra refletir o preço que a pessoa PAGOU de verdade por unidade (é isso que entra na comparação de preço entre mercados depois — usar o preço bruto sem desconto deixaria a comparação errada).
Exemplo: linha "Arroz 5kg  1  Un  25,00  25,00" seguida de "Desconto Clube X  -5,00" → um item só: productName "Arroz 5kg", quantity 1, lineTotal 20,00, unitPrice 20,00.

Se FOR um cupom fiscal de mercado com produtos, extraia:
{
  "isGroceryReceipt": true,
  "storeName": "nome do mercado/loja (do cabeçalho do cupom)",
  "date": "YYYY-MM-DD (data da compra)",
  "items": [
    { "productName": "nome do produto", "category": "uma das categorias abaixo", "unitPrice": número (preço UNITÁRIO já com desconto aplicado, se houver), "lineTotal": número (valor total da linha JÁ com desconto aplicado, se houver), "quantity": número, "unit": "un/kg/g/lt/ml/etc" }
  ],
  "total": número (o valor FINAL PAGO — geralmente rotulado "Valor Total", "Valor Pago" ou "Total" no rodapé do cupom, DEPOIS de descontos. ⚠️ NÃO use o "Subtotal" — em cupons com desconto, subtotal e total são diferentes; o campo "total" aqui é sempre o que a pessoa realmente pagou, o valor mais próximo da forma de pagamento)
}

Se NÃO for cupom de mercado, ou tiver só 1 produto, retorne: {"isGroceryReceipt": false}

CATEGORIAS: ${GROCERY_CATEGORIES.join(", ")}

Retorne APENAS JSON válido, sem markdown.`,
      { inlineData: { data: buffer.toString("base64"), mimeType: mimeType || "image/jpeg" } },
    ]);

    const text = result.response.text().trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(text);
    if (!parsed.isGroceryReceipt || !Array.isArray(parsed.items) || parsed.items.length < 2) return null;

    const items: GroceryReceiptItem[] = [];
    for (const raw of parsed.items) {
      const parseNum = (v: unknown) => Number(String(v ?? "0").replace(/\s/g, "").replace(/\.(?=\d{3}[,.])/g, "").replace(",", "."));
      let unitPrice = parseNum(raw?.unitPrice);
      const lineTotal = parseNum(raw?.lineTotal);
      let quantity = parseNum(raw?.quantity) || 1;
      if (isNaN(unitPrice) || unitPrice <= 0) {
        if (!isNaN(lineTotal) && lineTotal > 0) unitPrice = lineTotal / quantity;
        else continue;
      }
      // Cupons NFC-e mostram unitPrice e lineTotal separados — se divergirem
      // muito do que quantity×unitPrice daria, o modelo provavelmente errou
      // a quantidade (ex: leu "2" de outra coluna); recalcula pela linha.
      if (!isNaN(lineTotal) && lineTotal > 0) {
        const expected = unitPrice * quantity;
        if (Math.abs(expected - lineTotal) / lineTotal > 0.05) {
          quantity = Math.round((lineTotal / unitPrice) * 100) / 100;
        }
      }
      const productName = String(raw?.productName || "").trim().slice(0, 80);
      if (!productName) continue;
      const category = GROCERY_CATEGORIES.includes(raw?.category) ? raw.category as GroceryCategory : "Outros";
      items.push({ productName, category, unitPrice, quantity, unit: String(raw?.unit || "un").slice(0, 10) });
    }
    if (items.length < 2) return null;

    const rawTotal = String(parsed.total ?? "0").replace(/\s/g, "").replace(/\.(?=\d{3}[,.])/g, "").replace(",", ".");
    const parsedTotal = Number(rawTotal);
    const sumItems = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const total = (!isNaN(parsedTotal) && parsedTotal > 0 && Math.abs(parsedTotal - sumItems) / sumItems < 0.15) ? parsedTotal : sumItems;

    const rawDate = String(parsed.date || "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : hoje;
    const storeName = String(parsed.storeName || "Mercado").trim().slice(0, 60);

    return { storeName, date, items, total };
  } catch (e) {
    console.error("[ai-processor] Erro extractGroceryReceiptItems:", e);
    return null;
  }
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      "Transcreva exatamente o que está sendo dito neste áudio em português brasileiro. Retorne apenas a transcrição, sem comentários.",
      {
        inlineData: {
          data: audioBuffer.toString("base64"),
          mimeType: mimeType || "audio/ogg",
        },
      },
    ]);
    return result.response.text().trim() || null;
  } catch (e) {
    console.error("[ai-processor] Erro transcrição:", e);
    return null;
  }
}
