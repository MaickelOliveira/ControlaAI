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
  employee?: EmployeeData;
  customer?: CustomerData;
  mode?: UserMode;
  financeType?: "income" | "expense"; // para finance_detail/finance_query: qual tipo mostrar (padrão "expense")
  keyword?: string; // palavra-chave para buscar lançamento em finance_edit/finance_delete/recurring_cancel/recurring_edit/drive_search/agenda_update/agenda_delete
  personName?: string; // nome OU vínculo (ex: "esposa", "filho") de uma pessoa específica mencionada em finance_query/balance_query/finance_detail (ex: "quanto a Ana gastou", "quanto minha esposa gastou")
  category?: string; // categoria específica perguntada em finance_query/balance_query (ex: "quanto gastei com comida" → "Alimentação")
  newDescription?: string; // finance_edit: novo texto da descrição, quando o usuário quer RENOMEAR o lançamento. Distinto de finance.description, que ecoa o lançamento encontrado e serve de busca.
  period?: { from?: string; to?: string }; // intervalo de datas (YYYY-MM-DD) para finance_query/balance_query/finance_detail/finance_analysis quando o período não é o mês atual (ex: "mês passado", "semana passada")
  response?: string; // resposta direta para how_to
  confidence: number;
};

export type AiContext = {
  user: Pick<User, "activeMode" | "customCategoriesExpense" | "customCategoriesIncome">;
};

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

  return `Hoje é: ${new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} (${hoje}) — Agora são: ${agora.slice(11,16)} (horário de Brasília/São Paulo).
Use sempre datas no formato YYYY-MM-DD e horários no formato YYYY-MM-DDTHH:MM:SS.

Calendário dos próximos dias (use para resolver dias da semana sem errar):
${nextDays.join("\n")}

⚠️ Períodos relativos JÁ CALCULADOS — use EXATAMENTE esses valores no campo "period" quando a mensagem mencionar o período correspondente (finance_query, balance_query, finance_detail, finance_analysis). NUNCA calcule essas datas por conta própria:
${periodsRef}

CATEGORIAS DE DESPESA: ${expenseCats.join(", ")}
CATEGORIAS DE RECEITA: ${incomeCats.join(", ")}
CATEGORIAS DE SUPERMERCADO (para grocery.items[].category): ${GROCERY_CATEGORIES.join(", ")}${modeLine}`;
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
- finance_register: registrar um ou VÁRIOS gastos/receitas. Se a mensagem listar múltiplos lançamentos, use o campo "finances" (array) em vez de "finance" (singular)
- finance_edit: alterar/corrigir um lançamento existente ("errei o valor", "corrija o gasto de X", "muda o valor de X para Y"). Se o usuário quiser RENOMEAR a descrição (ex: "muda a descrição do ifood para almoço com cliente", "corrige o nome do lançamento X para Y"), use "newDescription" com o novo texto — NÃO confundir com "keyword"/"finance.description", que são o termo de busca do lançamento original.
- finance_delete: excluir/apagar um lançamento ("apaga o gasto de X", "remove o lançamento do ifood", "cancela a despesa de X")
- finance_query: perguntar sobre saldo, extrato, gastos totais do mês ("quanto gastei", "resumo do mês", "extrato"). ⚠️ Se a pergunta mencionar o NOME de uma pessoa específica em vez de "eu" (ex: "quanto a Ana gastou esse mês", "quanto o Gabriel gastou", "gastos do João", "extrato da Maria"), inclua "personName" com esse nome (ex: "Ana", "Gabriel", "João", "Maria"). ⚠️ Se em vez de um nome a pergunta citar um VÍNCULO familiar/social ("quanto minha esposa gastou", "quanto meu filho gastou", "gastos do meu sócio"), inclua "personName" com a palavra do vínculo em si (ex: "esposa", "filho", "sócio"), NÃO invente um nome próprio. Isso é usado em contas compartilhadas por várias pessoas da família/equipe, cada uma com seu próprio número de WhatsApp vinculado (identificadas por nome OU por vínculo cadastrado), para filtrar só os gastos registrados por aquela pessoa.
  ⚠️ DISTINÇÃO IMPORTANTE — categoria genérica vs comerciante/app específico:
  • CATEGORIA/ASSUNTO amplo (ex: "quanto gastei com comida", "gastos com transporte", "quanto gastei de mercado"): inclua "category" com o nome EXATO de uma das categorias listadas em CATEGORIAS DE DESPESA/RECEITA (no início da mensagem) (ex: "comida"/"mercado"/"restaurante" → "Alimentação"; "uber"/"gasolina"/"combustível" → "Transporte").
  • COMERCIANTE/APP/MARCA específico (ex: "quanto gastei com ifood", "gastos no aiqfome", "quanto gastei no 99", "gasto com uber eats", "quanto gastei na farmácia X"): inclua "keyword" com o nome do comerciante (NÃO use "category" nesse caso — a descrição do lançamento pode estar abreviada, ex: "IFD" em vez de "iFood", e o sistema já sabe expandir essas variantes a partir do "keyword").
  Em ambos os casos, inclua "financeType" com "expense" ou "income" conforme o verbo da REGRA CRÍTICA abaixo (padrão "expense"). ⚠️ Se a pergunta mencionar um PERÍODO diferente do mês atual (ex: "mês passado", "semana passada", "essa semana", "primeira semana do mês", "esse ano"), inclua "period" usando EXATAMENTE os valores da lista de períodos pré-calculados no início de cada mensagem — NUNCA calcule essas datas você mesmo. Sem período mencionado, não inclua "period" (o sistema usa o mês atual por padrão).
