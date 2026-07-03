import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./wppconnect";
import { nowISOBR, todayStrBR } from "./date-br";
import type { UserMode } from "./users";

export type Intent =
  | "finance_register"
  | "finance_query"
  | "finance_edit"
  | "finance_delete"
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
  | "help"
  | "unknown";

export type GoalData = {
  title: string;
  targetAmount: number;
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
- finance_query: perguntar sobre saldo, extrato, gastos do mês
- balance_query: pergunta sobre saldo atual
- task_create: criar uma tarefa
- task_update: atualizar/concluir uma tarefa
- task_query: listar tarefas
- reminder_set: criar lembrete agendado
- goal_create: criar meta financeira ("meta", "guardar", "juntar", "economizar para")
- goal_add: adicionar valor em uma meta ("adicionei X na meta", "coloquei X para X")
- goal_query: ver metas ("minhas metas", "metas")
- goal_complete: concluir uma meta ("concluí meta", "meta atingida")
- vehicle_expense: registrar gasto com veículo ("abasteci", "revisão no carro", "troca de óleo", "seguro do carro")
- vehicle_query: ver gastos de veículos ("gastos do carro", "meus veículos")
- mode_switch: trocar modo (pessoal/empresa/empresarial)
- help: pedir ajuda
- unknown: não identificado

CATEGORIAS DE DESPESA: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Vestuário, Tecnologia, Serviços, Impostos, Funcionários, Marketing, Fornecedores, Outros
CATEGORIAS DE RECEITA: Salário, Freelance, Vendas, Investimentos, Aluguel, Serviços, Reembolso, Outros

MODO (business ou personal):
- Detecte "mode" no finance baseado no contexto da mensagem:
- business: mensagem contém "modo empresa", "empresa", "FGTS", "INSS", "funcionário", "funcionarios", "salário funcionário", "folha", "fornecedor", "marketing", "nota fiscal", "cliente", "receita empresa", "faturamento", ou categoria é Funcionários/Marketing/Fornecedores/Impostos de empresa
- personal: mensagem contém "modo pessoal", "pessoal", ou é uma despesa/receita pessoal clara (mercado, salário, médico, lazer etc.)
- Se não identificado claramente, não inclua o campo "mode" no JSON (deixe undefined).

Para datas relativas: "hoje"=hoje, "amanhã"=amanhã, "próxima sexta"=calcule a data exata.

Retorne SOMENTE JSON válido, sem markdown:
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

Exemplo com modo empresa detectado automaticamente:
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

OU para adicionar valor em meta (goal_add):
{
  "intent": "goal_add",
  "confidence": 0.9,
  "goal": {
    "title": "viagem",
    "targetAmount": 900.00
  }
}

OU para trocar modo:
{
  "intent": "mode_switch",
  "confidence": 0.95,
  "mode": "business"
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
