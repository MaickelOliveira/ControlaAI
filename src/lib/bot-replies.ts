import type { Finance } from "./finances";
import type { Task } from "./tasks";
import type { Reminder } from "./reminders";
import { type RecurringTransaction, recurringRemaining } from "./recurring";
import type { Appointment } from "./agenda";
import type { Meet } from "./meets";
import { formatCurrency } from "./finances";
import { PRIORITY_LABEL, formatDueDate } from "./tasks";
import type { UserMode } from "./users";
import { formatDateBR, formatDateTimeBR } from "./date-br";
import type { ShoppingListItem, GroceryPurchase } from "./grocery";
import type { Employee } from "./employees";
import type { Customer } from "./customers";

const TZ = "America/Sao_Paulo";

export function replyFinanceRegistered(f: Finance, balance: number): string {
  const emoji = f.type === "income" ? "💰" : "💸";
  const tipo = f.type === "income" ? "receita" : "despesa";
  const modeLabel = f.mode === "business" ? "Empresa" : "Pessoal";

  return `Anotado. ${emoji} *${formatCurrency(f.amount)}* — ${f.category} (${tipo})\n📝 ${f.description}\n📅 ${new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}\n\nSaldo ${modeLabel}: *${formatCurrency(balance)}*`;
}

export function replyBalance(personal: { income: number; expense: number; balance: number }, business?: { income: number; expense: number; balance: number }, personName?: string, periodLabel?: string): string {
  const period = periodLabel || new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  let msg = personName ? `Aqui está o resumo de ${period}, ${personName}:\n\n` : `Aqui está o resumo de ${period}:\n\n`;

  msg += `👤 *Pessoal*\n`;
  msg += `  Receitas: ${formatCurrency(personal.income)}\n`;
  msg += `  Despesas: ${formatCurrency(personal.expense)}\n`;
  msg += `  Saldo: ${formatCurrency(personal.balance)}\n`;

  if (business) {
    msg += `\n🏢 *Empresa*\n`;
    msg += `  Receitas: ${formatCurrency(business.income)}\n`;
    msg += `  Despesas: ${formatCurrency(business.expense)}\n`;
    msg += `  Saldo: ${formatCurrency(business.balance)}\n`;
  }
  return msg;
}

export function replyPersonNotFound(name: string): string {
  return `Não encontrei ninguém chamado *${name}* entre os números vinculados à sua conta.\n\nPara eu identificar quem registrou cada gasto, cada pessoa precisa vincular o próprio WhatsApp em *Configurações* e me dizer o nome quando eu perguntar.`;
}

export function replyWppNameSaved(name: string): string {
  return `Prazer, *${name}*. Já pode contar comigo — é só me falar naturalmente o que precisa.\n\nSe quiser ver tudo que sei fazer, digite *ajuda*.`;
}

export function replyTaskCreated(task: Task): string {
  const due = task.dueDate ? `\n📅 Prazo: ${formatDueDate(task.dueDate)}` : "";
  const priority = PRIORITY_LABEL[task.priority];
  return `Anotado na sua lista. 📌 ${task.title}\n${priority}${due}`;
}

export function replyTaskList(tasks: Task[], mode: UserMode): string {
  if (!tasks.length) {
    return `Nenhuma tarefa pendente${mode === "business" ? " na empresa" : ""} — tudo em dia por aqui.`;
  }
  const modeLabel = mode === "business" ? "Empresa" : "Pessoal";
  let msg = `📋 *Suas tarefas pendentes — ${modeLabel} (${tasks.length}):*\n\n`;
  tasks.slice(0, 10).forEach((t, i) => {
    const due = t.dueDate ? ` — ${formatDueDate(t.dueDate)}` : "";
    const pr = t.priority === "high" ? "⚡" : t.priority === "medium" ? "🟡" : "⚪";
    msg += `${i + 1}. ${pr} ${t.title}${due}\n`;
  });
  msg += `\nPara concluir alguma: _concluir [número]_`;
  return msg;
}

export function replyTaskUpdated(task: Task): string {
  const statusMsg: Record<string, string> = {
    completed: "Concluída — muito bem.",
    in_progress: "Marquei como em andamento.",
    pending: "Voltou para pendente, sem problemas.",
  };
  return `${statusMsg[task.status] ?? "Tarefa atualizada."}\n\n📌 ${task.title}`;
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
  return `Pode deixar, eu te aviso. 🔔\n\n💬 ${message}\n📅 ${dateStr} às ${timeStr}\n🔁 ${repeatLabel[repeat] ?? "Uma vez"}`;
}

