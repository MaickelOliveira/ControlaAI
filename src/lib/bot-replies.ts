import type { Finance } from "./finances";
import type { Task } from "./tasks";
import { formatCurrency } from "./finances";
import { PRIORITY_LABEL, formatDueDate } from "./tasks";
import type { UserMode } from "./users";

export function replyFinanceRegistered(f: Finance, balance: number): string {
  const emoji = f.type === "income" ? "💰" : "💸";
  const tipo = f.type === "income" ? "Receita" : "Despesa";
  const balEmoji = balance >= 0 ? "📈" : "📉";
  const modeLabel = f.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";

  return `✅ *${tipo} registrada!*\n\n${emoji} *${formatCurrency(f.amount)}* — ${f.category}\n📝 ${f.description}\n📅 ${new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}\n\n${balEmoji} *Saldo ${modeLabel}:* ${formatCurrency(balance)}`;
}

export function replyBalance(personal: { income: number; expense: number; balance: number }, business?: { income: number; expense: number; balance: number }): string {
  const month = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  let msg = `📊 *Resumo de ${month}*\n\n`;

  msg += `👤 *Pessoal*\n`;
  msg += `  💰 Receitas: ${formatCurrency(personal.income)}\n`;
  msg += `  💸 Despesas: ${formatCurrency(personal.expense)}\n`;
  msg += `  ${personal.balance >= 0 ? "📈" : "📉"} Saldo: ${formatCurrency(personal.balance)}\n`;

  if (business) {
    msg += `\n🏢 *Empresa*\n`;
    msg += `  💰 Receitas: ${formatCurrency(business.income)}\n`;
    msg += `  💸 Despesas: ${formatCurrency(business.expense)}\n`;
    msg += `  ${business.balance >= 0 ? "📈" : "📉"} Saldo: ${formatCurrency(business.balance)}\n`;
  }
  return msg;
}

export function replyTaskCreated(task: Task): string {
  const due = task.dueDate ? `\n📅 Prazo: ${formatDueDate(task.dueDate)}` : "";
  const priority = PRIORITY_LABEL[task.priority];
  return `✅ *Tarefa criada!*\n\n📌 ${task.title}\n${priority}${due}`;
}

export function replyTaskList(tasks: Task[], mode: UserMode): string {
  if (!tasks.length) {
    return `✨ Nenhuma tarefa pendente${mode === "business" ? " na empresa" : ""}!`;
  }
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
  let msg = `📋 *Tarefas pendentes — ${modeLabel} (${tasks.length}):*\n\n`;
  tasks.slice(0, 10).forEach((t, i) => {
    const due = t.dueDate ? ` — ${formatDueDate(t.dueDate)}` : "";
    const pr = t.priority === "high" ? "⚡" : t.priority === "medium" ? "🟡" : "⚪";
    msg += `${i + 1}. ${pr} ${t.title}${due}\n`;
  });
  msg += `\nPara concluir: _concluir [número]_`;
  return msg;
}

export function replyTaskUpdated(task: Task): string {
  const statusMsg: Record<string, string> = {
    completed: "✅ Tarefa concluída!",
    in_progress: "🔄 Tarefa em andamento!",
    pending: "⏳ Tarefa voltou para pendente!",
  };
  return `${statusMsg[task.status] ?? "✅ Tarefa atualizada!"}\n\n📌 ${task.title}`;
}

export function replyReminderSet(message: string, scheduledAt: string, repeat: string): string {
  const date = new Date(scheduledAt);
  const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const repeatLabel: Record<string, string> = {
    none: "Uma vez",
    daily: "Todo dia",
    weekly: "Toda semana",
    monthly: "Todo mês",
  };
  return `🔔 *Lembrete agendado!*\n\n💬 ${message}\n📅 ${dateStr} às ${timeStr}\n🔁 ${repeatLabel[repeat] ?? "Uma vez"}`;
}

export function replyModeSwitch(mode: UserMode): string {
  if (mode === "business") return "🏢 Alternado para modo *Empresarial*!\nSeus próximos registros entrarão como finanças e tarefas da empresa.";
  return "👤 Alternado para modo *Pessoal*!\nSeus próximos registros entrarão como finanças e tarefas pessoais.";
}

