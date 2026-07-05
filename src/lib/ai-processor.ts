import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./wppconnect";
import { nowISOBR, todayStrBR } from "./date-br";
import type { UserMode } from "./users";

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
  | "mode_switch"
  | "balance_query"
  | "goal_create"
  | "goal_add"
  | "goal_query"
  | "goal_complete"
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
  | "meet_create"
  | "how_to"
  | "help"
  | "unknown";

export type GoalData = {
  title: string;
  targetAmount: number;
  currentAmount?: number;
  deadline?: string;
  category?: string;
};

export type VehicleData = {
  name?: string;
  expenseType?: "fuel" | "maintenance" | "insurance" | "tax" | "other";
  amount?: number;
  km?: number;
  description?: string;
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
};

export type ReminderData = {
  message: string;
  scheduledAt: string;
  repeat: "none" | "daily" | "weekly" | "monthly";
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
  recurrenceType: "installment" | "recurring";
  repeatUnit: "monthly" | "weekly" | "daily" | "yearly";
  dayOfMonth?: number;
  startDate?: string;
  category?: string;
  mode?: string;
};

export type AIResult = {
  intent: Intent;
  finance?: FinanceData;
  task?: TaskData;
  reminder?: ReminderData;
  goal?: GoalData;
  vehicle?: VehicleData;
  recurring?: RecurringData;
  agendaData?: AgendaData;
  meetData?: MeetData;
  mode?: UserMode;
  keyword?: string; // palavra-chave para buscar lançamento em finance_edit/finance_delete/recurring_cancel/recurring_edit/drive_search/agenda_update/agenda_delete
  response?: string; // resposta direta para how_to
  confidence: number;
};