export function replyReminderList(reminders: Reminder[]): string {
  if (!reminders.length) return "🔔 Nenhum lembrete ativo no momento.";
  const repeatLabel: Record<string, string> = { none: "uma vez", daily: "todo dia", weekly: "toda semana", monthly: "todo mês" };
  let msg = `🔔 *Seus lembretes ativos (${reminders.length}):*\n\n`;
  reminders.slice(0, 10).forEach((r, i) => {
    const dateStr = formatDateBR(r.scheduledAt);
    const timeStr = new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    msg += `${i + 1}. 💬 ${r.message} — ${dateStr} às ${timeStr} _(${repeatLabel[r.repeat] ?? "uma vez"})_\n`;
  });
  return msg.trim();
}

export function replyReminderUpdated(r: Reminder): string {
  const dateStr = formatDateBR(r.scheduledAt);
  const timeStr = new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `Combinado, atualizei. 🔔\n\n💬 ${r.message}\n📅 ${dateStr} às ${timeStr}`;
}

export function replyReminderDeleted(message: string): string {
  return `🗑️ Lembrete cancelado.\n\n💬 ${message}`;
}

export function replyModeSwitch(mode: UserMode): string {
  if (mode === "business") return "Certo, agora estamos no modo *Empresarial*. 🏢\nSeus próximos registros entram como finanças e tarefas da empresa.";
  return "Certo, voltamos ao modo *Pessoal*. 👤\nSeus próximos registros entram como finanças e tarefas pessoais.";
}

