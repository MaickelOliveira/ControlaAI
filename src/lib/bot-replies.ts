import type { Finance } from "./finances";
import type { Task } from "./tasks";
import type { RecurringTransaction } from "./recurring";
import type { Appointment } from "./agenda";
import type { Meet } from "./meets";
import { formatCurrency } from "./finances";
import { PRIORITY_LABEL, formatDueDate } from "./tasks";
import type { UserMode } from "./users";
import { formatDateBR, formatDateTimeBR } from "./date-br";

const TZ = "America/Sao_Paulo";

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
  const dateStr = formatDateBR(scheduledAt);
  const timeStr = date.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
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
  return `🤖 *ControlaAI — Guia completo*

Fale de forma natural, como se estivesse conversando! Veja tudo que você pode fazer:

━━━━━━━━━━━━━━━
💰 *REGISTRAR DINHEIRO*
Mande uma mensagem contando o que aconteceu:
• _"Gastei 50 no mercado"_ → despesa registrada
• _"Paguei 120 de conta de luz"_ → despesa registrada
• _"Recebi 2000 de salário"_ → receita registrada
• _"Entrou 500 de freela"_ → receita registrada
📸 *Dica extra:* Envie uma foto de nota fiscal ou boleto — registro automático!

━━━━━━━━━━━━━━━
📊 *VER SEUS NÚMEROS*
• _"Meu saldo"_ → ver quanto entrou e saiu no mês
• _"Extrato"_ → ver os últimos lançamentos
• _"Extrato detalhado"_ → cada gasto separado por categoria
• _"No que gastei mais?"_ → análise inteligente com dicas
• _"Extrato detalhado da empresa"_ → gastos da conta empresa

━━━━━━━━━━━━━━━
✏️ *CORRIGIR OU APAGAR*
Errou um valor? Sem problema:
• _"Corrige o ifood para 80 reais"_ → altera o valor
• _"Muda a categoria do mercado para Lazer"_ → altera categoria
• _"Apaga o gasto do ifood"_ → remove o lançamento

━━━━━━━━━━━━━━━
💳 *PARCELAS E CONTAS FIXAS*
Para compras parceladas ou contas que repetem todo mês:
• _"Comprei geladeira 5000 em 10x de 500"_ → cadastra as parcelas
• _"Pago netflix 55 todo mês"_ → cadastra conta mensal
• _"Recebo aluguel todo dia 5, 1200"_ → receita mensal
• _"Minhas parcelas"_ → ver todas as contas e parcelas ativas
• _"Cancela o netflix"_ → para de acompanhar
• _"Muda o netflix para 65"_ → atualiza o valor
O bot te avisa automaticamente todo mês no dia do vencimento! 🔔

━━━━━━━━━━━━━━━
🚗 *GASTOS COM VEÍCULO*
Se você tem carro ou moto cadastrado no dashboard:
• _"Abasteci 80 reais"_ → registra combustível
• _"Paguei 300 de revisão no carro"_ → manutenção
• _"Seguro do carro 1200"_ → seguro
• _"Paguei 800 de IPVA"_ → imposto

━━━━━━━━━━━━━━━
📋 *TAREFAS — Lista de afazeres*
• _"Criar tarefa: ligar pro João amanhã"_ → cria uma tarefa
• _"Minhas tarefas"_ → ver o que está pendente
• _"Concluir 1"_ → marca a tarefa número 1 como feita
• _"Tarefa 2 em andamento"_ → atualiza o status

━━━━━━━━━━━━━━━
🔔 *LEMBRETES*
O bot te manda mensagem na hora certa:
• _"Me lembra de pagar conta sexta às 9h"_ → aviso único
• _"Todo mês dia 5 me lembra de pagar aluguel"_ → aviso mensal
• _"Todo dia às 8h me lembra de tomar remédio"_ → aviso diário

━━━━━━━━━━━━━━━
🎯 *METAS — Guardar dinheiro*
Quer juntar dinheiro para algo? O bot acompanha pra você:
• _"Quero guardar 5000 para viagem até dezembro"_ → cria a meta
• _"Adicionei 300 na meta viagem"_ → atualiza quanto já guardou
• _"Minhas metas"_ → ver o progresso de cada meta
• _"Meta viagem concluída"_ → marca como atingida 🎉

━━━━━━━━━━━━━━━
🗓️ *AGENDA — Compromissos*
• _"Agendar reunião amanhã às 14h"_ → cria compromisso
• _"Consulta médica sexta às 10h no Hospital X"_ → com local
• _"Meus compromissos"_ → ver o que está agendado
• _"Reagendar reunião para segunda às 10h"_ → muda o horário
• _"Cancela a consulta de sexta"_ → remove

━━━━━━━━━━━━━━━
🎥 *REUNIÃO POR VÍDEO (Google Meet)*
Cria um link de reunião e avisa os participantes:
• _"Criar meet amanhã às 14h com João 11999999999"_
• _"Meet sexta às 15h com maria@empresa.com por 2 horas"_
• _"Adiciona meet na reunião de segunda"_ → coloca link no compromisso existente
Participantes com WhatsApp recebem o link automaticamente!

━━━━━━━━━━━━━━━
📁 *ARQUIVOS (Drive inteligente)*
• Envie qualquer foto, PDF ou documento → salvo e organizado
• Nota fiscal ou boleto → lançado automaticamente como despesa
• Para guardar no Drive mesmo: envie com legenda _"salva"_ ou _"guarda"_
• _"Ache o contrato do João"_ → te manda o arquivo de volta
• _"Salva como contrato assinado"_ → renomeia o último arquivo

━━━━━━━━━━━━━━━
🏢 *MODO EMPRESA / PESSOAL*
Separa as finanças da empresa das finanças pessoais:
• _"Modo empresa"_ → próximos registros vão para a empresa
• _"Modo pessoal"_ → volta para os gastos pessoais
O modo atual aparece em cada resposta (👤 Pessoal ou 🏢 Empresa)

━━━━━━━━━━━━━━━
💡 *Lembre-se:* fale naturalmente, como no dia a dia. O ControlaAI entende português normal!`;
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

