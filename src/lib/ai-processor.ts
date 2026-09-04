import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./whatsapp-config";
import { nowISOBR, todayStrBR } from "./date-br";
import type { UserMode, User } from "./users";
import { CATEGORIES_EXPENSE, CATEGORIES_INCOME } from "./finances";
import { GROCERY_CATEGORIES, type GroceryCategory } from "./grocery";

export type Intent =
  | "finance_register"
  | "finance_query"
  | "finance_edit"
  | "finance_delete"
  | "finance_analysis"
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
  | "grocery_purchase"
  | "grocery_purchase_finish"
  | "grocery_list_generate"
  | "grocery_price_compare"
  | "grocery_store_ranking"
  | "grocery_history_query"
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
};

export type EmployeeData = {
  name?: string;
  role?: string;
  salary?: number;
  startDate?: string;
  phone?: string;
  email?: string;
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
  financeType?: "income" | "expense"; // para finance_detail/finance_query: qual tipo mostrar (padrão "expense"); para category_create: restringe a categoria a só esse tipo (padrão: ambos)
  keyword?: string; // palavra-chave para buscar lançamento em finance_edit/finance_delete/recurring_cancel/recurring_edit/drive_search/agenda_update/agenda_delete
  personName?: string; // nome OU vínculo (ex: "esposa", "filho") de uma pessoa específica mencionada em finance_query/balance_query/finance_detail (ex: "quanto a Ana gastou", "quanto minha esposa gastou")
  category?: string; // categoria específica perguntada em finance_query/balance_query (ex: "quanto gastei com comida" → "Alimentação")
  newDescription?: string; // finance_edit: novo texto da descrição, quando o usuário quer RENOMEAR o lançamento. Distinto de finance.description, que ecoa o lançamento encontrado e serve de busca.
  period?: { from?: string; to?: string }; // intervalo de datas (YYYY-MM-DD) para finance_query/balance_query/finance_detail/finance_analysis quando o período não é o mês atual (ex: "mês passado", "semana passada")
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
  const lastMonthFrom = mkNoon(ty, tm - 1, 1);
  const lastMonthTo = mkNoon(ty, tm, 0);

  const todayDow = todayAnchor.getDay(); // 0=domingo..6=sábado
  const diffToMonday = todayDow === 0 ? -6 : 1 - todayDow;
  const thisWeekMon = new Date(todayAnchor); thisWeekMon.setDate(todayAnchor.getDate() + diffToMonday);
  const thisWeekSun = new Date(thisWeekMon); thisWeekSun.setDate(thisWeekMon.getDate() + 6);
  const lastWeekMon = new Date(thisWeekMon); lastWeekMon.setDate(thisWeekMon.getDate() - 7);
  const lastWeekSun = new Date(thisWeekMon); lastWeekSun.setDate(thisWeekMon.getDate() - 1);

  const firstWeekFrom = mkNoon(ty, tm, 1);
  const firstWeekTo = mkNoon(ty, tm, 7);
  const yearFrom = mkNoon(ty, 0, 1);

  const periodsRef = [
    `- Este mês / mês atual (${monthLabel(ty, tm)}): from "${toYMD(curMonthFrom)}" to "${toYMD(curMonthTo)}"`,
    `- Mês passado (${monthLabel(ty, tm - 1)}): from "${toYMD(lastMonthFrom)}" to "${toYMD(lastMonthTo)}"`,
    `- Esta semana: from "${toYMD(thisWeekMon)}" to "${toYMD(thisWeekSun)}"`,
    `- Semana passada: from "${toYMD(lastWeekMon)}" to "${toYMD(lastWeekSun)}"`,
    `- Primeira semana deste mês: from "${toYMD(firstWeekFrom)}" to "${toYMD(firstWeekTo)}"`,
    `- Este ano: from "${toYMD(yearFrom)}" to "${hoje}"`,
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

⚠️ Períodos relativos JÁ CALCULADOS — use EXATAMENTE esses valores no campo "period" quando a mensagem mencionar o período correspondente (finance_query, balance_query, finance_detail, finance_analysis). NUNCA calcule essas datas por conta própria:
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
- finance_detail: extrato DETALHADO do mês atual (ou do período pedido), listando cada lançamento por categoria. Inclua "financeType": se a mensagem contém "receitas", "entradas", "recebimentos", "income" → financeType: "income"; se contém "despesas", "gastos", "saídas", "expense" → financeType: "expense"; se não especificado → financeType: "expense" (padrão). Exemplos de ativadores: "extrato detalhado", "lista todas as despesas", "detalhe dos gastos", "extrato de despesas do mês", "extrato de receitas", "lista todas as receitas", "extrato detalhado empresa", "extrato receitas empresa", "cria uma planilha", "manda minha planilha", "quero uma planilha das entradas/saídas", "envia o extrato", "me manda um relatório". ⚠️ O sistema não gera arquivo de planilha (.xlsx/.csv) — quando o pedido usar a palavra "planilha", ainda assim use finance_detail (o sistema manda a lista de lançamentos em texto), NUNCA responda how_to/unknown só porque a palavra usada foi "planilha" em vez de "extrato". Se mencionar "empresa" ou "empresarial" inclua mode: "business"; se mencionar "pessoal" inclua mode: "personal". Se mencionar um período diferente do mês atual (ex: "extrato do mês passado", "extrato detalhado da semana passada"), inclua "period" com os valores pré-calculados no topo do prompt.
- balance_query: saldo atual ("qual meu saldo", "quanto tenho"). Aplica-se a mesma regra de "personName", "category" e "period" do finance_query quando a pergunta cita outra pessoa, uma categoria específica, ou um período diferente do mês atual.
- finance_confirm_pending: confirmar/antecipar um lançamento AGENDADO (data futura, ainda não contabilizado) antes da data chegar sozinha ("já paguei aquela conta que agendei", "confirma o pagamento do aluguel que tá agendado", "antecipa o lançamento de X"). Use "keyword" com o termo de busca do lançamento.
- finance_analysis: análise de padrões de gasto ("no que eu gastei mais", "onde estou gastando mais", "quais meus maiores gastos", "me ajude a economizar", "dicas para guardar dinheiro", "análise dos meus gastos", "onde estou perdendo dinheiro", "como posso gastar menos", "resumo por categoria", "em que categoria gasto mais"). Se mencionar período diferente do mês atual (ex: "no que gastei mais mês passado"), inclua "period" com os valores pré-calculados no topo do prompt.
- task_create: criar uma tarefa ("cria uma tarefa", "lembra de", "preciso fazer", "anota a tarefa"). Extraia SEMPRE que possível: "priority" ("high" se a mensagem disser "urgente"/"importante"/"prioridade"/"o quanto antes"; "low" se disser "sem pressa"/"quando der"/"não urgente"; senão "medium"); "dueDate" (YYYY-MM-DD, se a mensagem mencionar um prazo — use o calendário do início da mensagem pra resolver dias da semana).
- task_update: atualizar/concluir uma tarefa. Use "taskNumber" (posição na lista de "minhas tarefas") ou "title" (palavra-chave do título) pra identificar qual.
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
- vehicle_expense: registrar gasto com veículo, carro, moto ou caminhão ("abasteci", "revisão no carro", "troca de óleo", "seguro do carro", "manutenção do carro/moto/caminhão", "conserto do carro", "paguei IPVA", "pneu do carro", "gasto com a moto", "oficina"). Se a mensagem mencionar veículo ou carro/moto/caminhão, use vehicle_expense. Inclua expenseType: fuel para combustível, maintenance para manutenção/revisão/conserto/pneu/óleo, insurance para seguro, tax para IPVA/impostos, other para outros.
- vehicle_query: ver gastos de veículos ("gastos do carro", "meus veículos")
- grocery_list_add: adicionar item(ns) à lista de compras de mercado ("põe arroz na lista", "adiciona leite e ovos na lista de compras", "preciso comprar detergente"). Use "grocery.items" com productName (e category se der pra inferir). ⚠️ Se pedir uma lista PRONTA por categoria ("põe a lista de mercearia", "quero a lista de carnes", "adiciona os itens de limpeza"), use "grocery.template" com a chave em minúsculo sem acento (mercearia, carnes, hortifruti, laticinios, padaria, bebidas, higiene, limpeza) em vez de "items".
- grocery_list_show: ver a lista de compras ("o que tem na lista de compras", "minha lista do mercado", "o que falta comprar")
- grocery_list_check: marcar item(ns) da lista como já comprado(s) ("comprei o arroz", "já peguei leite e ovos", "risca o detergente da lista"). Use "grocery.itemNames" com os nomes mencionados.
- grocery_purchase: registrar uma compra de mercado COMPLETA, com itens e valores ("comprei no Assaí: arroz 25, feijão 8, leite 6"). Use "grocery.storeName" e "grocery.items" (productName, price, quantity). ⚠️ DIFERENTE de finance_register: se a mensagem só disser um valor total sem listar os itens ("gastei 350 no mercado"), é finance_register (categoria Alimentação), NÃO grocery_purchase — só use grocery_purchase quando os itens individuais forem listados.
- grocery_purchase_finish: fechar a compra a partir dos itens JÁ MARCADOS na lista de compras, sem listar os itens de novo ("finalizei a compra no Assaí, foi 120 reais", "terminei as compras, gastei 85", "fechei a lista"). Use "grocery.storeName" e "grocery.total" se vierem na mensagem (se não vierem, será perguntado depois). ⚠️ DIFERENTE de grocery_purchase: aqui os itens NÃO são listados na mensagem, vêm da lista de compras já marcada.
- grocery_list_generate: gerar/sugerir uma lista de compras básica ("gera uma lista de carnes e verduras pro dia a dia", "monta uma lista básica de mercearia pra mim", "sugere o que comprar"). Use "grocery.categories" com as chaves mencionadas (mercearia, carnes, hortifruti, laticinios, padaria, bebidas, higiene, limpeza) — se nenhuma categoria for citada, deixe vazio (gera de todas).
- grocery_price_compare: perguntar o preço de UM produto específico entre os mercados que a pessoa já comprou ("quanto pago no detergente", "onde o leite tá mais barato", "qual o preço do arroz nos mercados que comprei"). Use "grocery.productName" com o nome do produto perguntado. ⚠️ DIFERENTE de grocery_spend_query: aqui é sobre o PREÇO de um item específico comparado entre lojas, não sobre gasto total/mercado favorito.
- grocery_store_ranking: perguntar qual mercado é mais barato NO GERAL, considerando os itens comprados em comum entre eles ("qual mercado é mais barato pra mim", "onde compensa mais eu comprar", "ranking dos mercados que eu compro")
- grocery_history_query: listar as COMPRAS de mercado de fato (itens + valor), opcionalmente filtrado por categoria e/ou período ("o que comprei no mercado esse mês", "qual carne comprei semana passada", "minhas compras de mercado", "resumo das compras do mês", "o que comprei de limpeza esse mês"). ⚠️ DIFERENTE de grocery_spend_query (que só dá o total por mercado, sem listar item) e de grocery_price_compare (preço de 1 item específico entre lojas) — aqui é "o que eu comprei", com os itens de verdade. Se mencionar uma categoria (carne, limpeza, bebida, etc.), inclua "grocery.category" com uma das categorias válidas (Carnes, Mercearia, Hortifruti, Laticínios, Padaria, Bebidas, Limpeza, Higiene, Outros). Se mencionar um período diferente do mês atual ("semana passada", "mês passado"), inclua "grocery.period" com os valores pré-calculados do início da mensagem (mesma regra de finance_query — NUNCA calcule a data por conta própria).
- grocery_spend_query: perguntar sobre gasto TOTAL/mercado favorito de mercado, SEM listar os itens comprados ("quanto gastei no mercado esse mês", "qual mercado eu gasto mais", "quantas vezes fui no Assaí")
- employee_create: cadastrar um novo funcionário ("cadastra a Ana como vendedora, 2000", "contrata o João de auxiliar, salário 1800", "registra funcionário"). Use "employee.name", "employee.role", "employee.salary". ⚠️ DIFERENTE de recurring_create: "cadastra a Ana como vendedora, salário 2000" é employee_create (está criando o REGISTRO da funcionária); "pago o funcionário 2000 todo dia 5" ou "pago a Ana 2000 todo mês" é recurring_create (está registrando o PAGAMENTO recorrente de alguém que já é funcionário) — o sinal é se a mensagem fala em CADASTRAR/CONTRATAR uma pessoa (employee_create) ou em PAGAR/UM VALOR RECORRENTE (recurring_create). Nesse segundo caso, inclua SEMPRE "recurring.employeePayment": true, e "recurring.employeeName" com o nome se a mensagem citar um (o sistema pergunta qual funcionário se não der pra saber sozinho).
- employee_list: ver funcionários e folha de pagamento ("meus funcionários", "quanto pago de folha", "lista de funcionários")
- employee_update: alterar dados de um funcionário existente ("muda o salário da Ana para 2200", "atualiza o cargo do João"). Use "keyword" com o nome e "employee" com os campos novos.
- employee_deactivate: desativar/demitir um funcionário ("demite o João", "desativa a Ana", "o João não trabalha mais aqui"). Use "keyword" com o nome.
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

MODO (business ou personal) — ⚠️ REGRA VALE PARA TODOS OS REGISTROS, não só finanças: finance_register, finance_edit, task_create, goal_create, vehicle_expense, recurring_create, recurring_edit, reminder_set. Sempre que a intenção criar/editar algo, tente identificar o campo "mode":
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

OU para gasto de mercado ("quanto gastei no mercado esse mês"):
{
  "intent": "grocery_spend_query",
  "confidence": 0.85
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
  const explicitTask = getExplicitTaskCreateResult(message);
  if (explicitTask) return explicitTask;

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

    const parsed = JSON.parse(text) as AIResult;
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
