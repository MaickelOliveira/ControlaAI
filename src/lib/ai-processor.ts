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

export type AIResult = {
  intent: Intent;
  finance?: FinanceData;
  task?: TaskData;
  reminder?: ReminderData;
  goal?: GoalData;
  vehicle?: VehicleData;
  mode?: UserMode;
  keyword?: string; // palavra-chave para buscar lançamento em finance_edit/finance_delete
  response?: string; // resposta direta para how_to
  confidence: number;
};

function buildSystemPrompt() {
  const hoje = todayStrBR();
  const agora = nowISOBR();
  return `Você é um assistente de análise de intenções para um sistema de gestão pessoal e empresarial via WhatsApp em português brasileiro.
Analise a mensagem do usuário e retorne APENAS um JSON com a estrutura abaixo.

Hoje é: ${new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR")} (${hoje}) — Agora são: ${agora.slice(11,16)} (horário de Brasília/São Paulo).
Use sempre datas no formato YYYY-MM-DD e horários no formato YYYY-MM-DDTHH:MM:SS.

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

Para datas relativas: "hoje"=hoje, "amanhã"=amanhã, "próxima sexta"=calcule a data exata.

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