function buildSystemPrompt() {
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

  return `Você é um assistente de análise de intenções para um sistema de gestão pessoal e empresarial via WhatsApp em português brasileiro.
Analise a mensagem do usuário e retorne APENAS um JSON com a estrutura abaixo.

Hoje é: ${new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} (${hoje}) — Agora são: ${agora.slice(11,16)} (horário de Brasília/São Paulo).
Use sempre datas no formato YYYY-MM-DD e horários no formato YYYY-MM-DDTHH:MM:SS.

Calendário dos próximos dias (use para resolver dias da semana sem errar):
${nextDays.join("\n")}

INTENÇÕES POSSÍVEIS:
- finance_register: registrar gasto ou receita
- finance_edit: alterar/corrigir um lançamento existente ("errei o valor", "corrija o gasto de X", "muda o valor de X para Y")
- finance_delete: excluir/apagar um lançamento ("apaga o gasto de X", "remove o lançamento do ifood", "cancela a despesa de X")
- finance_query: perguntar sobre saldo, extrato, gastos totais do mês ("quanto gastei", "resumo do mês", "extrato")
- balance_query: saldo atual ("qual meu saldo", "quanto tenho")
- finance_analysis: análise de padrões de gasto ("no que eu gastei mais", "onde estou gastando mais", "quais meus maiores gastos", "me ajude a economizar", "dicas para guardar dinheiro", "análise dos meus gastos", "onde estou perdendo dinheiro", "como posso gastar menos", "resumo por categoria", "em que categoria gasto mais")
- task_create: criar uma tarefa
- task_update: atualizar/concluir uma tarefa
- task_query: listar tarefas
- reminder_set: criar lembrete agendado
- goal_create: criar meta financeira ("meta", "guardar", "juntar", "economizar para", "quero juntar X para Y", "quero guardar X para Z"). SEMPRE inclua "title" com o nome da meta e "targetAmount" com o valor alvo. Se o usuário mencionar "já tenho X", "ja tenho X", "tenho X guardado", inclua "currentAmount" com esse valor. Se o valor alvo não for especificado, use targetAmount: 0 (o sistema pedirá ao usuário).
- goal_add: adicionar valor a uma meta EXISTENTE ("adicionei X na meta", "coloquei X para X", "juntei mais X")
- goal_query: ver metas ("minhas metas", "metas", "quais são meus objetivos")
- goal_complete: concluir uma meta ("concluí meta", "meta atingida", "atingi o objetivo")
- recurring_create: cadastrar despesa ou receita parcelada ou recorrente ("comprei geladeira em 10x", "pago netflix todo mês", "recebo salário todo dia 10", "parcela do carro", "assinatura mensal"). Use recurrenceType: "installment" para parcelamentos (tem totalInstallments) e "recurring" para recorrentes contínuos.
- recurring_query: ver lançamentos recorrentes/parcelados ("minhas parcelas", "contas recorrentes", "o que tenho parcelado", "meus recorrentes")
- recurring_cancel: cancelar um recorrente/parcelado ("cancela a parcela da geladeira", "para o netflix", "remove o recorrente do aluguel")
- recurring_edit: editar um recorrente/parcelado ("muda o netflix para 65", "altera o valor da parcela da geladeira para 450")
- drive_search: buscar arquivo no Drive ("ache meu comprovante do mecânico", "me manda o contrato de aluguel", "cadê meu PDF do seguro", "encontra a foto da vistoria", "quero o boleto do banco"). Use "keyword" com os termos de busca.
- drive_rename: renomear ou descrever o arquivo salvo recentemente no Drive ("altere e salve como comprovante de pagamento thalita", "renomeia o arquivo para contrato assinado", "muda o nome para boleto de agosto", "salva como recibo do fornecedor"). Use "keyword" com o novo nome/descrição.
- agenda_create: agendar um compromisso, reunião, consulta ou evento com data e hora ("agendar reunião amanhã às 14h", "consulta médica sexta às 10h", "evento no sábado às 9h"). Use "agendaData" com título, startDate, startTime e opcionalmente location, endDate, endTime, repeat.
- agenda_list: ver os próximos compromissos agendados ("meus compromissos", "agenda de hoje", "o que tenho essa semana", "próximos eventos").
- agenda_update: reagendar ou editar um compromisso existente — apenas data, hora ou local ("reagendar a reunião para segunda às 10h", "muda o horário da consulta para 15h", "altera o local da reunião para Zoom"). Use "keyword" com o termo de busca e "agendaData" com os novos valores. NÃO use para adicionar Meet link.
- agenda_delete: cancelar ou excluir um compromisso ("cancelar a reunião de amanhã", "apaga o compromisso de sexta", "remove a consulta médica"). Use "keyword" com o termo de busca.
- agenda_add_meet: adicionar link do Google Meet a um compromisso já existente na agenda ("coloca meet nessa reunião", "adiciona meet no compromisso", "cria link de meet para a reunião", "coloca via meet", "quero que tenha meet", "adiciona videoconferência", "transforma em meet"). Use "keyword" com o nome/descrição do compromisso. NÃO confunda com meet_create (que cria reunião nova) — agenda_add_meet adiciona Meet a compromisso existente.
- meet_create: criar uma reunião do Google Meet ("criar meet amanhã às 14h", "meet hoje às 16h com João", "agendar videoconferência sexta às 10h com maria@email.com"). Use "meetData" com título, startDate, startTime, duration (em minutos, default 60), e attendees (lista de {name, phone?, email?}). Diferente de agenda_create — esse cria um link real do Google Meet.
- vehicle_expense: registrar gasto com veículo, carro, moto ou caminhão ("abasteci", "revisão no carro", "troca de óleo", "seguro do carro", "manutenção do carro/moto/caminhão", "conserto do carro", "paguei IPVA", "pneu do carro", "gasto com a moto", "oficina"). Se a mensagem mencionar veículo ou carro/moto/caminhão, use vehicle_expense. Inclua expenseType: fuel para combustível, maintenance para manutenção/revisão/conserto/pneu/óleo, insurance para seguro, tax para IPVA/impostos, other para outros.
- vehicle_query: ver gastos de veículos ("gastos do carro", "meus veículos")
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

CATEGORIAS DE DESPESA: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Vestuário, Tecnologia, Serviços, Impostos, Funcionários, Marketing, Fornecedores, Outros
CATEGORIAS DE RECEITA: Salário, Freelance, Vendas, Investimentos, Aluguel, Serviços, Reembolso, Outros

MODO (business ou personal):
- Detecte "mode" no finance baseado no contexto da mensagem:
- business: mensagem contém "modo empresa", "empresa", "FGTS", "INSS", "funcionário", "funcionarios", "salário funcionário", "folha", "fornecedor", "marketing", "nota fiscal", "cliente", "receita empresa", "faturamento", ou categoria é Funcionários/Marketing/Fornecedores/Impostos de empresa
- personal: mensagem contém "modo pessoal", "pessoal", ou é uma despesa/receita pessoal clara (mercado, salário, médico, lazer etc.)
- Se não identificado claramente, não inclua o campo "mode" no JSON (deixe undefined).

Para datas relativas: use SEMPRE o calendário acima para resolver dias da semana — não calcule por conta própria. Ex: se hoje é domingo e o usuário diz "terça-feira", pegue a data de terça-feira listada acima.

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
    "dueDate": "2026-07-04"
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

OU genérico:
{
  "intent": "finance_query",
  "confidence": 0.85
}`;
}

