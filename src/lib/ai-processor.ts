import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./wppconnect";
import type { UserMode } from "./users";

export type Intent =
  | "finance_register"
  | "finance_query"
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
  confidence: number;
};

const SYSTEM_PROMPT = `Você é um assistente de análise de intenções para um sistema de gestão pessoal e empresarial via WhatsApp em português brasileiro.
Analise a mensagem do usuário e retorne APENAS um JSON com a estrutura abaixo.

Hoje é: ${new Date().toLocaleDateString("pt-BR")} (${new Date().toISOString().slice(0,10)})

INTENÇÕES POSSÍVEIS:
- finance_register: registrar gasto ou receita
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
    "date": "2026-07-03"
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

export async function processMessage(message: string): Promise<AIResult> {
  const cfg = getConfig();
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    console.error("[ai-processor] GEMINI_API_KEY não configurada");
    return { intent: "unknown", confidence: 0 };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(
      `${SYSTEM_PROMPT}\n\nMensagem do usuário: "${message}"`
    );
    const text = result.response.text().trim()
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

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