- finance_detail: extrato DETALHADO do mês atual (ou do período pedido), listando cada lançamento por categoria. Inclua "financeType": se a mensagem contém "receitas", "entradas", "recebimentos", "income" → financeType: "income"; se contém "despesas", "gastos", "saídas", "expense" → financeType: "expense"; se não especificado → financeType: "expense" (padrão). Exemplos de ativadores: "extrato detalhado", "lista todas as despesas", "detalhe dos gastos", "extrato de despesas do mês", "extrato de receitas", "lista todas as receitas", "extrato detalhado empresa", "extrato receitas empresa". Se mencionar "empresa" ou "empresarial" inclua mode: "business"; se mencionar "pessoal" inclua mode: "personal". Se mencionar um período diferente do mês atual (ex: "extrato do mês passado", "extrato detalhado da semana passada"), inclua "period" com os valores pré-calculados no topo do prompt.
- balance_query: saldo atual ("qual meu saldo", "quanto tenho"). Aplica-se a mesma regra de "personName", "category" e "period" do finance_query quando a pergunta cita outra pessoa, uma categoria específica, ou um período diferente do mês atual.
- finance_confirm_pending: confirmar/antecipar um lançamento AGENDADO (data futura, ainda não contabilizado) antes da data chegar sozinha ("já paguei aquela conta que agendei", "confirma o pagamento do aluguel que tá agendado", "antecipa o lançamento de X"). Use "keyword" com o termo de busca do lançamento.
- finance_analysis: análise de padrões de gasto ("no que eu gastei mais", "onde estou gastando mais", "quais meus maiores gastos", "me ajude a economizar", "dicas para guardar dinheiro", "análise dos meus gastos", "onde estou perdendo dinheiro", "como posso gastar menos", "resumo por categoria", "em que categoria gasto mais"). Se mencionar período diferente do mês atual (ex: "no que gastei mais mês passado"), inclua "period" com os valores pré-calculados no topo do prompt.
- task_create: criar uma tarefa ("cria uma tarefa", "lembra de", "preciso fazer", "anota a tarefa"). Extraia SEMPRE que possível: "priority" ("high" se a mensagem disser "urgente"/"importante"/"prioridade"/"o quanto antes"; "low" se disser "sem pressa"/"quando der"/"não urgente"; senão "medium"); "dueDate" (YYYY-MM-DD, se a mensagem mencionar um prazo — use o calendário do início da mensagem pra resolver dias da semana).
- task_update: atualizar/concluir uma tarefa. Use "taskNumber" (posição na lista de "minhas tarefas") ou "title" (palavra-chave do título) pra identificar qual.
- task_delete: apagar/excluir uma tarefa ("apaga a tarefa 3", "remove a tarefa de ligar pro cliente", "deleta essa tarefa"). Use "taskNumber" ou "title" igual ao task_update.
- task_query: listar tarefas
- reminder_set: criar lembrete agendado
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
- grocery_spend_query: perguntar sobre gastos/preços de mercado especificamente ("quanto gastei no mercado esse mês", "onde o leite tá mais barato", "qual mercado eu gasto mais")
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
- how_to: o usuário quer saber COMO USAR o bot ("como faço para", "como registro", "como funciona", "como crio", "como apago", "me explica", "como uso", "quais comandos"). Nesse caso, escreva uma explicação clara e amigável no campo "response".
- help: pedir lista de comandos ("ajuda", "help", "o que você faz")
- unknown: não identificado