export async function processMessage(message: string): Promise<AIResult> {
  const cfg = getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    console.error("[ai-processor] chave Gemini não configurada — salve em WhatsApp Bot no admin");
    return { intent: "unknown", confidence: 0 };
  }

  console.log(`[ai-processor] processando: "${message}" | key=${apiKey.slice(0,8)}...`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(
      `${buildSystemPrompt()}\n\nMensagem do usuário: "${message}"`
    );
    const text = result.response.text().trim()
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    console.log(`[ai-processor] resposta Gemini: ${text.slice(0, 200)}`);

    const parsed = JSON.parse(text) as AIResult;
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
  const cfg = getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return "❌ IA não configurada.";

  const modeLabel = data.mode === "business" ? "Empresa" : "Pessoal";
  const expText = data.topExpenses.length
    ? data.topExpenses.map((e, i) => `${i + 1}. ${e.category}: R$ ${e.amount.toFixed(2)}`).join("\n")
    : "Nenhuma despesa registrada";
  const incText = data.topIncomes.length
    ? data.topIncomes.map((e, i) => `${i + 1}. ${e.category}: R$ ${e.amount.toFixed(2)}`).join("\n")
    : "Nenhuma receita registrada";

  const prompt = `Você é um assistente financeiro pessoal amigável via WhatsApp para usuários brasileiros.
Responda à pergunta do usuário de forma PERSONALIZADA com base nos dados REAIS dele.
Use emojis, negrito com *asterisco* (formato WhatsApp), listas com • e seja direto e útil.
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

export async function categorizeDriveFile(filename: string, defaultFolders: string[]): Promise<{ folder: string; keywords: string[] }> {
  const cfg = getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return { folder: "Outros", keywords: [] };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(
      `Analise o nome do arquivo: "${filename}".
Pastas disponíveis: ${defaultFolders.join(", ")}.
Retorne APENAS JSON válido no formato: {"folder": "NomeDaPasta", "keywords": ["palavra1","palavra2","palavra3"]}
- folder: a pasta mais adequada para este arquivo
- keywords: 3-5 palavras-chave em português que descrevem o conteúdo do arquivo (úteis para busca futura)
Não use markdown.`
    );
    const text = result.response.text().trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(text);
    return {
      folder: defaultFolders.includes(parsed.folder) ? parsed.folder : "Outros",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  } catch {
    return { folder: "Outros", keywords: [] };
  }
}

export async function findDriveFileByAI(
  query: string,
  files: Array<{ id: string; originalName: string; description?: string; aiKeywords?: string[] }>
): Promise<string | null> {
  if (!files.length) return null;
  const cfg = getConfig();
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
  const cfg = getConfig();
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

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
  const cfg = getConfig();
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