export function replyHelp(): string {
  return `*Zelo — seu assessor pessoal*

Fale comigo naturalmente, como falaria com alguém de confiança que cuida das suas coisas. Aqui está tudo que posso fazer por você:

━━━━━━━━━━━━━━━
💰 *REGISTRAR DINHEIRO*
Me conte o que aconteceu que eu anoto:
• _"Gastei 50 no mercado"_ → despesa registrada
• _"Paguei 120 de conta de luz"_ → despesa registrada
• _"Recebi 2000 de salário"_ → receita registrada
• _"Entrou 500 de freela"_ → receita registrada
📸 Também aceito foto de nota fiscal ou boleto — registro sozinho.

━━━━━━━━━━━━━━━
📊 *VER SEUS NÚMEROS*
• _"Meu saldo"_ → quanto entrou e saiu no mês
• _"Extrato"_ → seus últimos lançamentos
• _"Extrato detalhado"_ → cada gasto separado por categoria
• _"No que gastei mais?"_ → uma análise com dicas
• _"Extrato detalhado da empresa"_ → gastos da conta empresa

━━━━━━━━━━━━━━━
✏️ *CORRIGIR OU APAGAR*
Errou um valor? Sem problema, eu ajusto:
• _"Corrige o ifood para 80 reais"_ → altero o valor
• _"Muda a categoria do mercado para Lazer"_ → altero a categoria
• _"Apaga o gasto do ifood"_ → removo o lançamento

━━━━━━━━━━━━━━━
💳 *PARCELAS E CONTAS FIXAS*
Para compras parceladas ou contas que se repetem:
• _"Comprei geladeira 5000 em 10x de 500"_ → cadastro as parcelas
• _"Pago netflix 55 todo mês"_ → cadastro a conta mensal
• _"Recebo aluguel todo dia 5, 1200"_ → receita mensal
• _"Minhas parcelas"_ → todas as contas e parcelas ativas
• _"Cancela o netflix"_ → paro de acompanhar
• _"Muda o netflix para 65"_ → atualizo o valor
Eu aviso automaticamente no dia do vencimento. 🔔

━━━━━━━━━━━━━━━
🚗 *GASTOS COM VEÍCULO*
Se você tem carro ou moto cadastrado no painel:
• _"Abasteci 80 reais"_ → registro combustível
• _"Paguei 300 de revisão no carro"_ → manutenção
• _"Seguro do carro 1200"_ → seguro
• _"Paguei 800 de IPVA"_ → imposto

━━━━━━━━━━━━━━━
📋 *TAREFAS*
• _"Criar tarefa: ligar pro João amanhã"_ → crio a tarefa
• _"Minhas tarefas"_ → o que está pendente
• _"Concluir 1"_ → marco a tarefa número 1 como feita
• _"Tarefa 2 em andamento"_ → atualizo o status

━━━━━━━━━━━━━━━
🔔 *LEMBRETES*
Eu te aviso na hora certa:
• _"Me lembra de pagar conta sexta às 9h"_ → aviso único
• _"Todo mês dia 5 me lembra de pagar aluguel"_ → aviso mensal
• _"Todo dia às 8h me lembra de tomar remédio"_ → aviso diário

━━━━━━━━━━━━━━━
🎯 *METAS*
Quer juntar dinheiro para algo? Eu acompanho pra você:
• _"Quero guardar 5000 para viagem até dezembro"_ → crio a meta
• _"Adicionei 300 na meta viagem"_ → atualizo o progresso
• _"Minhas metas"_ → como está cada uma
• _"Meta viagem concluída"_ → marco como atingida

━━━━━━━━━━━━━━━
🗓️ *AGENDA*
• _"Agendar reunião amanhã às 14h"_ → crio o compromisso
• _"Consulta médica sexta às 10h no Hospital X"_ → com local
• _"Meus compromissos"_ → o que está agendado
• _"Reagendar reunião para segunda às 10h"_ → mudo o horário
• _"Cancela a consulta de sexta"_ → removo

━━━━━━━━━━━━━━━
🎥 *REUNIÃO POR VÍDEO (Google Meet)*
Eu crio o link e aviso os participantes:
• _"Criar meet amanhã às 14h com João 11999999999"_
• _"Meet sexta às 15h com maria@empresa.com por 2 horas"_
• _"Adiciona meet na reunião de segunda"_ → coloco o link no compromisso existente
Quem tem WhatsApp vinculado recebe o convite automaticamente.

━━━━━━━━━━━━━━━
📁 *ARQUIVOS (Drive inteligente)*
• Envie qualquer foto, PDF ou documento → eu guardo e organizo
• Nota fiscal ou boleto → já registro como despesa
• Pra eu só guardar, sem lançar nada: mande com legenda _"salva"_ ou _"guarda"_
• _"Ache o contrato do João"_ → te devolvo o arquivo
• _"Salva como contrato assinado"_ → renomeio o último arquivo

━━━━━━━━━━━━━━━
🏢 *MODO EMPRESA / PESSOAL*
Separo as finanças da empresa das suas pessoais:
• _"Modo empresa"_ → próximos registros vão para a empresa
• _"Modo pessoal"_ → volto para os gastos pessoais
O modo atual sempre aparece nas minhas respostas.

━━━━━━━━━━━━━━━
Pode falar comigo do seu jeito — sem formalidade, sem comando decorado. Eu entendo.`;
}

export function replyOnboardingWelcome(): string {
  return `Olá! Sou o *Zelo*, seu assessor pessoal.

A partir de agora, cuido das suas finanças, tarefas e agenda direto por aqui, no WhatsApp.

Para começar, como posso te chamar?`;
}

export function replyOnboardingPlan(name: string): string {
  return `Muito bem, *${name}*.

Você prefere que eu cuide de:

1️⃣ *Uso Pessoal* — seus gastos e tarefas do dia a dia
2️⃣ *Uso Empresarial* — as finanças e a equipe da sua empresa

Me responda *1* ou *2*.`;
}

export function replyOnboardingDone(name: string, plan: string): string {
  return `Pronto, *${name}* — sua conta já está configurada no modo ${plan === "business" ? "Empresarial 🏢" : "Pessoal 👤"}.\n\nVocê tem *14 dias grátis* para experimentar tudo sem compromisso.\n\nQuando quiser ver o que posso fazer por você, digite *ajuda*.`;
}

export function replyTrialExpired(): string {
  return `Seu período de teste chegou ao fim.\n\nPara eu continuar cuidando das suas finanças e da sua agenda, é só assinar um plano no painel:\n🌐 controlaai.app/planos`;
}