⚠️ REGRA CRÍTICA — tipo income vs expense:
Palavras que indicam RECEITA (type: "income"): recebi, ganhei, entrou, faturei, vendi, lucrei, recebo, entrada de, receita de, faturamento, pagamento recebido
Palavras que indicam DESPESA (type: "expense"): gastei, paguei, comprei, saiu, despesa, gasto, conta, fatura, parcela, custo
Se a mensagem contém "recebi", "ganhei" ou "entrou" → type DEVE ser "income", independentemente da categoria.
Exemplo: "recebi 500 de vendas" → type: "income", category: "Vendas"
Exemplo: "vendas do mês foram 2000" → type: "income", category: "Vendas"
Exemplo: "gastei 500 com vendedor" → type: "expense", category: "Outros"

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

export async function generateAnalysisResponse(
  question: string,
  data: {
    mode: string;
    balance: { income: number; expense: number; balance: number };
    topExpenses: Array<{ category: string; amount: number }>;
    topIncomes: Array<{ category: string; amount: number }>;
    month: string;
  }
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

  const prompt = `Você é o Zelo, um assessor pessoal via WhatsApp para usuários brasileiros — não um chatbot genérico. Fale como alguém de confiança que cuida das finanças da pessoa: tom caloroso, direto e seguro, sem exagerar em formalidade nem em entusiasmo artificial (nada de "🎉 incrível!" — prefira uma segurança tranquila, tipo "aqui está o que encontrei" ou "reparei que...").
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
  attendeeNames: string[]
): Promise<{ summary: string; decisions: string[]; tasks: string[] }> {
  const cfg = await getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return { summary: notes, decisions: [], tasks: [] };

  const attendeesLine = attendeeNames.length
    ? `Participantes: ${attendeeNames.join(", ")}.`
    : "";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(
      `Você é um assistente de ata de reunião. Com base nas notas abaixo, gere uma ata estruturada.
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

/** Extrai TODAS as transações de uma fatura de cartão de crédito ou extrato (várias
 *  linhas), diferente de extractFinanceFromDocument que assume um único lançamento
 *  (uma nota/recibo/boleto). Retorna null se o documento não parecer uma fatura/extrato
 *  com múltiplos lançamentos. */
export async function extractInvoiceTransactions(
  buffer: Buffer,
  mimeType: string,
  caption?: string
): Promise<{ transactions: InvoiceTransaction[] } | null> {
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
    return { transactions };
  } catch (e) {
    console.error("[ai-processor] Erro extractInvoiceTransactions:", e);
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
