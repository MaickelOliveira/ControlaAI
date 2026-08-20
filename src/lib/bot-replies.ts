import type { Finance } from "./finances";
import type { Task } from "./tasks";
import type { Reminder } from "./reminders";
import { type RecurringTransaction, recurringRemaining } from "./recurring";
import type { Appointment } from "./agenda";
import { formatCurrency } from "./finances";
import { PRIORITY_LABEL, formatDueDate } from "./tasks";
import type { UserMode } from "./users";
import { formatDateBR, formatDateTimeBR, formatTimeBR } from "./date-br";
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

export function replyReminderSet(message: string, scheduledAt: string, repeat: string, recipientName?: string): string {
  const date = new Date(scheduledAt);
  const dateStr = formatDateBR(scheduledAt);
  const timeStr = date.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const repeatLabel: Record<string, string> = {
    none: "Uma vez",
    daily: "Todo dia",
    weekly: "Toda semana",
    monthly: "Todo mês",
  };
  const intro = recipientName ? `Pode deixar, vou avisar *${recipientName}*. 🔔` : "Pode deixar, eu te aviso. 🔔";
  return `${intro}\n\n💬 ${message}\n📅 ${dateStr} às ${timeStr}\n🔁 ${repeatLabel[repeat] ?? "Uma vez"}`;
}