export function buildRecurringNotification(r: RecurringTransaction): string {
  const fmt = (v: number) => formatCurrency(v);
  const dueDateStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
  const typeEmoji = r.type === "income" ? "💰" : "💸";
  if (r.recurrenceType === "installment") {
    return `Passando para lembrar: a parcela ${r.paidInstallments + 1}/${r.totalInstallments} vence hoje.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\nJá foi ${r.type === "income" ? "recebida" : "paga"}? Me responda *sim* ou *não*.`;
  }
  return `Passando para lembrar da conta de hoje:\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\nJá foi ${r.type === "income" ? "recebida" : "paga"}? Me responda *sim* ou *não*.`;
}

export function replyRecurringConfirmed(r: RecurringTransaction, _finance: Finance): string {
  const fmt = (v: number) => formatCurrency(v);
  if (r.status === "completed") {
    const total = fmt(r.totalAmount ?? r.amount * (r.totalInstallments ?? 1));
    if (r.recurrenceType === "installment") {
      return `Essa foi a última — todas as parcelas quitadas. 🎉\n\n💳 ${r.description}\nTotal pago: ${total}\n\nJá registrei o lançamento em Finanças.`;
    }
    return `Essa foi a última — encerrei o acompanhamento de *${r.description}*. 🎉\n\n🔁 ${r.totalInstallments} de ${r.totalInstallments} ocorrências\nTotal: ${total}\n\nJá registrei o lançamento em Finanças.`;
  }
  const nextStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
  const typeLabel = r.type === "income" ? "recebimento" : "pagamento";
  return `Certo, ${typeLabel} confirmado.\n\n💳 ${r.description} — ${fmt(r.amount)}\n\nJá registrei em Finanças.\n📅 Próximo vencimento: ${nextStr}`;
}

export function replyRecurringCreated(r: RecurringTransaction): string {
  const fmt = (v: number) => formatCurrency(v);
  const nextStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
  const typeEmoji = r.type === "income" ? "💰" : "💸";
  const unitLabel: Record<string, string> = { monthly: "mensal", weekly: "semanal", daily: "diário", yearly: "anual" };
  if (r.recurrenceType === "installment") {
    return `Cadastrado. Vou acompanhar cada parcela pra você.\n\n${typeEmoji} *${r.description}*\n💳 ${fmt(r.amount)}/parcela × ${r.totalInstallments ?? "?"} vezes\n📅 Primeiro vencimento: ${nextStr}\n\nAviso você às 20h de cada vencimento.`;
  }
  const termLine = r.totalInstallments ? ` · ${r.totalInstallments} vezes` : "";
  return `Cadastrado. Fico de olho nos próximos vencimentos.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n🔁 ${unitLabel[r.repeatUnit] ?? r.repeatUnit}${termLine}\n📅 Próximo vencimento: ${nextStr}\n\nAviso você às 20h de cada vencimento.`;
}

export function replyRecurringList(items: RecurringTransaction[]): string {
  const fmt = (v: number) => formatCurrency(v);
  if (!items.length) return "Nenhum lançamento recorrente ou parcelado ativo no momento.";
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
      const remaining = recurringRemaining(r);
      const termLabel = remaining !== null ? ` · faltam ${remaining}` : "";
      msg += `• ${r.description} — ${fmt(r.amount)} · próx. ${next}${termLabel}\n`;
    });
  }
  return msg.trim();
}

export function replyFileSaved(originalName: string, folder: string): string {
  return `Guardado no seu Drive. 📁\n\n📄 ${originalName}\n🗂️ Pasta: ${folder}\n\nQuando precisar: _"ache meu arquivo ${originalName.split(".")[0]}"_`;
}

export function replyFileFound(originalName: string): string {
  return `Encontrei. 📄 ${originalName}\n\nJá te enviando...`;
}

export function replyFileNotFound(query: string): string {
  return `Não encontrei nada com *"${query}"* no seu Drive.\n\nTenta descrever de outro jeito, ou dá uma olhada direto em *📁 Drive* no painel.`;
}

export function replyDriveFileList(count: number): string {
  if (count === 0) return `Seu Drive ainda está vazio.\n\nMe envie um arquivo (PDF, imagem, documento) que eu organizo pra você.`;
  return `📁 Você tem *${count} arquivo${count > 1 ? "s" : ""}* guardados comigo.\n\nPara buscar: _"ache o comprovante do mecânico"_\nPara ver tudo: *📁 Drive* no painel.`;
}