export function buildRecurringNotification(r: RecurringTransaction): string {
  const fmt = (v: number) => formatCurrency(v);
  const dueDateStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
  const typeEmoji = r.type === "income" ? "💰" : "💸";
  if (r.recurrenceType === "installment") {
    return `🔔 *Parcela ${r.paidInstallments + 1}/${r.totalInstallments} vence hoje!*\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 Vencimento: ${dueDateStr}\n\nFoi ${r.type === "income" ? "recebida" : "paga"}? Responda *sim* ou *não*`;
  }
  return `🔔 *Conta recorrente para hoje:*\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\nFoi ${r.type === "income" ? "recebida" : "paga"}? Responda *sim* ou *não*`;
}

export function replyRecurringConfirmed(r: RecurringTransaction, _finance: Finance): string {
  const fmt = (v: number) => formatCurrency(v);
  if (r.status === "completed") {
    return `✅ *Parabéns! Todas as parcelas quitadas!*\n\n💳 ${r.description}\nTotal pago: ${fmt((r.totalAmount ?? r.amount * (r.totalInstallments ?? 1)))}\n\nLançamento registrado em Finanças. 🎉`;
  }
  const nextStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
  const typeLabel = r.type === "income" ? "Recebimento" : "Pagamento";
  return `✅ *${typeLabel} confirmado!*\n\n💳 ${r.description} — ${fmt(r.amount)}\n\nLançamento registrado em Finanças.\n📅 Próximo vencimento: ${nextStr}`;
}

export function replyRecurringCreated(r: RecurringTransaction): string {
  const fmt = (v: number) => formatCurrency(v);
  const nextStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
  const typeEmoji = r.type === "income" ? "💰" : "💸";
  const unitLabel: Record<string, string> = { monthly: "mensal", weekly: "semanal", daily: "diário", yearly: "anual" };
  if (r.recurrenceType === "installment") {
    return `✅ *Parcelamento cadastrado!*\n\n${typeEmoji} *${r.description}*\n💳 ${fmt(r.amount)}/parcela × ${r.totalInstallments} vezes\n📅 Primeiro vencimento: ${nextStr}\n\nVou te lembrar às 20h em cada vencimento. 👍`;
  }
  return `✅ *Recorrente cadastrado!*\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n🔁 ${unitLabel[r.repeatUnit] ?? r.repeatUnit}\n📅 Próximo vencimento: ${nextStr}\n\nVou te lembrar às 20h em cada vencimento. 👍`;
}

export function replyRecurringList(items: RecurringTransaction[]): string {
  const fmt = (v: number) => formatCurrency(v);
  if (!items.length) return "📋 Nenhum lançamento recorrente ou parcelado ativo.";
  let msg = `📋 *Seus lançamentos recorrentes:*\n\n`;
  const installments = items.filter(r => r.recurrenceType === "installment");
  const recurring = items.filter(r => r.recurrenceType === "recurring");
  if (installments.length) {
    msg += `*💳 Parcelas:*\n`;
    installments.forEach(r => {
      const next = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
      msg += `• ${r.description} — ${fmt(r.amount)} (${r.paidInstallments}/${r.totalInstallments}) · próx. ${next}\n`;
    });
    msg += "\n";
  }
  if (recurring.length) {
    msg += `*🔁 Recorrentes:*\n`;
    recurring.forEach(r => {
      const next = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
      msg += `• ${r.description} — ${fmt(r.amount)} · próx. ${next}\n`;
    });
  }
  return msg.trim();
}

export function replyFileSaved(originalName: string, folder: string): string {
  return `📁 *Arquivo salvo no Drive!*\n\n📄 ${originalName}\n🗂️ Pasta: ${folder}\n\nPara buscar depois: _"ache meu arquivo ${originalName.split(".")[0]}"_ 🔍`;
}