export function replyReminderList(reminders: Reminder[]): string {
  if (!reminders.length) return "🔔 Nenhum lembrete ativo no momento.";
  const repeatLabel: Record<string, string> = { none: "uma vez", daily: "todo dia", weekly: "toda semana", monthly: "todo mês" };
  let msg = `🔔 *Seus lembretes ativos (${reminders.length}):*\n\n`;
  reminders.slice(0, 10).forEach((r, i) => {
    const dateStr = formatDateBR(r.scheduledAt);
    const timeStr = new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    const para = r.recipientType !== "self" && r.recipientName ? ` _(pra ${r.recipientName})_` : "";
    msg += `${i + 1}. 💬 ${r.message}${para} — ${dateStr} às ${timeStr} _(${repeatLabel[r.repeat] ?? "uma vez"})_\n`;
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

export type DailySummaryData = {
  personName?: string;
  dateLabel: string; // ex: "18/08"
  billsToday: { personal: Finance[]; business: Finance[] };
  recurringToday: { personal: RecurringTransaction[]; business: RecurringTransaction[] };
  remindersToday: { personal: Reminder[]; business: Reminder[] };
  appointmentsToday: Appointment[]; // sem mode — agenda é unificada
  tasksToday: { personal: Task[]; business: Task[] };
};

export function replyDailySummary(data: DailySummaryData): string {
  const { personName, dateLabel, billsToday, recurringToday, remindersToday, appointmentsToday, tasksToday } = data;
  const tag = (m: "personal" | "business") => (m === "business" ? " 🏢" : " 👤");

  const totalItems =
    billsToday.personal.length + billsToday.business.length +
    recurringToday.personal.length + recurringToday.business.length +
    remindersToday.personal.length + remindersToday.business.length +
    appointmentsToday.length +
    tasksToday.personal.length + tasksToday.business.length;

  const greeting = personName ? `Bom dia, ${personName}! ☀️` : "Bom dia! ☀️";
  if (totalItems === 0) {
    return `${greeting}\n\n📅 *${dateLabel}* — hoje tá tranquilo, nada previsto. Aproveite! 🌿`;
  }

  let msg = `${greeting}\n\n📅 *Seu dia — ${dateLabel}:*\n`;

  const bills = [...billsToday.personal.map(f => ({ f, mode: "personal" as const })), ...billsToday.business.map(f => ({ f, mode: "business" as const }))];
  const recs = [...recurringToday.personal.map(r => ({ r, mode: "personal" as const })), ...recurringToday.business.map(r => ({ r, mode: "business" as const }))];
  if (bills.length || recs.length) {
    msg += `\n💰 *Contas de hoje:*\n`;
    bills.forEach(({ f, mode }) => {
      const emoji = f.type === "income" ? "💰" : "💸";
      msg += `• ${emoji} ${f.description} — ${formatCurrency(f.amount)}${tag(mode)}\n`;
    });
    recs.forEach(({ r, mode }) => {
      msg += `• 🔁 ${r.description} — ${formatCurrency(r.amount)}${tag(mode)} _(recorrente, ainda não confirmado)_\n`;
    });
  }

  const reminders = [...remindersToday.personal.map(r => ({ r, mode: "personal" as const })), ...remindersToday.business.map(r => ({ r, mode: "business" as const }))];
  if (reminders.length) {
    msg += `\n🔔 *Lembretes de hoje:*\n`;
    reminders.forEach(({ r, mode }) => {
      const timeStr = formatTimeBR(r.scheduledAt);
      const para = r.recipientType !== "self" && r.recipientName ? ` _(pra ${r.recipientName})_` : "";
      msg += `• ${timeStr} — ${r.message}${para}${tag(mode)}\n`;
    });
  }

  if (appointmentsToday.length) {
    msg += `\n🗓️ *Compromissos de hoje:*\n`;
    appointmentsToday.forEach(a => {
      const timeStr = a.allDay ? "dia todo" : formatTimeBR(a.startAt);
      const local = a.location ? ` — 📍 ${a.location}` : "";
      msg += `• ${timeStr} — ${a.title}${local}\n`;
    });
  }

  const tasks = [...tasksToday.personal.map(t => ({ t, mode: "personal" as const })), ...tasksToday.business.map(t => ({ t, mode: "business" as const }))];
  if (tasks.length) {
    msg += `\n📋 *Tarefas de hoje:*\n`;
    tasks.forEach(({ t, mode }) => {
      const pr = t.priority === "high" ? "⚡" : t.priority === "medium" ? "🟡" : "⚪";
      msg += `• ${pr} ${t.title}${tag(mode)}\n`;
    });
  }

  return msg.trim();
}

export type HelpCategory = "financeiro" | "mercado" | "tarefas" | "agenda" | "empresa" | "arquivos" | "contatos";

const HELP_CATEGORY_KEYWORDS: Record<HelpCategory, string[]> = {
  financeiro: ["financeiro", "dinheiro", "financas", "finanças", "gasto", "receita", "saldo", "extrato", "parcela", "conta fixa", "veiculo", "veículo", "carro"],
  mercado: ["mercado", "compra", "supermercado", "lista de compras"],
  tarefas: ["tarefa", "lembrete", "meta", "metas"],
  agenda: ["agenda", "compromisso", "reuniao", "reunião", "meet", "video", "vídeo"],
  empresa: ["empresa", "funcionario", "funcionário", "cliente", "empresarial", "equipe"],
  arquivos: ["arquivo", "drive", "documento"],
  contatos: ["contato", "vincular", "vinculo", "vínculo", "acesso", "outro numero", "outro número"],
};

/** Decide qual seção de ajuda mostrar a partir do texto cru da mensagem (ex:
 *  "ajuda financeiro" → categoria "financeiro"). Sem categoria = menu geral.
 *  Mesmo padrão de correspondência por palavra-chave já usado pro atalho de
 *  "ajuda"/"?" e pro regex de vínculo de número — não depende de um campo
 *  estruturado novo da IA. */
export function detectHelpCategory(text: string): HelpCategory | undefined {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(HELP_CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat as HelpCategory;
  }
  return undefined;
}

const HELP_MENU = `*Zelo — seu assessor pessoal*

Fale comigo naturalmente, como falaria com alguém de confiança que cuida das suas coisas. Pra ver o que eu faço em cada área, digite:

💰 *ajuda financeiro* — registrar, corrigir, parcelas, veículo, saldo e extrato
🛒 *ajuda mercado* — lista de compras, comparar preços, registrar compra
📋 *ajuda tarefas* — tarefas, lembretes (inclusive pra outras pessoas) e metas
🗓️ *ajuda agenda* — compromissos e reuniões por vídeo (Meet)
🏢 *ajuda empresa* — funcionários, clientes e modo empresa/pessoal
📁 *ajuda arquivos* — guardar e buscar documentos no Drive
👥 *ajuda contatos* — dar acesso à sua conta pra outra pessoa

A qualquer momento, digite *resuma meu dia* pra ver tudo que você tem previsto hoje — contas, lembretes, compromissos e tarefas, de uma vez só.

💡 Se eu não tiver certeza do que você quis dizer, eu pergunto antes de fazer qualquer coisa — nunca ajo no escuro.

Ou me pergunte do seu jeito, sem comando decorado — eu entendo linguagem natural.`;

const HELP_SECTIONS: Record<HelpCategory, string> = {
  financeiro: `💰 *FINANCEIRO*

*Registrar:*
• _"Gastei 50 no mercado"_ → despesa registrada
• _"Recebi 2000 de salário"_ → receita registrada
• _"Gastei 50 no Nubank"_ → registro já na conta/cartão certo
• _"Comprei uma passagem 800 pro dia 20"_ → fica agendado, só entra no saldo quando a data chegar
📸 Também aceito foto de nota fiscal, boleto, cupom fiscal ou comprovante — registro sozinho.

*Ver seus números* ("extrato" = seu histórico de lançamentos):
• _"Meu saldo"_ / _"Extrato"_ → resumo e últimos lançamentos do mês
• _"Extrato detalhado"_ → cada gasto separado por categoria
• _"No que gastei mais?"_ → análise com dicas
• _"Quanto gastei com ifood"_ → total por um gasto/categoria específica
• _"Extrato do mês passado"_ → qualquer período, não só o atual
• _"Quanto a Ana gastou"_ → filtra só pelo que uma pessoa da família/equipe registrou (se ela tiver o número dela vinculado — veja *ajuda contatos*)

*Corrigir ou apagar:*
• _"Corrige o ifood para 80 reais"_ → altero o valor
• _"Muda a categoria do mercado para Lazer"_ → altero a categoria
• _"Corrige o nome do lançamento X para Y"_ → renomeio
• _"Apaga o gasto do ifood"_ → removo
• _"Já paguei aquela conta que agendei"_ → confirmo um lançamento futuro antes da data

*Fatura ou extrato bancário com vários lançamentos:* me envie a foto/PDF — eu extraio cada compra individual e confirmo antes de importar.

*Parcelas e contas fixas:*
• _"Comprei geladeira 5000 em 10x de 500"_ → cadastro as parcelas
• _"Pago netflix 55 todo mês"_ → conta mensal
• _"Minhas parcelas"_ → tudo que está ativo
• _"Cancela o netflix"_ / _"Muda o netflix para 65"_
Eu aviso automaticamente no dia do vencimento. 🔔

*Veículo* (se tiver carro/moto cadastrado no painel):
• _"Abasteci 80 reais"_ / _"Paguei 300 de revisão"_ / _"Seguro do carro 1200"_ / _"Paguei 800 de IPVA"_
• _"Gastos do carro"_ → total já gasto com ele`,

  mercado: `🛒 *LISTA DE COMPRAS E MERCADO*

*Lista de compras:*
• _"Põe arroz na lista"_ → adiciono
• _"Adiciona leite e ovos na lista de compras"_ → vários de uma vez
• _"Quero a lista de carnes"_ → adiciono um grupo pronto (mercearia, carnes, hortifruti, laticínios, padaria, bebidas, higiene, limpeza)
• _"O que tem na lista"_ → mostro tudo
• _"Comprei o arroz"_ → risco da lista
• _"Gera uma lista básica de mercearia"_ → eu sugiro o que comprar

*Registrar a compra:*
• _"Comprei no Assaí: arroz 25, feijão 8, leite 6"_ → registro item por item
• _"Finalizei a compra no Assaí, foi 120 reais"_ → fecho a partir do que já estava marcado na lista
📸 Foto do cupom fiscal também funciona — eu leio os itens sozinho.

*Comparar preços e histórico:*
• _"Onde o leite tá mais barato"_ → comparo entre os mercados que você já comprou
• _"Qual mercado é mais barato pra mim"_ → ranking geral
• _"O que comprei no mercado esse mês"_ → lista de compras passadas
• _"Quanto gastei no mercado esse mês"_ → só o total, sem listar item por item`,

  tarefas: `📋 *TAREFAS, LEMBRETES E METAS*

*Tarefas:*
• _"Criar tarefa: ligar pro João amanhã"_ → crio
• _"Minhas tarefas"_ → o que está pendente
• _"Concluir 1"_ / _"Tarefa 2 em andamento"_ → atualizo o status
• _"Apaga a tarefa 3"_ → removo

*Lembretes* — eu aviso na hora certa, pra você ou pra outra pessoa:
• _"Me lembra de pagar conta sexta às 9h"_ → aviso único
• _"Todo dia às 8h me lembra de tomar remédio"_ → aviso diário/mensal
• _"Lembra o 44999998888 às 15h de buscar o pedido"_ → manda o aviso pra QUALQUER número direto, sem precisar cadastrar a pessoa antes
• _"Lembra a Maria, número 44988887777, de pagar amanhã"_ → nome + telefone juntos
• _"Lembra a Milena de pagar amanhã"_ (sem número) → eu procuro o telefone dela entre seus clientes, funcionários ou números da família já vinculados (veja *ajuda contatos*)

*Metas* — quer juntar dinheiro pra algo?
• _"Quero guardar 5000 para viagem até dezembro"_ → crio a meta
• _"Adicionei 300 na meta viagem"_ → atualizo o progresso
• _"Minhas metas"_ → como está cada uma
• _"Meta viagem concluída"_ / _"Cancela a meta da viagem"_`,

  agenda: `🗓️ *AGENDA E REUNIÕES*

*Compromissos:*
• _"Agendar reunião amanhã às 14h"_ → crio
• _"Consulta médica sexta às 10h no Hospital X"_ → com local
• _"Meus compromissos"_ → o que está agendado
• _"Reagendar reunião para segunda às 10h"_ → mudo o horário
• _"Já fiz a reunião de ontem"_ → marco como realizado (fica no histórico)
• _"Cancela a consulta de sexta"_ → removo de vez

*Reunião por vídeo (Google Meet)* — eu crio o link e aviso os participantes:
• _"Criar meet amanhã às 14h com João 11999999999"_
• _"Meet sexta às 15h com maria@empresa.com por 2 horas"_
• _"Adiciona meet na reunião de segunda"_ → coloco o link num compromisso já existente
Quem tem WhatsApp vinculado à sua conta recebe o convite automaticamente. Depois que a reunião termina, eu te peço um resumo (áudio ou texto) e já gero a ata com as decisões e tarefas — sem comando nenhum, eu que pergunto.`,

  empresa: `🏢 *EMPRESA*

*Funcionários* (quem trabalha com você):
• _"Cadastra a Ana como vendedora, 2000"_ → cria o cadastro
• _"Meus funcionários"_ → lista + total da folha de pagamento
• _"Muda o salário da Ana para 2200"_ → atualizo
• _"Demite o João"_ → desativo (fica no histórico)
Pra registrar o PAGAMENTO mensal de um funcionário já cadastrado, é diferente: _"pago a Ana 2000 todo mês"_ (veja *ajuda financeiro*, parcelas e contas fixas).

*Clientes* (quem compra/contrata de você):
• _"Cadastra o cliente Pedro, telefone 11999999999"_ → cria o cadastro
• _"Meus clientes"_ → lista tudo
• _"Qual o telefone do meu cliente Bruno"_ → busca um dado específico
• _"Muda o telefone do Pedro"_ / _"Remove o cliente Pedro"_

*Modo empresa/pessoal* — eu separo as finanças e tarefas da empresa das suas pessoais:
• _"Modo empresa"_ → próximos registros vão pra empresa
• _"Modo pessoal"_ → volto pros gastos pessoais
O modo atual sempre aparece nas minhas respostas.`,

  arquivos: `📁 *ARQUIVOS (Drive inteligente)*

• Envie qualquer foto, PDF ou documento → eu guardo e organizo sozinho, na pasta certa
• Nota fiscal, boleto ou comprovante → já registro como despesa também, além de guardar
• Pra eu só guardar, sem lançar nada: mande com a legenda _"salva"_ ou _"guarda"_
• _"Ache o contrato do João"_ → te devolvo o arquivo
• _"Salva como contrato assinado"_ → renomeio o último arquivo enviado`,

  contatos: `👥 *DAR ACESSO À SUA CONTA*

Isso é diferente de mandar um lembrete pra alguém (veja *ajuda tarefas*) — aqui é dar acesso de verdade à SUA conta, pra outra pessoa (funcionário, familiar, sócio) lançar gastos e usar o Zelo pelo WhatsApp dela, tudo caindo na sua mesma conta.

• Digite *"vincular número"* ou *"código de vinculação"* → eu gero um código de 4 dígitos
• A pessoa manda esse código pelo WhatsApp dela pro Zelo → eu pergunto o nome dela, o vínculo (esposa, sócio, filho...) e se ela pode acessar o modo pessoal, empresarial ou os dois
• Pronto — o que ela registrar já aparece na sua conta, e dá pra filtrar depois (_"quanto a Ana gastou"_, veja *ajuda financeiro*)

⚠️ Isso só é necessário pra quem vai REGISTRAR coisas na sua conta. Pra só receber um lembrete seu, não precisa de nada disso — veja *ajuda tarefas*.`,
};

export function replyHelp(category?: HelpCategory): string {
  if (!category) return HELP_MENU;
  return HELP_SECTIONS[category];
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
  return `Pronto, *${name}* — sua conta já está configurada no modo ${plan === "business" ? "Empresarial 🏢" : "Pessoal 👤"}.\n\nQuando quiser ver o que posso fazer por você, digite *ajuda*.`;
}

export function replyTrialExpired(): string {
  return `Seu acesso ainda não está ativo.\n\nPara eu continuar cuidando das suas finanças e da sua agenda, escolha um plano no site:\n🌐 controlaai.app/#planos`;
}

export function replyAccountInactive(): string {
  return `Sua conta está inativa no momento.\n\nPara voltar a usar o Zelo, regularize sua assinatura no painel:\n🌐 controlaai.app/planos`;
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

export function replyRecurringConfirmed(r: RecurringTransaction): string {
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

/** `quando` é o texto livre de "daqui a quanto tempo" (ex: "2 horas",
 *  "15 minutos") — usado tanto no lembrete de 2h quanto no de 15min, cada
 *  um controlado por sua própria coluna em appointments (reminder_sent_at
 *  vs reminder_15min_sent_at), então os dois podem disparar de forma
 *  independente pro mesmo compromisso. */
export function replyAppointmentReminder(a: Appointment, quando: string): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  const meetLine = a.meetLink ? `\n🔗 ${a.meetLink}` : "";
  return `⏰ Passando para lembrar — daqui a ${quando} você tem:\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}${meetLine}`;
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
  p.items.forEach(i => {
    msg += i.quantity > 1
      ? `• ${i.productName} — ${formatCurrency(i.price)} × ${i.quantity} = ${formatCurrency(i.price * i.quantity)}\n`
      : `• ${i.productName} — ${formatCurrency(i.price)}\n`;
  });
  msg += `\n💰 *Total: ${formatCurrency(p.total)}*`;
  return msg;
}

export function replyGroceryPurchaseFinished(p: GroceryPurchase): string {
  let msg = `✅ *Compra fechada — ${p.storeName}!*\n\n`;
  p.items.forEach(i => { msg += `• ${i.productName}\n`; });
  msg += `\n💰 *Total: ${formatCurrency(p.total)}*\n📊 Lançado em Finanças e a lista marcada foi limpa.`;
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
  const line = [c.phone, c.email, c.company, c.address].filter(Boolean).join(" · ");
  return `Cadastrado. 🧾\n\n*${c.name}*${line ? `\n${line}` : ""}\n\n🏢 Veja em Clientes no dashboard.`;
}

export function replyCustomerList(customers: Customer[]): string {
  if (!customers.length) return `🧾 Nenhum cliente ativo cadastrado.`;
  let msg = `🧾 *Clientes ativos (${customers.length}):*\n\n`;
  customers.forEach(c => { msg += `• ${c.name}${c.phone ? ` — ${c.phone}` : ""}\n`; });
  return msg.trim();
}

export function replyCustomerInfo(customers: Customer[], keyword: string): string {
  if (!customers.length) return `❓ Não encontrei nenhum cliente com "${keyword}". Digite *meus clientes* para ver a lista.`;
  if (customers.length === 1) {
    const c = customers[0];
    let msg = `🧾 *${c.name}*\n`;
    if (c.company) msg += `🏢 ${c.company}\n`;
    if (c.phone) msg += `📱 ${c.phone}\n`;
    if (c.email) msg += `✉️ ${c.email}\n`;
    if (c.address) msg += `📍 ${c.address}\n`;
    if (c.notes) msg += `📝 ${c.notes}\n`;
    return msg.trim();
  }
  let msg = `🧾 Encontrei *${customers.length}* clientes com "${keyword}" — qual deles?\n\n`;
  customers.forEach(c => {
    const detail = [c.company, c.phone].filter(Boolean).join(" · ");
    msg += `• ${c.name}${detail ? ` — ${detail}` : ""}\n`;
  });
  return msg.trim();
}

export function replyCustomerUpdated(c: Customer): string {
  return `✏️ Atualizado.\n\n*${c.name}*`;
}

export function replyCustomerDeactivated(c: Customer): string {
  return `🗑️ *${c.name}* foi removido(a) dos clientes ativos.`;
}