export function replyAgendaCreated(a: Appointment): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  const endLine = a.endAt ? ` até ${formatDateTimeBR(a.endAt).slice(11)}` : "";
  return `Marcado na sua agenda.\n\n📅 *${a.title}*\n🕒 ${dateTime}${endLine}${locationLine}`;
}

export function replyAgendaList(appointments: Appointment[]): string {
  if (!appointments.length) return `Nada agendado nos próximos dias.\n\nPara marcar: _"Agendar reunião amanhã às 14h"_`;
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
  return `Atualizado.\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}`;
}

export function replyAgendaDeleted(title: string): string {
  return `Cancelado — removi *${title}* da sua agenda.`;
}

export function replyAppointmentReminder(a: Appointment): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  const meetLine = a.meetLink ? `\n🔗 ${a.meetLink}` : "";
  return `⏰ Passando para lembrar — daqui a 2 horas você tem:\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}${meetLine}`;
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
  const inviteNote = withPhones > 0 ? `\n👥 Já avisei ${withPhones} participante${withPhones > 1 ? "s" : ""} pelo WhatsApp` : "";
  const withEmails = (attendees || []).filter(a => a.email).length;
  const emailNote = withEmails > 0 ? `\n📧 Convite por e-mail enviado para ${withEmails} participante${withEmails > 1 ? "s" : ""}` : "";
  return `${meet.meetLink ? "Reunião marcada, com Google Meet." : "Compromisso marcado."}\n\n📅 *${meet.title}*\n🕒 ${start}${endStr}${meetStr}${inviteNote}${emailNote}`;
}

export function replyMeetInvite(meet: MeetLike, name: string): string {
  return `${name}, você foi convidado para uma reunião.\n\n📅 *${meet.title}*\n🕒 ${formatDateTimeBR(meet.startAt)}\n\n🔗 *Link:* ${meet.meetLink ?? "(sem link)"}\n\nAté lá.`;
}

export function replyMeetAtaRequest(title: string): string {
  return `Sua reunião "${title}" encerrou.\n\nSe quiser, me manda um *áudio* ou *texto* resumindo o que foi discutido:\n\n• Principais pontos\n• Decisões tomadas\n• Próximas ações\n\nEu organizo tudo e já crio as tarefas.`;
}

export function replyMeetAtaGenerated(title: string, ata: { summary: string; decisions: string[]; tasks: string[] }): string {
  let msg = `📋 *Ata da reunião: ${title}*\n\n`;
  msg += `📝 *Resumo:*\n${ata.summary}\n`;
  if (ata.decisions.length) {
    msg += `\n✅ *Decisões tomadas:*\n`;
    ata.decisions.forEach(d => { msg += `• ${d}\n`; });
  }
  if (ata.tasks.length) {
    msg += `\n📌 *Tarefas que já criei (${ata.tasks.length}):*\n`;
    ata.tasks.forEach(t => { msg += `• ${t}\n`; });
    msg += `\nJá estão em *📋 Tarefas* no painel.`;
  }
  return msg.trim();
}

export function replyUnknown(originalMsg?: string): string {
  const quote = originalMsg ? `\n\n> _"${originalMsg}"_\n` : "\n";
  return `Não peguei bem o que você precisa.${quote}
Pode me contar de outro jeito? Por exemplo:

💸 *Despesa:* _"gastei 50 no mercado"_
💰 *Receita:* _"recebi 3000 de salário"_
📋 *Tarefa:* _"criar tarefa: ligar pro João"_
🔔 *Lembrete:* _"me lembra amanhã às 9h de pagar conta"_
🎯 *Meta:* _"meta: guardar 5000 para viagem"_
📊 *Saldo:* _"meu saldo"_ ou _"extrato"_

Ou digite *ajuda* pra ver tudo que eu sei fazer.`;
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
  return `Entendi que você quer *${label}*, mas não fiquei seguro de um detalhe.\n\n> _"${originalMsg}"_\n\n${details}\n\nEstá certo? Se sim, é só confirmar. Se não, me corrige que eu ajusto.`;
}

// ── Supermercado ──────────────────────────

export function replyGroceryListAdded(count: number, source?: string): string {
  if (count === 0) return `❓ Não consegui identificar o que adicionar na lista.`;
  const originLine = source ? ` da lista de *${source}*` : "";
  return `🛒 Adicionei ${count} ${count === 1 ? "item" : "itens"}${originLine} na sua lista de compras.`;
}