export function replyHelp(): string {
  return `🤖 *ControlaAI — Como usar:*

💰 *Finanças:*
• _"Gastei 50 no mercado"_ — registra despesa
• _"Recebi 2000 de salário"_ — registra receita
• _"extrato"_ — ver últimos lançamentos
• _"Meu saldo"_ — ver saldo do mês

✏️ *Editar/Excluir lançamento:*
• _"Corrija o gasto do ifood para 80 reais"_
• _"Muda a categoria do mercado para Lazer"_
• _"Apaga o gasto do ifood"_
• _"Remove o lançamento do mercado"_

📋 *Tarefas:*
• _"Criar tarefa: ligar pro cliente"_ — nova tarefa
• _"Minhas tarefas"_ — ver pendentes
• _"Concluir 1"_ — marcar tarefa 1 como concluída

🔔 *Lembretes:*
• _"Me lembra de pagar conta sexta às 9h"_
• _"Todo mês dia 5 pagar aluguel"_

🎯 *Metas:*
• _"Meta: guardar 5000 para viagem até dezembro"_
• _"Minhas metas"_

🔄 *Modos:*
• _"Modo empresa"_ — finanças empresariais
• _"Modo pessoal"_ — finanças pessoais

📊 *Relatórios:*
• _"Saldo do mês"_ — resumo financeiro`;
}

export function replyOnboardingWelcome(): string {
  return `🎉 *Bem-vindo ao ControlaAI!*

Sou seu assistente inteligente de gestão via WhatsApp.

Para começar, qual é o seu nome?`;
}

export function replyOnboardingPlan(name: string): string {
  return `Olá, *${name}*! 👋

Você quer usar o ControlaAI para:

1️⃣ *Uso Pessoal* — controle de gastos e tarefas pessoais
2️⃣ *Uso Empresarial* — gestão financeira e de equipe da empresa

Responda *1* ou *2*:`;
}

export function replyOnboardingDone(name: string, plan: string): string {
  return `✅ Conta criada com sucesso!\n\n👤 *${name}* — Modo ${plan === "business" ? "Empresarial 🏢" : "Pessoal 👤"}\n\nVocê tem *14 dias grátis* para usar tudo!\n\nDigite *ajuda* para ver os comandos disponíveis. 🚀`;
}

export function replyTrialExpired(): string {
  return `⚠️ Seu período de teste encerrou.\n\nPara continuar usando o ControlaAI, acesse o dashboard e assine um plano:\n🌐 controlaai.app/planos`;
}

export function replyUnknown(originalMsg?: string): string {
  const quote = originalMsg ? `\n\n> _"${originalMsg}"_\n` : "\n";
  return `🤔 Não entendi bem o que você quer fazer.${quote}
Pode reformular? Por exemplo:

💸 *Despesa:* _"gastei 50 no mercado"_
💰 *Receita:* _"recebi 3000 de salário"_
📋 *Tarefa:* _"criar tarefa: ligar pro João"_
🔔 *Lembrete:* _"me lembra amanhã às 9h de pagar conta"_
🎯 *Meta:* _"meta: guardar 5000 para viagem"_
📊 *Saldo:* _"meu saldo"_ ou _"extrato"_

Ou digite *ajuda* para ver todos os comandos.`;
}

export function replyLowConfidence(intent: string, details: string, originalMsg: string): string {
  const intentLabel: Record<string, string> = {
    finance_register: "registrar um lançamento financeiro",
    finance_edit: "editar um lançamento",
    finance_delete: "excluir um lançamento",
    task_create: "criar uma tarefa",
    task_update: "atualizar uma tarefa",
    reminder_set: "criar um lembrete",
    goal_create: "criar uma meta",
    goal_add: "adicionar valor a uma meta",
  };
  const label = intentLabel[intent] || intent;
  return `🤔 Entendi que você quer *${label}*, mas não tenho certeza dos detalhes.\n\n> _"${originalMsg}"_\n\n${details}\n\nEstá correto? Se sim, confirme. Se não, reformule a mensagem.`;
}