export function replyFileFound(originalName: string): string {
  return `🔍 *Arquivo encontrado!*\n\n📄 ${originalName}\n\nEnviando agora... ⬆️`;
}

export function replyFileNotFound(query: string): string {
  return `❓ Não encontrei nenhum arquivo com *"${query}"* no Drive.\n\nTente outros termos ou veja sua biblioteca em *📁 Drive* no dashboard.`;
}

export function replyDriveFileList(count: number): string {
  if (count === 0) return `📁 *Drive vazio!*\n\nEnvie um arquivo (PDF, imagem, documento) por aqui e eu organizo automaticamente.`;
  return `📁 *Drive Inteligente*\n\nVocê tem *${count} arquivo${count > 1 ? "s" : ""}* salvos.\n\nPara buscar: _"ache o comprovante do mecânico"_\nPara ver tudo: acesse *📁 Drive* no dashboard. 🌐`;
}

export function replyAgendaCreated(a: Appointment): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  const endLine = a.endAt ? ` até ${formatDateTimeBR(a.endAt).slice(11)}` : "";
  return `✅ *Compromisso agendado!*\n\n📅 *${a.title}*\n🕒 ${dateTime}${endLine}${locationLine}`;
}

export function replyAgendaList(appointments: Appointment[]): string {
  if (!appointments.length) return `🗓️ Nenhum compromisso agendado nos próximos dias.\n\nPara agendar: _"Agendar reunião amanhã às 14h"_`;
  let msg = `🗓️ *Seus próximos compromissos (${appointments.length}):*\n\n`;
  appointments.slice(0, 10).forEach((a, i) => {
    const dateTime = formatDateTimeBR(a.startAt);
    const loc = a.location ? ` · ${a.location}` : "";
    msg += `${i + 1}. *${a.title}*\n   🕒 ${dateTime}${loc}\n\n`;
  });
  return msg.trim();
}

export function replyAgendaUpdated(a: Appointment): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  return `✅ *Compromisso atualizado!*\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}`;
}

export function replyAgendaDeleted(title: string): string {
  return `🗑️ Compromisso *${title}* cancelado!`;
}

type MeetLike = {
  title: string; startAt: string; endAt?: string; meetLink?: string;
};

export function replyMeetCreated(meet: MeetLike, attendees?: Array<{ phone?: string; email?: string }>): string {
  const start = formatDateTimeBR(meet.startAt);
  const end = meet.endAt
    ? new Date(meet.endAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : "";
  const endStr = end ? ` → ${end}` : "";
  const meetStr = meet.meetLink ? `\n🔗 ${meet.meetLink}` : "";
  const withPhones = (attendees || []).filter(a => a.phone).length;
  const inviteNote = withPhones > 0 ? `\n👥 Convite enviado para ${withPhones} participante${withPhones > 1 ? "s" : ""} via WhatsApp` : "";
  const withEmails = (attendees || []).filter(a => a.email).length;
  const emailNote = withEmails > 0 ? `\n📧 Convite por e-mail para ${withEmails} participante${withEmails > 1 ? "s" : ""}` : "";
  return `✅ *${meet.meetLink ? "Reunião criada com Google Meet!" : "Compromisso criado!"}*\n\n📅 *${meet.title}*\n🕒 ${start}${endStr}${meetStr}${inviteNote}${emailNote}`;
}

export function replyMeetInvite(meet: MeetLike, name: string): string {
  return `📩 *${name}, você foi convidado para uma reunião!*\n\n📅 *${meet.title}*\n🕒 ${formatDateTimeBR(meet.startAt)}\n\n🔗 *Link:* ${meet.meetLink ?? "(sem link)"}\n\nTe vejo lá! 👋`;
}

export function replyMeetAtaRequest(title: string): string {
  return `📋 *Sua reunião "${title}" encerrou!*\n\nPara gerar a ata automática, me envie um *áudio* ou *texto* resumindo o que foi discutido:\n\n• Principais pontos debatidos\n• Decisões tomadas\n• Próximas ações\n\nVou estruturar tudo e criar as tarefas automaticamente. 🤖`;
}

export function replyMeetAtaGenerated(title: string, ata: { summary: string; decisions: string[]; tasks: string[] }): string {
  let msg = `📋 *Ata da Reunião: ${title}*\n\n`;
  msg += `📝 *Resumo:*\n${ata.summary}\n`;
  if (ata.decisions.length) {
    msg += `\n✅ *Decisões tomadas:*\n`;
    ata.decisions.forEach(d => { msg += `• ${d}\n`; });
  }
  if (ata.tasks.length) {
    msg += `\n📌 *Tarefas criadas (${ata.tasks.length}):*\n`;
    ata.tasks.forEach(t => { msg += `• ${t}\n`; });
    msg += `\nJá adicionadas em *📋 Tarefas* no dashboard!`;
  }
  return msg.trim();
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