export function replyGroceryList(items: ShoppingListItem[]): string {
  const pending = items.filter(i => !i.checked);
  if (!pending.length) return `🛒 Sua lista de compras está vazia — nada pendente.`;
  let msg = `🛒 *Lista de compras (${pending.length}):*\n\n`;
  let lastCategory = "";
  pending.forEach(i => {
    if (i.category !== lastCategory) { msg += `\n*${i.category}*\n`; lastCategory = i.category; }
    msg += `• ${i.name}${i.quantity ? ` — ${i.quantity}` : ""}\n`;
  });
  return msg.trim();
}

export function replyGroceryItemChecked(checked: string[], notFound: string[]): string {
  let msg = "";
  if (checked.length) msg += `✅ Marquei como comprado: ${checked.join(", ")}.`;
  if (notFound.length) msg += `${msg ? "\n" : ""}❓ Não achei na lista: ${notFound.join(", ")}.`;
  return msg || "❓ Não encontrei nenhum desses itens na sua lista.";
}

export function replyGroceryPurchaseSaved(p: GroceryPurchase): string {
  let msg = `🧾 *Compra registrada!*\n\n🏪 ${p.storeName}\n📅 ${formatDateBR(p.date)}\n\n`;
  p.items.forEach(i => { msg += `• ${i.productName} — ${formatCurrency(i.price)}${i.quantity > 1 ? ` × ${i.quantity}` : ""}\n`; });
  msg += `\n💰 *Total: ${formatCurrency(p.total)}*`;
  return msg;
}

export function replyGrocerySpend(spend: Array<{ storeName: string; total: number; visits: number }>, totalSpent: number): string {
  if (!spend.length) return `🛒 Nenhuma compra de mercado registrada ainda.`;
  let msg = `💲 *Gastos no mercado:*\n\n`;
  spend.slice(0, 6).forEach(s => { msg += `🏪 ${s.storeName} — ${formatCurrency(s.total)} _(${s.visits}x)_\n`; });
  msg += `\n💰 *Total geral: ${formatCurrency(totalSpent)}*`;
  return msg;
}

// ── Funcionários ──────────────────────────

export function replyEmployeeCreated(e: Employee): string {
  return `Cadastrado. 👥\n\n*${e.name}* — ${e.role}\n💰 ${formatCurrency(e.salary)}\n📅 Início: ${formatDateBR(e.startDate)}\n\n🏢 Veja em Funcionários no dashboard.`;
}

export function replyEmployeeList(employees: Employee[], totalPayroll: number): string {
  if (!employees.length) return `👥 Nenhum funcionário ativo cadastrado.`;
  let msg = `👥 *Funcionários ativos (${employees.length}):*\n\n`;
  employees.forEach(e => { msg += `• ${e.name} — ${e.role} — ${formatCurrency(e.salary)}\n`; });
  msg += `\n💰 *Folha mensal: ${formatCurrency(totalPayroll)}*`;
  return msg;
}

export function replyEmployeeUpdated(e: Employee): string {
  return `✏️ Atualizado.\n\n*${e.name}* — ${e.role}\n💰 ${formatCurrency(e.salary)}`;
}

export function replyEmployeeDeactivated(e: Employee): string {
  return `🗑️ *${e.name}* foi desativado(a).`;
}

// ── Clientes (CRM) ────────────────────────

export function replyCustomerCreated(c: Customer): string {
  const line = [c.phone, c.email, c.company].filter(Boolean).join(" · ");
  return `Cadastrado. 🧾\n\n*${c.name}*${line ? `\n${line}` : ""}\n\n🏢 Veja em Clientes no dashboard.`;
}

export function replyCustomerList(customers: Customer[]): string {
  if (!customers.length) return `🧾 Nenhum cliente ativo cadastrado.`;
  let msg = `🧾 *Clientes ativos (${customers.length}):*\n\n`;
  customers.forEach(c => { msg += `• ${c.name}${c.phone ? ` — ${c.phone}` : ""}\n`; });
  return msg.trim();
}

export function replyCustomerUpdated(c: Customer): string {
  return `✏️ Atualizado.\n\n*${c.name}*`;
}

export function replyCustomerDeactivated(c: Customer): string {
  return `🗑️ *${c.name}* foi removido(a) dos clientes ativos.`;
}
