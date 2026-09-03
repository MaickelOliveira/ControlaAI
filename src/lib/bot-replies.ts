import type { Finance } from "./finances";
import type { Task } from "./tasks";
import type { Reminder } from "./reminders";
import { type RecurringTransaction, recurringRemaining } from "./recurring";
import type { Appointment } from "./agenda";
import type { Goal } from "./goals";
import { formatCurrency, translateCategory } from "./finances";
import { PRIORITY_LABEL, formatDueDate } from "./tasks";
import type { UserMode } from "./users";
import { formatDateBR, formatDateTimeBR } from "./date-br";
import type { ShoppingListItem, GroceryPurchase } from "./grocery";
import type { Employee } from "./employees";
import type { Customer } from "./customers";

const TZ = "America/Sao_Paulo";

// Toda função de reply aqui recebe `locale` como último parâmetro (opcional,
// default = comportamento pt-BR de sempre). "Empresa" é igual nos três
// idiomas; "R$"/formatCurrency nunca muda (moeda real da transação, não uma
// questão de idioma). Datas usam Intl.DateTimeFormat com o locale do BCP-47
// correto (es-419 = espanhol latino-americano neutro) em vez de "pt-BR"
// fixo, pra mês/dia da semana saírem no idioma certo.
function dateLocale(locale?: string): string {
  if (locale === "es") return "es-419";
  if (locale === "pt-PT") return "pt-PT";
  return "pt-BR";
}
const isEs = (l?: string) => l === "es";
const isPtPt = (l?: string) => l === "pt-PT";

export function replyFinanceRegistered(f: Finance, balance: number, locale?: string): string {
  const emoji = f.type === "income" ? "💰" : "💸";
  const tipo = f.type === "income"
    ? (isEs(locale) ? "ingreso" : "receita")
    : (isEs(locale) ? "gasto" : "despesa");
  const modeLabel = f.mode === "business" ? "Empresa" : (isEs(locale) ? "Personal" : "Pessoal");
  const verbo = isEs(locale) ? "Anotado" : isPtPt(locale) ? "Registado" : "Anotado";
  const saldoLbl = isEs(locale) ? "Saldo" : "Saldo";
  const dateStr = new Date(f.date + "T12:00:00").toLocaleDateString(dateLocale(locale));
  const categoria = translateCategory(f.category, f.type, locale);
  return `${verbo}. ${emoji} *${formatCurrency(f.amount)}* — ${categoria} (${tipo})\n📝 ${f.description}\n📅 ${dateStr}\n\n${saldoLbl} ${modeLabel}: *${formatCurrency(balance)}*`;
}

export function replyBalance(personal: { income: number; expense: number; balance: number }, business?: { income: number; expense: number; balance: number }, personName?: string, periodLabel?: string, locale?: string): string {
  const period = periodLabel || new Date().toLocaleDateString(dateLocale(locale), { month: "long", year: "numeric" });
  const intro = isEs(locale)
    ? (personName ? `Aquí está el resumen de ${period}, ${personName}:\n\n` : `Aquí está el resumen de ${period}:\n\n`)
    : (personName ? `Aqui está o resumo de ${period}, ${personName}:\n\n` : `Aqui está o resumo de ${period}:\n\n`);
  const receitasLbl = isEs(locale) ? "Ingresos" : "Receitas";
  const despesasLbl = isEs(locale) ? "Gastos" : "Despesas";
  const saldoLbl = "Saldo";
  const pessoalLbl = isEs(locale) ? "Personal" : "Pessoal";

  let msg = intro;
  msg += `👤 *${pessoalLbl}*\n`;
  msg += `  ${receitasLbl}: ${formatCurrency(personal.income)}\n`;
  msg += `  ${despesasLbl}: ${formatCurrency(personal.expense)}\n`;
  msg += `  ${saldoLbl}: ${formatCurrency(personal.balance)}\n`;

  if (business) {
    msg += `\n🏢 *Empresa*\n`;
    msg += `  ${receitasLbl}: ${formatCurrency(business.income)}\n`;
    msg += `  ${despesasLbl}: ${formatCurrency(business.expense)}\n`;
    msg += `  ${saldoLbl}: ${formatCurrency(business.balance)}\n`;
  }
  return msg;
}

export function replyPersonNotFound(name: string, locale?: string): string {
  if (isEs(locale)) return `No encontré a nadie llamado *${name}* entre los números vinculados a tu cuenta.\n\nPara que pueda identificar quién registró cada gasto, cada persona necesita vincular su propio WhatsApp en *Configuración* y decirme su nombre cuando yo pregunte.`;
  if (isPtPt(locale)) return `Não encontrei ninguém chamado *${name}* entre os números associados à tua conta.\n\nPara eu identificar quem registou cada gasto, cada pessoa precisa de associar o próprio WhatsApp em *Configurações* e dizer-me o nome quando eu perguntar.`;
  return `Não encontrei ninguém chamado *${name}* entre os números vinculados à sua conta.\n\nPara eu identificar quem registrou cada gasto, cada pessoa precisa vincular o próprio WhatsApp em *Configurações* e me dizer o nome quando eu perguntar.`;
}

export function replyWppNameSaved(name: string, locale?: string): string {
  if (isEs(locale)) return `Un gusto, *${name}*. Ya puedes contar conmigo — solo dime naturalmente lo que necesitas.\n\nSi quieres ver todo lo que sé hacer, escribe *ayuda*.`;
  if (isPtPt(locale)) return `Prazer, *${name}*. Já podes contar comigo — é só falares naturalmente sobre o que precisas.\n\nSe quiseres ver tudo o que sei fazer, escreve *ajuda*.`;
  return `Prazer, *${name}*. Já pode contar comigo — é só me falar naturalmente o que precisa.\n\nSe quiser ver tudo que sei fazer, digite *ajuda*.`;
}

export function replyTaskCreated(task: Task, locale?: string): string {
  const due = task.dueDate ? `\n📅 ${isEs(locale) ? "Vencimiento" : "Prazo"}: ${formatDueDate(task.dueDate)}` : "";
  const priority = PRIORITY_LABEL[task.priority];
  const verbo = isEs(locale) ? "Anotado en tu lista." : isPtPt(locale) ? "Registado na tua lista." : "Anotado na sua lista.";
  return `${verbo} 📌 ${task.title}\n${priority}${due}`;
}

export function replyTaskList(tasks: Task[], mode: UserMode, locale?: string): string {
  const modeLabel = mode === "business" ? "Empresa" : (isEs(locale) ? "Personal" : "Pessoal");
  if (!tasks.length) {
    if (isEs(locale)) return `Ninguna tarea pendiente${mode === "business" ? " en la empresa" : ""} — todo al día por aquí.`;
    if (isPtPt(locale)) return `Nenhuma tarefa pendente${mode === "business" ? " na empresa" : ""} — tudo em dia por aqui.`;
    return `Nenhuma tarefa pendente${mode === "business" ? " na empresa" : ""} — tudo em dia por aqui.`;
  }
  const titulo = isEs(locale) ? "Tus tareas pendientes" : "Suas tarefas pendentes";
  let msg = `📋 *${titulo} — ${modeLabel} (${tasks.length}):*\n\n`;
  tasks.slice(0, 10).forEach((t, i) => {
    const due = t.dueDate ? ` — ${formatDueDate(t.dueDate)}` : "";
    const pr = t.priority === "high" ? "⚡" : t.priority === "medium" ? "🟡" : "⚪";
    msg += `${i + 1}. ${pr} ${t.title}${due}\n`;
  });
  msg += isEs(locale) ? `\nPara completar alguna: _completar [número]_` : `\nPara concluir alguma: _concluir [número]_`;
  return msg;
}

export function replyTaskUpdated(task: Task, locale?: string): string {
  const statusMsg: Record<string, Record<string, string>> = {
    "pt-BR": { completed: "Concluída — muito bem.", in_progress: "Marquei como em andamento.", pending: "Voltou para pendente, sem problemas." },
    "pt-PT": { completed: "Concluída — muito bem.", in_progress: "Marquei como em curso.", pending: "Voltou para pendente, sem problema." },
    es: { completed: "Completada — muy bien.", in_progress: "La marqué en progreso.", pending: "Volvió a pendiente, sin problema." },
  };
  const dict = statusMsg[locale ?? "pt-BR"] ?? statusMsg["pt-BR"];
  const generic = isEs(locale) ? "Tarea actualizada." : "Tarefa atualizada.";
  return `${dict[task.status] ?? generic}\n\n📌 ${task.title}`;
}

export function replyReminderSet(message: string, scheduledAt: string, repeat: string, recipientName?: string, locale?: string): string {
  const date = new Date(scheduledAt);
  const dateStr = formatDateBR(scheduledAt);
  const timeStr = date.toLocaleTimeString(dateLocale(locale), { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const repeatLabel: Record<string, Record<string, string>> = {
    "pt-BR": { none: "Uma vez", daily: "Todo dia", weekly: "Toda semana", monthly: "Todo mês" },
    "pt-PT": { none: "Uma vez", daily: "Todos os dias", weekly: "Todas as semanas", monthly: "Todos os meses" },
    es: { none: "Una vez", daily: "Todos los días", weekly: "Todas las semanas", monthly: "Todos los meses" },
  };
  const dict = repeatLabel[locale ?? "pt-BR"] ?? repeatLabel["pt-BR"];
  let intro: string;
  if (isEs(locale)) intro = recipientName ? `Listo, le voy a avisar a *${recipientName}*. 🔔` : "Listo, yo te aviso. 🔔";
  else if (isPtPt(locale)) intro = recipientName ? `Combinado, vou avisar *${recipientName}*. 🔔` : "Combinado, eu aviso-te. 🔔";
  else intro = recipientName ? `Pode deixar, vou avisar *${recipientName}*. 🔔` : "Pode deixar, eu te aviso. 🔔";
  return `${intro}\n\n💬 ${message}\n📅 ${dateStr} ${isEs(locale) ? "a las" : "às"} ${timeStr}\n🔁 ${dict[repeat] ?? dict.none}`;
}

export function replyReminderList(reminders: Reminder[], locale?: string): string {
  if (!reminders.length) return isEs(locale) ? "🔔 Ningún recordatorio activo en este momento." : "🔔 Nenhum lembrete ativo no momento.";
  const repeatLabel: Record<string, Record<string, string>> = {
    "pt-BR": { none: "uma vez", daily: "todo dia", weekly: "toda semana", monthly: "todo mês" },
    "pt-PT": { none: "uma vez", daily: "todos os dias", weekly: "todas as semanas", monthly: "todos os meses" },
    es: { none: "una vez", daily: "todos los días", weekly: "todas las semanas", monthly: "todos los meses" },
  };
  const dict = repeatLabel[locale ?? "pt-BR"] ?? repeatLabel["pt-BR"];
  const titulo = isEs(locale) ? "Tus recordatorios activos" : "Seus lembretes ativos";
  let msg = `🔔 *${titulo} (${reminders.length}):*\n\n`;
  reminders.slice(0, 10).forEach((r, i) => {
    const dateStr = formatDateBR(r.scheduledAt);
    const timeStr = new Date(r.scheduledAt).toLocaleTimeString(dateLocale(locale), { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    const para = r.recipientType !== "self" && r.recipientName ? ` _(${isEs(locale) ? "para" : "pra"} ${r.recipientName})_` : "";
    msg += `${i + 1}. 💬 ${r.message}${para} — ${dateStr} ${isEs(locale) ? "a las" : "às"} ${timeStr} _(${dict[r.repeat] ?? dict.none})_\n`;
  });
  return msg.trim();
}

export function replyReminderUpdated(r: Reminder, locale?: string): string {
  const dateStr = formatDateBR(r.scheduledAt);
  const timeStr = new Date(r.scheduledAt).toLocaleTimeString(dateLocale(locale), { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const verbo = isEs(locale) ? "Listo, lo actualicé." : isPtPt(locale) ? "Combinado, atualizei." : "Combinado, atualizei.";
  return `${verbo} 🔔\n\n💬 ${r.message}\n📅 ${dateStr} ${isEs(locale) ? "a las" : "às"} ${timeStr}`;
}

export function replyReminderDeleted(message: string, locale?: string): string {
  const verbo = isEs(locale) ? "Recordatorio cancelado." : "Lembrete cancelado.";
  return `🗑️ ${verbo}\n\n💬 ${message}`;
}

export function replyModeSwitch(mode: UserMode, locale?: string): string {
  if (isEs(locale)) {
    return mode === "business"
      ? "Listo, ahora estamos en modo *Empresarial*. 🏢\nTus próximos registros entran como finanzas y tareas de la empresa."
      : "Listo, volvimos al modo *Personal*. 👤\nTus próximos registros entran como finanzas y tareas personales.";
  }
  if (isPtPt(locale)) {
    return mode === "business"
      ? "Certo, agora estamos no modo *Empresarial*. 🏢\nOs teus próximos registos entram como finanças e tarefas da empresa."
      : "Certo, voltámos ao modo *Pessoal*. 👤\nOs teus próximos registos entram como finanças e tarefas pessoais.";
  }
  if (mode === "business") return "Certo, agora estamos no modo *Empresarial*. 🏢\nSeus próximos registros entram como finanças e tarefas da empresa.";
  return "Certo, voltamos ao modo *Pessoal*. 👤\nSeus próximos registros entram como finanças e tarefas pessoais.";
}

export function replyHelp(locale?: string): string {
  if (isEs(locale)) {
    return `*Zelo — tu asesor personal*

Háblame de forma natural, como le hablarías a alguien de confianza que cuida tus cosas. Esto es todo lo que puedo hacer por ti:

━━━━━━━━━━━━━━━
💰 *REGISTRAR DINERO*
Cuéntame qué pasó y yo lo anoto:
• _"Gasté 50 en el súper"_ → gasto registrado
• _"Pagué 120 de luz"_ → gasto registrado
• _"Recibí 2000 de sueldo"_ → ingreso registrado
• _"Entraron 500 de un freelance"_ → ingreso registrado
📸 También acepto foto de recibo o factura — lo registro solo.

━━━━━━━━━━━━━━━
📊 *VER TUS NÚMEROS*
• _"Mi saldo"_ → cuánto entró y salió en el mes
• _"Movimientos"_ → tus últimos registros
• _"Movimientos detallados"_ → cada gasto separado por categoría
• _"¿En qué gasté más?"_ → un análisis con consejos
• _"Movimientos de la empresa"_ → gastos de la cuenta empresa

━━━━━━━━━━━━━━━
✏️ *CORREGIR O BORRAR*
¿Te equivocaste en un valor? Sin problema, yo lo ajusto:
• _"Corrige el súper a 80"_ → cambio el valor
• _"Cambia la categoría del súper a Ocio"_ → cambio la categoría
• _"Borra el gasto del súper"_ → elimino el registro

━━━━━━━━━━━━━━━
💳 *CUOTAS Y CUENTAS FIJAS*
Para compras en cuotas o cuentas que se repiten:
• _"Compré un refrigerador de 5000 en 10 cuotas de 500"_ → registro las cuotas
• _"Pago Netflix 55 todos los meses"_ → registro la cuenta mensual
• _"Recibo el alquiler todos los días 5, 1200"_ → ingreso mensual
• _"Mis cuotas"_ → todas las cuentas y cuotas activas
• _"Cancela Netflix"_ → dejo de seguirla
• _"Cambia Netflix a 65"_ → actualizo el valor
Te aviso automáticamente el día del vencimiento. 🔔

━━━━━━━━━━━━━━━
🚗 *GASTOS DE VEHÍCULO*
Si tienes un auto o moto registrado en el panel:
• _"Cargué 80 de nafta"_ → registro combustible
• _"Pagué 300 de service"_ → mantenimiento
• _"Seguro del auto 1200"_ → seguro
• _"Pagué 800 de patente"_ → impuesto

━━━━━━━━━━━━━━━
📋 *TAREAS*
• _"Crear tarea: llamar a Juan mañana"_ → creo la tarea
• _"Mis tareas"_ → lo que está pendiente
• _"Completar 1"_ → marco la tarea número 1 como hecha
• _"Tarea 2 en progreso"_ → actualizo el estado

━━━━━━━━━━━━━━━
🔔 *RECORDATORIOS*
Te aviso en el momento justo:
• _"Recuérdame pagar la cuenta el viernes a las 9"_ → aviso único
• _"Todos los meses el día 5 recuérdame pagar el alquiler"_ → aviso mensual
• _"Todos los días a las 8 recuérdame tomar el medicamento"_ → aviso diario

━━━━━━━━━━━━━━━
🎯 *METAS*
¿Quieres ahorrar para algo? Yo te ayudo a seguirlo:
• _"Quiero ahorrar 5000 para un viaje hasta diciembre"_ → creo la meta
• _"Agregué 300 a la meta viaje"_ → actualizo el progreso
• _"Mis metas"_ → cómo va cada una
• _"Meta viaje completada"_ → la marco como lograda

━━━━━━━━━━━━━━━
🗓️ *AGENDA*
• _"Agendar reunión mañana a las 14"_ → creo el evento
• _"Consulta médica el viernes a las 10 en el Hospital X"_ → con ubicación
• _"Mis eventos"_ → lo que está agendado
• _"Reagendar la reunión para el lunes a las 10"_ → cambio el horario
• _"Cancela la consulta del viernes"_ → la elimino

━━━━━━━━━━━━━━━
🎥 *REUNIÓN POR VIDEO (Google Meet)*
Yo creo el link y aviso a los participantes:
• _"Crear meet mañana a las 14 con Juan 11999999999"_
• _"Meet el viernes a las 15 con maria@empresa.com por 2 horas"_
• _"Agrega meet a la reunión del lunes"_ → pongo el link en el evento existente
Quien tenga WhatsApp vinculado recibe la invitación automáticamente.

━━━━━━━━━━━━━━━
📁 *ARCHIVOS (Drive inteligente)*
• Envía cualquier foto, PDF o documento → yo lo guardo y organizo
• Recibo o factura → ya lo registro como gasto
• Para que solo lo guarde, sin registrar nada: envíalo con el texto _"guarda"_
• _"Busca el contrato de Juan"_ → te devuelvo el archivo
• _"Guarda como contrato firmado"_ → renombro el último archivo

━━━━━━━━━━━━━━━
🏢 *MODO EMPRESA / PERSONAL*
Separo las finanzas de la empresa de las personales:
• _"Modo empresa"_ → los próximos registros van a la empresa
• _"Modo personal"_ → vuelvo a los gastos personales
El modo actual siempre aparece en mis respuestas.

━━━━━━━━━━━━━━━
Háblame como quieras — sin formalidad, sin comando memorizado. Yo entiendo.`;
  }
  if (isPtPt(locale)) {
    return `*Zelo — o teu assessor pessoal*

Fala comigo naturalmente, como falarias com alguém de confiança que cuida das tuas coisas. Aqui está tudo o que posso fazer por ti:

━━━━━━━━━━━━━━━
💰 *REGISTAR DINHEIRO*
Conta-me o que aconteceu que eu registo:
• _"Gastei 50 no supermercado"_ → despesa registada
• _"Paguei 120 de conta de luz"_ → despesa registada
• _"Recebi 2000 de salário"_ → receita registada
• _"Entrou 500 de um trabalho"_ → receita registada
📸 Também aceito foto de recibo ou fatura — registo sozinho.

━━━━━━━━━━━━━━━
📊 *VER OS TEUS NÚMEROS*
• _"O meu saldo"_ → quanto entrou e saiu no mês
• _"Extrato"_ → os teus últimos registos
• _"Extrato detalhado"_ → cada gasto separado por categoria
• _"Onde gastei mais?"_ → uma análise com dicas
• _"Extrato detalhado da empresa"_ → gastos da conta empresa

━━━━━━━━━━━━━━━
✏️ *CORRIGIR OU APAGAR*
Enganaste-te num valor? Sem problema, eu ajusto:
• _"Corrige o supermercado para 80 euros"_ → altero o valor
• _"Muda a categoria do supermercado para Lazer"_ → altero a categoria
• _"Apaga o gasto do supermercado"_ → removo o registo

━━━━━━━━━━━━━━━
💳 *PRESTAÇÕES E CONTAS FIXAS*
Para compras a prestações ou contas que se repetem:
• _"Comprei um frigorífico de 5000 em 10 prestações de 500"_ → registo as prestações
• _"Pago Netflix 55 todos os meses"_ → registo a conta mensal
• _"Recebo a renda todos os dias 5, 1200"_ → receita mensal
• _"As minhas prestações"_ → todas as contas e prestações ativas
• _"Cancela o Netflix"_ → deixo de acompanhar
• _"Muda o Netflix para 65"_ → atualizo o valor
Aviso-te automaticamente no dia do vencimento. 🔔

━━━━━━━━━━━━━━━
🚗 *DESPESAS COM VEÍCULO*
Se tens carro ou mota registados no painel:
• _"Abasteci 80 euros"_ → registo combustível
• _"Paguei 300 de revisão ao carro"_ → manutenção
• _"Seguro do carro 1200"_ → seguro
• _"Paguei 800 de imposto do carro"_ → imposto

━━━━━━━━━━━━━━━
📋 *TAREFAS*
• _"Criar tarefa: ligar ao João amanhã"_ → crio a tarefa
• _"As minhas tarefas"_ → o que está pendente
• _"Concluir 1"_ → marco a tarefa número 1 como feita
• _"Tarefa 2 em curso"_ → atualizo o estado

━━━━━━━━━━━━━━━
🔔 *LEMBRETES*
Aviso-te na hora certa:
• _"Lembra-me de pagar a conta sexta-feira às 9h"_ → aviso único
• _"Todos os meses no dia 5 lembra-me de pagar a renda"_ → aviso mensal
• _"Todos os dias às 8h lembra-me de tomar o medicamento"_ → aviso diário

━━━━━━━━━━━━━━━
🎯 *METAS*
Queres poupar para algo? Eu acompanho por ti:
• _"Quero poupar 5000 para uma viagem até dezembro"_ → crio a meta
• _"Adicionei 300 à meta viagem"_ → atualizo o progresso
• _"As minhas metas"_ → como está cada uma
• _"Meta viagem concluída"_ → marco como atingida

━━━━━━━━━━━━━━━
🗓️ *AGENDA*
• _"Agendar reunião amanhã às 14h"_ → crio o compromisso
• _"Consulta médica sexta-feira às 10h no Hospital X"_ → com localização
• _"Os meus compromissos"_ → o que está agendado
• _"Reagendar a reunião para segunda-feira às 10h"_ → mudo o horário
• _"Cancela a consulta de sexta-feira"_ → removo

━━━━━━━━━━━━━━━
🎥 *REUNIÃO POR VÍDEO (Google Meet)*
Eu crio o link e aviso os participantes:
• _"Criar meet amanhã às 14h com o João 11999999999"_
• _"Meet sexta-feira às 15h com maria@empresa.com por 2 horas"_
• _"Adiciona meet à reunião de segunda-feira"_ → coloco o link no compromisso existente
Quem tem WhatsApp associado recebe o convite automaticamente.

━━━━━━━━━━━━━━━
📁 *FICHEIROS (Drive inteligente)*
• Envia qualquer foto, PDF ou documento → eu guardo e organizo
• Recibo ou fatura → já registo como despesa
• Para eu só guardar, sem lançar nada: envia com a legenda _"guarda"_
• _"Encontra o contrato do João"_ → devolvo-te o ficheiro
• _"Guarda como contrato assinado"_ → renomeio o último ficheiro

━━━━━━━━━━━━━━━
🏢 *MODO EMPRESA / PESSOAL*
Separo as finanças da empresa das tuas pessoais:
• _"Modo empresa"_ → os próximos registos vão para a empresa
• _"Modo pessoal"_ → volto às despesas pessoais
O modo atual aparece sempre nas minhas respostas.

━━━━━━━━━━━━━━━
Podes falar comigo à tua maneira — sem formalidade, sem comando decorado. Eu entendo.`;
  }
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

export function replyOnboardingWelcome(locale?: string): string {
  if (isEs(locale)) return `¡Hola! Soy *Zelo*, tu asesor personal.\n\nDe ahora en más, cuido tus finanzas, tareas y agenda directo por aquí, en WhatsApp.\n\nPara empezar, ¿cómo puedo llamarte?`;
  if (isPtPt(locale)) return `Olá! Sou o *Zelo*, o teu assessor pessoal.\n\nA partir de agora, cuido das tuas finanças, tarefas e agenda diretamente por aqui, no WhatsApp.\n\nPara começar, como posso chamar-te?`;
  return `Olá! Sou o *Zelo*, seu assessor pessoal.\n\nA partir de agora, cuido das suas finanças, tarefas e agenda direto por aqui, no WhatsApp.\n\nPara começar, como posso te chamar?`;
}

export function replyOnboardingPlan(name: string, locale?: string): string {
  if (isEs(locale)) return `Muy bien, *${name}*.\n\n¿Prefieres que cuide de:\n\n1️⃣ *Uso Personal* — tus gastos y tareas del día a día\n2️⃣ *Uso Empresarial* — las finanzas y el equipo de tu empresa\n\nRespóndeme *1* o *2*.`;
  if (isPtPt(locale)) return `Muito bem, *${name}*.\n\nPreferes que eu cuide de:\n\n1️⃣ *Uso Pessoal* — as tuas despesas e tarefas do dia a dia\n2️⃣ *Uso Empresarial* — as finanças e a equipa da tua empresa\n\nResponde-me *1* ou *2*.`;
  return `Muito bem, *${name}*.\n\nVocê prefere que eu cuide de:\n\n1️⃣ *Uso Pessoal* — seus gastos e tarefas do dia a dia\n2️⃣ *Uso Empresarial* — as finanças e a equipe da sua empresa\n\nMe responda *1* ou *2*.`;
}

export function replyOnboardingDone(name: string, plan: string, locale?: string): string {
  if (isEs(locale)) return `Listo, *${name}* — tu cuenta ya está configurada en modo ${plan === "business" ? "Empresarial 🏢" : "Personal 👤"}.\n\nCuando quieras ver qué puedo hacer por ti, escribe *ayuda*.`;
  if (isPtPt(locale)) return `Pronto, *${name}* — a tua conta já está configurada no modo ${plan === "business" ? "Empresarial 🏢" : "Pessoal 👤"}.\n\nQuando quiseres ver o que posso fazer por ti, escreve *ajuda*.`;
  return `Pronto, *${name}* — sua conta já está configurada no modo ${plan === "business" ? "Empresarial 🏢" : "Pessoal 👤"}.\n\nQuando quiser ver o que posso fazer por você, digite *ajuda*.`;
}

export function replyTrialExpired(locale?: string): string {
  if (isEs(locale)) return `Tu acceso todavía no está activo.\n\nPara que yo pueda seguir cuidando tus finanzas y tu agenda, elige un plan en el sitio:\n🌐 zelogestaointeligente.com.br/#planos`;
  if (isPtPt(locale)) return `O teu acesso ainda não está ativo.\n\nPara eu continuar a cuidar das tuas finanças e da tua agenda, escolhe um plano no site:\n🌐 zelogestaointeligente.com.br/#planos`;
  return `Seu acesso ainda não está ativo.\n\nPara eu continuar cuidando das suas finanças e da sua agenda, escolha um plano no site:\n🌐 zelogestaointeligente.com.br/#planos`;
}

export function replyAccountInactive(locale?: string): string {
  if (isEs(locale)) return `Tu cuenta está inactiva en este momento.\n\nPara volver a usar Zelo, regulariza tu suscripción en el panel:\n🌐 zelogestaointeligente.com.br/planos`;
  if (isPtPt(locale)) return `A tua conta está inativa neste momento.\n\nPara voltares a usar o Zelo, regulariza a tua subscrição no painel:\n🌐 zelogestaointeligente.com.br/planos`;
  return `Sua conta está inativa no momento.\n\nPara voltar a usar o Zelo, regularize sua assinatura no painel:\n🌐 zelogestaointeligente.com.br/planos`;
}

export function buildRecurringNotification(r: RecurringTransaction, locale?: string): string {
  const fmt = (v: number) => formatCurrency(v);
  const dueDateStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString(dateLocale(locale));
  const typeEmoji = r.type === "income" ? "💰" : "💸";
  if (isEs(locale)) {
    const accion = r.type === "income" ? "recibido" : "pagado";
    if (r.recurrenceType === "installment") {
      return `Pasando para recordarte: la cuota ${r.paidInstallments + 1}/${r.totalInstallments} vence hoy.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\n¿Ya fue ${accion}? Respóndeme *sí* o *no*.`;
    }
    return `Pasando para recordarte la cuenta de hoy:\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\n¿Ya fue ${accion}? Respóndeme *sí* o *no*.`;
  }
  if (isPtPt(locale)) {
    const acao = r.type === "income" ? "recebida" : "paga";
    if (r.recurrenceType === "installment") {
      return `A passar para lembrar: a prestação ${r.paidInstallments + 1}/${r.totalInstallments} vence hoje.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\nJá foi ${acao}? Responde-me *sim* ou *não*.`;
    }
    return `A passar para lembrar da conta de hoje:\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\nJá foi ${acao}? Responde-me *sim* ou *não*.`;
  }
  if (r.recurrenceType === "installment") {
    return `Passando para lembrar: a parcela ${r.paidInstallments + 1}/${r.totalInstallments} vence hoje.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\nJá foi ${r.type === "income" ? "recebida" : "paga"}? Me responda *sim* ou *não*.`;
  }
  return `Passando para lembrar da conta de hoje:\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n📅 ${dueDateStr}\n\nJá foi ${r.type === "income" ? "recebida" : "paga"}? Me responda *sim* ou *não*.`;
}

export function replyRecurringConfirmed(r: RecurringTransaction, locale?: string): string {
  const fmt = (v: number) => formatCurrency(v);
  const nextStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString(dateLocale(locale));
  if (isEs(locale)) {
    if (r.status === "completed") {
      const total = fmt(r.totalAmount ?? r.amount * (r.totalInstallments ?? 1));
      if (r.recurrenceType === "installment") return `Esa fue la última — todas las cuotas saldadas. 🎉\n\n💳 ${r.description}\nTotal pagado: ${total}\n\nYa registré el movimiento en Finanzas.`;
      return `Esa fue la última — terminé el seguimiento de *${r.description}*. 🎉\n\n🔁 ${r.totalInstallments} de ${r.totalInstallments} ocurrencias\nTotal: ${total}\n\nYa registré el movimiento en Finanzas.`;
    }
    const typeLabel = r.type === "income" ? "cobro" : "pago";
    return `Listo, ${typeLabel} confirmado.\n\n💳 ${r.description} — ${fmt(r.amount)}\n\nYa lo registré en Finanzas.\n📅 Próximo vencimiento: ${nextStr}`;
  }
  if (isPtPt(locale)) {
    if (r.status === "completed") {
      const total = fmt(r.totalAmount ?? r.amount * (r.totalInstallments ?? 1));
      if (r.recurrenceType === "installment") return `Essa foi a última — todas as prestações liquidadas. 🎉\n\n💳 ${r.description}\nTotal pago: ${total}\n\nJá registei o lançamento em Finanças.`;
      return `Essa foi a última — encerrei o acompanhamento de *${r.description}*. 🎉\n\n🔁 ${r.totalInstallments} de ${r.totalInstallments} ocorrências\nTotal: ${total}\n\nJá registei o lançamento em Finanças.`;
    }
    const typeLabel = r.type === "income" ? "recebimento" : "pagamento";
    return `Certo, ${typeLabel} confirmado.\n\n💳 ${r.description} — ${fmt(r.amount)}\n\nJá registei em Finanças.\n📅 Próximo vencimento: ${nextStr}`;
  }
  if (r.status === "completed") {
    const total = fmt(r.totalAmount ?? r.amount * (r.totalInstallments ?? 1));
    if (r.recurrenceType === "installment") {
      return `Essa foi a última — todas as parcelas quitadas. 🎉\n\n💳 ${r.description}\nTotal pago: ${total}\n\nJá registrei o lançamento em Finanças.`;
    }
    return `Essa foi a última — encerrei o acompanhamento de *${r.description}*. 🎉\n\n🔁 ${r.totalInstallments} de ${r.totalInstallments} ocorrências\nTotal: ${total}\n\nJá registrei o lançamento em Finanças.`;
  }
  const typeLabel = r.type === "income" ? "recebimento" : "pagamento";
  return `Certo, ${typeLabel} confirmado.\n\n💳 ${r.description} — ${fmt(r.amount)}\n\nJá registrei em Finanças.\n📅 Próximo vencimento: ${nextStr}`;
}

export function replyRecurringCreated(r: RecurringTransaction, locale?: string): string {
  const fmt = (v: number) => formatCurrency(v);
  const nextStr = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString(dateLocale(locale));
  const typeEmoji = r.type === "income" ? "💰" : "💸";
  if (isEs(locale)) {
    const unitLabel: Record<string, string> = { monthly: "mensual", weekly: "semanal", daily: "diario", yearly: "anual" };
    if (r.recurrenceType === "installment") {
      return `Registrado. Voy a seguir cada cuota por ti.\n\n${typeEmoji} *${r.description}*\n💳 ${fmt(r.amount)}/cuota × ${r.totalInstallments ?? "?"} veces\n📅 Primer vencimiento: ${nextStr}\n\nTe aviso a las 20h de cada vencimiento.`;
    }
    const termLine = r.totalInstallments ? ` · ${r.totalInstallments} veces` : "";
    return `Registrado. Voy a estar atento a los próximos vencimientos.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n🔁 ${unitLabel[r.repeatUnit] ?? r.repeatUnit}${termLine}\n📅 Próximo vencimiento: ${nextStr}\n\nTe aviso a las 20h de cada vencimiento.`;
  }
  if (isPtPt(locale)) {
    const unitLabel: Record<string, string> = { monthly: "mensal", weekly: "semanal", daily: "diário", yearly: "anual" };
    if (r.recurrenceType === "installment") {
      return `Registado. Vou acompanhar cada prestação por ti.\n\n${typeEmoji} *${r.description}*\n💳 ${fmt(r.amount)}/prestação × ${r.totalInstallments ?? "?"} vezes\n📅 Primeiro vencimento: ${nextStr}\n\nAviso-te às 20h de cada vencimento.`;
    }
    const termLine = r.totalInstallments ? ` · ${r.totalInstallments} vezes` : "";
    return `Registado. Fico atento aos próximos vencimentos.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n🔁 ${unitLabel[r.repeatUnit] ?? r.repeatUnit}${termLine}\n📅 Próximo vencimento: ${nextStr}\n\nAviso-te às 20h de cada vencimento.`;
  }
  const unitLabel: Record<string, string> = { monthly: "mensal", weekly: "semanal", daily: "diário", yearly: "anual" };
  if (r.recurrenceType === "installment") {
    return `Cadastrado. Vou acompanhar cada parcela pra você.\n\n${typeEmoji} *${r.description}*\n💳 ${fmt(r.amount)}/parcela × ${r.totalInstallments ?? "?"} vezes\n📅 Primeiro vencimento: ${nextStr}\n\nAviso você às 20h de cada vencimento.`;
  }
  const termLine = r.totalInstallments ? ` · ${r.totalInstallments} vezes` : "";
  return `Cadastrado. Fico de olho nos próximos vencimentos.\n\n${typeEmoji} *${r.description}* — ${fmt(r.amount)}\n🔁 ${unitLabel[r.repeatUnit] ?? r.repeatUnit}${termLine}\n📅 Próximo vencimento: ${nextStr}\n\nAviso você às 20h de cada vencimento.`;
}

export function replyGoalCreated(goal: Goal, pct: number, locale?: string): string {
  const category = goal.category === "Geral" && isEs(locale) ? "General" : goal.category;
  const deadlineStr = goal.deadline ? new Date(goal.deadline + "T12:00:00").toLocaleDateString(dateLocale(locale)) : undefined;

  if (isEs(locale)) {
    const currentLine = goal.currentAmount > 0 ? `\n💵 Ya ahorrado: ${formatCurrency(goal.currentAmount)}` : "";
    const deadlineLine = deadlineStr ? `\n📅 Plazo: ${deadlineStr}` : "";
    return `✅ *¡Meta creada con éxito!*\n\n🎯 *${goal.title}*\n💰 Objetivo: ${formatCurrency(goal.targetAmount)}${currentLine}\n📁 Categoría: ${category}${deadlineLine}\n📊 Progreso: ${pct}%\n\nSíguela en el panel → Metas 🚀`;
  }
  if (isPtPt(locale)) {
    const currentLine = goal.currentAmount > 0 ? `\n💵 Já poupado: ${formatCurrency(goal.currentAmount)}` : "";
    const deadlineLine = deadlineStr ? `\n📅 Prazo: ${deadlineStr}` : "";
    return `✅ *Meta criada com sucesso!*\n\n🎯 *${goal.title}*\n💰 Alvo: ${formatCurrency(goal.targetAmount)}${currentLine}\n📁 Categoria: ${category}${deadlineLine}\n📊 Progresso: ${pct}%\n\nAcompanha no painel → Metas 🚀`;
  }
  const currentLine = goal.currentAmount > 0 ? `\n💵 Já guardado: ${formatCurrency(goal.currentAmount)}` : "";
  const deadlineLine = deadlineStr ? `\n📅 Prazo: ${deadlineStr}` : "";
  return `✅ *Meta criada com sucesso!*\n\n🎯 *${goal.title}*\n💰 Alvo: ${formatCurrency(goal.targetAmount)}${currentLine}\n📁 Categoria: ${category}${deadlineLine}\n📊 Progresso: ${pct}%\n\nAcompanhe no dashboard → Metas 🚀`;
}

export function replyRecurringList(items: RecurringTransaction[], locale?: string): string {
  const fmt = (v: number) => formatCurrency(v);
  if (!items.length) return isEs(locale) ? "Ningún movimiento recurrente o en cuotas activo por el momento." : "Nenhum lançamento recorrente ou parcelado ativo no momento.";
  const installments = items.filter(r => r.recurrenceType === "installment");
  const recurring = items.filter(r => r.recurrenceType === "recurring");
  if (isEs(locale)) {
    let msg = `📋 *Tus movimientos recurrentes:*\n\n`;
    if (installments.length) {
      msg += `*💳 Cuotas:*\n`;
      installments.forEach(r => {
        const next = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString(dateLocale(locale));
        msg += `• ${r.description} — ${fmt(r.amount)} (${r.paidInstallments}/${r.totalInstallments}) · próx. ${next}\n`;
      });
      msg += "\n";
    }
    if (recurring.length) {
      msg += `*🔁 Recurrentes:*\n`;
      recurring.forEach(r => {
        const next = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString(dateLocale(locale));
        const remaining = recurringRemaining(r);
        const termLabel = remaining !== null ? ` · faltan ${remaining}` : "";
        msg += `• ${r.description} — ${fmt(r.amount)} · próx. ${next}${termLabel}\n`;
      });
    }
    return msg.trim();
  }
  if (isPtPt(locale)) {
    let msg = `📋 *Os teus lançamentos recorrentes:*\n\n`;
    if (installments.length) {
      msg += `*💳 Prestações:*\n`;
      installments.forEach(r => {
        const next = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString(dateLocale(locale));
        msg += `• ${r.description} — ${fmt(r.amount)} (${r.paidInstallments}/${r.totalInstallments}) · próx. ${next}\n`;
      });
      msg += "\n";
    }
    if (recurring.length) {
      msg += `*🔁 Recorrentes:*\n`;
      recurring.forEach(r => {
        const next = new Date(r.nextDueDate + "T12:00:00").toLocaleDateString(dateLocale(locale));
        const remaining = recurringRemaining(r);
        const termLabel = remaining !== null ? ` · faltam ${remaining}` : "";
        msg += `• ${r.description} — ${fmt(r.amount)} · próx. ${next}${termLabel}\n`;
      });
    }
    return msg.trim();
  }
  let msg = `📋 *Seus lançamentos recorrentes:*\n\n`;
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

export function replyFileSaved(originalName: string, folder: string, locale?: string): string {
  const base = originalName.split(".")[0];
  if (isEs(locale)) return `Guardado en tu Drive. 📁\n\n📄 ${originalName}\n🗂️ Carpeta: ${folder}\n\nCuando lo necesites: _"busca mi archivo ${base}"_`;
  if (isPtPt(locale)) return `Guardado no teu Drive. 📁\n\n📄 ${originalName}\n🗂️ Pasta: ${folder}\n\nQuando precisares: _"encontra o meu ficheiro ${base}"_`;
  return `Guardado no seu Drive. 📁\n\n📄 ${originalName}\n🗂️ Pasta: ${folder}\n\nQuando precisar: _"ache meu arquivo ${base}"_`;
}

export function replyFileFound(originalName: string, locale?: string): string {
  if (isEs(locale)) return `Lo encontré. 📄 ${originalName}\n\nYa te lo estoy enviando...`;
  if (isPtPt(locale)) return `Encontrei. 📄 ${originalName}\n\nJá te estou a enviar...`;
  return `Encontrei. 📄 ${originalName}\n\nJá te enviando...`;
}

export function replyFileNotFound(query: string, locale?: string): string {
  if (isEs(locale)) return `No encontré nada con *"${query}"* en tu Drive.\n\nIntenta describirlo de otra forma, o échale un vistazo directo en *📁 Drive* en el panel.`;
  if (isPtPt(locale)) return `Não encontrei nada com *"${query}"* no teu Drive.\n\nTenta descrever de outra forma, ou dá uma vista de olhos direto em *📁 Drive* no painel.`;
  return `Não encontrei nada com *"${query}"* no seu Drive.\n\nTenta descrever de outro jeito, ou dá uma olhada direto em *📁 Drive* no painel.`;
}

export function replyDriveFileList(count: number, locale?: string): string {
  if (isEs(locale)) {
    if (count === 0) return `Tu Drive todavía está vacío.\n\nEnvíame un archivo (PDF, imagen, documento) y yo lo organizo por ti.`;
    return `📁 Tienes *${count} archivo${count > 1 ? "s" : ""}* guardados conmigo.\n\nPara buscar: _"busca el comprobante del mecánico"_\nPara ver todo: *📁 Drive* en el panel.`;
  }
  if (isPtPt(locale)) {
    if (count === 0) return `O teu Drive ainda está vazio.\n\nEnvia-me um ficheiro (PDF, imagem, documento) que eu organizo por ti.`;
    return `📁 Tens *${count} ficheiro${count > 1 ? "s" : ""}* guardados comigo.\n\nPara procurar: _"encontra o comprovativo do mecânico"_\nPara ver tudo: *📁 Drive* no painel.`;
  }
  if (count === 0) return `Seu Drive ainda está vazio.\n\nMe envie um arquivo (PDF, imagem, documento) que eu organizo pra você.`;
  return `📁 Você tem *${count} arquivo${count > 1 ? "s" : ""}* guardados comigo.\n\nPara buscar: _"ache o comprovante do mecânico"_\nPara ver tudo: *📁 Drive* no painel.`;
}

export function replyAgendaCreated(a: Appointment, locale?: string): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  const endLine = a.endAt ? ` ${isEs(locale) ? "hasta" : "até"} ${formatDateTimeBR(a.endAt).slice(11)}` : "";
  if (isEs(locale)) return `Agendado en tu calendario.\n\n📅 *${a.title}*\n🕒 ${dateTime}${endLine}${locationLine}`;
  if (isPtPt(locale)) return `Marcado na tua agenda.\n\n📅 *${a.title}*\n🕒 ${dateTime}${endLine}${locationLine}`;
  return `Marcado na sua agenda.\n\n📅 *${a.title}*\n🕒 ${dateTime}${endLine}${locationLine}`;
}

export function replyAgendaList(appointments: Appointment[], locale?: string): string {
  if (isEs(locale)) {
    if (!appointments.length) return `Nada agendado para los próximos días.\n\nPara agendar: _"Agendar reunión mañana a las 14"_`;
    let msg = `🗓️ *Tus próximos eventos (${appointments.length}):*\n\n`;
    appointments.slice(0, 10).forEach((a, i) => {
      const dateTime = formatDateTimeBR(a.startAt);
      const loc = a.location ? ` · ${a.location}` : "";
      msg += `${i + 1}. *${a.title}*\n   🕒 ${dateTime}${loc}\n\n`;
    });
    return msg.trim();
  }
  if (isPtPt(locale)) {
    if (!appointments.length) return `Nada agendado para os próximos dias.\n\nPara marcar: _"Agendar reunião amanhã às 14h"_`;
    let msg = `🗓️ *Os teus próximos compromissos (${appointments.length}):*\n\n`;
    appointments.slice(0, 10).forEach((a, i) => {
      const dateTime = formatDateTimeBR(a.startAt);
      const loc = a.location ? ` · ${a.location}` : "";
      msg += `${i + 1}. *${a.title}*\n   🕒 ${dateTime}${loc}\n\n`;
    });
    return msg.trim();
  }
  if (!appointments.length) return `Nada agendado nos próximos dias.\n\nPara marcar: _"Agendar reunião amanhã às 14h"_`;
  let msg = `🗓️ *Seus próximos compromissos (${appointments.length}):*\n\n`;
  appointments.slice(0, 10).forEach((a, i) => {
    const dateTime = formatDateTimeBR(a.startAt);
    const loc = a.location ? ` · ${a.location}` : "";
    msg += `${i + 1}. *${a.title}*\n   🕒 ${dateTime}${loc}\n\n`;
  });
  return msg.trim();
}

export function replyAgendaUpdated(a: Appointment, locale?: string): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  const verbo = isEs(locale) ? "Actualizado." : isPtPt(locale) ? "Atualizado." : "Atualizado.";
  return `${verbo}\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}`;
}

export function replyAgendaDeleted(title: string, locale?: string): string {
  if (isEs(locale)) return `Cancelado — eliminé *${title}* de tu calendario.`;
  if (isPtPt(locale)) return `Cancelado — removi *${title}* da tua agenda.`;
  return `Cancelado — removi *${title}* da sua agenda.`;
}

/** `quando` é o texto livre de "daqui a quanto tempo" (ex: "2 horas",
 *  "15 minutos") — usado tanto no lembrete de 2h quanto no de 15min, cada
 *  um controlado por sua própria coluna em appointments (reminder_sent_at
 *  vs reminder_15min_sent_at), então os dois podem disparar de forma
 *  independente pro mesmo compromisso. */
export function replyAppointmentReminder(a: Appointment, quando: string, locale?: string): string {
  const dateTime = formatDateTimeBR(a.startAt);
  const locationLine = a.location ? `\n📍 ${a.location}` : "";
  const meetLine = a.meetLink ? `\n🔗 ${a.meetLink}` : "";
  if (isEs(locale)) return `⏰ Pasando para recordarte — en ${quando} tienes:\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}${meetLine}`;
  if (isPtPt(locale)) return `⏰ A passar para lembrar — daqui a ${quando} tens:\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}${meetLine}`;
  return `⏰ Passando para lembrar — daqui a ${quando} você tem:\n\n📅 *${a.title}*\n🕒 ${dateTime}${locationLine}${meetLine}`;
}

type MeetLike = {
  title: string; startAt: string; endAt?: string; meetLink?: string;
};

export function replyMeetCreated(meet: MeetLike, attendees?: Array<{ phone?: string; email?: string }>, locale?: string): string {
  const start = formatDateTimeBR(meet.startAt);
  const end = meet.endAt
    ? new Date(meet.endAt).toLocaleTimeString(dateLocale(locale), { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : "";
  const endStr = end ? ` → ${end}` : "";
  const meetStr = meet.meetLink ? `\n🔗 ${meet.meetLink}` : "";
  const withPhones = (attendees || []).filter(a => a.phone).length;
  const withEmails = (attendees || []).filter(a => a.email).length;
  if (isEs(locale)) {
    const inviteNote = withPhones > 0 ? `\n👥 Ya avisé a ${withPhones} participante${withPhones > 1 ? "s" : ""} por WhatsApp` : "";
    const emailNote = withEmails > 0 ? `\n📧 Invitación por correo enviada a ${withEmails} participante${withEmails > 1 ? "s" : ""}` : "";
    return `${meet.meetLink ? "Reunión agendada, con Google Meet." : "Evento agendado."}\n\n📅 *${meet.title}*\n🕒 ${start}${endStr}${meetStr}${inviteNote}${emailNote}`;
  }
  if (isPtPt(locale)) {
    const inviteNote = withPhones > 0 ? `\n👥 Já avisei ${withPhones} participante${withPhones > 1 ? "s" : ""} pelo WhatsApp` : "";
    const emailNote = withEmails > 0 ? `\n📧 Convite por e-mail enviado a ${withEmails} participante${withEmails > 1 ? "s" : ""}` : "";
    return `${meet.meetLink ? "Reunião marcada, com Google Meet." : "Compromisso marcado."}\n\n📅 *${meet.title}*\n🕒 ${start}${endStr}${meetStr}${inviteNote}${emailNote}`;
  }
  const inviteNote = withPhones > 0 ? `\n👥 Já avisei ${withPhones} participante${withPhones > 1 ? "s" : ""} pelo WhatsApp` : "";
  const emailNote = withEmails > 0 ? `\n📧 Convite por e-mail enviado para ${withEmails} participante${withEmails > 1 ? "s" : ""}` : "";
  return `${meet.meetLink ? "Reunião marcada, com Google Meet." : "Compromisso marcado."}\n\n📅 *${meet.title}*\n🕒 ${start}${endStr}${meetStr}${inviteNote}${emailNote}`;
}

export function replyMeetInvite(meet: MeetLike, name: string, locale?: string): string {
  if (isEs(locale)) return `${name}, fuiste invitado a una reunión.\n\n📅 *${meet.title}*\n🕒 ${formatDateTimeBR(meet.startAt)}\n\n🔗 *Link:* ${meet.meetLink ?? "(sin link)"}\n\nNos vemos allí.`;
  if (isPtPt(locale)) return `${name}, foste convidado para uma reunião.\n\n📅 *${meet.title}*\n🕒 ${formatDateTimeBR(meet.startAt)}\n\n🔗 *Link:* ${meet.meetLink ?? "(sem link)"}\n\nAté lá.`;
  return `${name}, você foi convidado para uma reunião.\n\n📅 *${meet.title}*\n🕒 ${formatDateTimeBR(meet.startAt)}\n\n🔗 *Link:* ${meet.meetLink ?? "(sem link)"}\n\nAté lá.`;
}

export function replyMeetAtaRequest(title: string, locale?: string): string {
  if (isEs(locale)) return `Tu reunión "${title}" terminó.\n\nSi quieres, envíame un *audio* o *texto* resumiendo lo que se conversó:\n\n• Puntos principales\n• Decisiones tomadas\n• Próximas acciones\n\nYo organizo todo y ya creo las tareas.`;
  if (isPtPt(locale)) return `A tua reunião "${title}" terminou.\n\nSe quiseres, envia-me um *áudio* ou *texto* a resumir o que foi discutido:\n\n• Pontos principais\n• Decisões tomadas\n• Próximas ações\n\nEu organizo tudo e já crio as tarefas.`;
  return `Sua reunião "${title}" encerrou.\n\nSe quiser, me manda um *áudio* ou *texto* resumindo o que foi discutido:\n\n• Principais pontos\n• Decisões tomadas\n• Próximas ações\n\nEu organizo tudo e já crio as tarefas.`;
}

export function replyMeetAtaGenerated(title: string, ata: { summary: string; decisions: string[]; tasks: string[] }, locale?: string): string {
  if (isEs(locale)) {
    let msg = `📋 *Acta de la reunión: ${title}*\n\n`;
    msg += `📝 *Resumen:*\n${ata.summary}\n`;
    if (ata.decisions.length) { msg += `\n✅ *Decisiones tomadas:*\n`; ata.decisions.forEach(d => { msg += `• ${d}\n`; }); }
    if (ata.tasks.length) { msg += `\n📌 *Tareas que ya creé (${ata.tasks.length}):*\n`; ata.tasks.forEach(t => { msg += `• ${t}\n`; }); msg += `\nYa están en *📋 Tareas* en el panel.`; }
    return msg.trim();
  }
  if (isPtPt(locale)) {
    let msg = `📋 *Ata da reunião: ${title}*\n\n`;
    msg += `📝 *Resumo:*\n${ata.summary}\n`;
    if (ata.decisions.length) { msg += `\n✅ *Decisões tomadas:*\n`; ata.decisions.forEach(d => { msg += `• ${d}\n`; }); }
    if (ata.tasks.length) { msg += `\n📌 *Tarefas que já criei (${ata.tasks.length}):*\n`; ata.tasks.forEach(t => { msg += `• ${t}\n`; }); msg += `\nJá estão em *📋 Tarefas* no painel.`; }
    return msg.trim();
  }
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

export function replyUnknown(originalMsg?: string, locale?: string): string {
  if (isEs(locale)) {
    const quote = originalMsg ? `\n\n> _"${originalMsg}"_\n` : "\n";
    return `No entendí bien lo que necesitas.${quote}
¿Puedes contarme de otra forma? Por ejemplo:

💸 *Gasto:* _"gasté 50 en el súper"_
💰 *Ingreso:* _"recibí 3000 de sueldo"_
📋 *Tarea:* _"crear tarea: llamar a Juan"_
🔔 *Recordatorio:* _"recuérdame mañana a las 9 pagar la cuenta"_
🎯 *Meta:* _"meta: ahorrar 5000 para un viaje"_
📊 *Saldo:* _"mi saldo"_ o _"movimientos"_

O escribe *ayuda* para ver todo lo que sé hacer. Si tu duda es sobre una función que no aparece aquí, entra al panel de Zelo y abre *Suporte* en la esquina inferior derecha.`;
  }
  if (isPtPt(locale)) {
    const quote = originalMsg ? `\n\n> _"${originalMsg}"_\n` : "\n";
    return `Não percebi bem o que precisas.${quote}
Podes contar-me de outra forma? Por exemplo:

💸 *Despesa:* _"gastei 50 no supermercado"_
💰 *Receita:* _"recebi 3000 de salário"_
📋 *Tarefa:* _"criar tarefa: ligar ao João"_
🔔 *Lembrete:* _"lembra-me amanhã às 9h de pagar a conta"_
🎯 *Meta:* _"meta: poupar 5000 para uma viagem"_
📊 *Saldo:* _"o meu saldo"_ ou _"extrato"_

Ou escreve *ajuda* para ver tudo o que sei fazer. Se a tua dúvida for sobre uma função que não aparece aqui, entra no painel do Zelo e abre o *Suporte* no canto inferior direito.`;
  }
  const quote = originalMsg ? `\n\n> _"${originalMsg}"_\n` : "\n";
  return `Não peguei bem o que você precisa.${quote}
Pode me contar de outro jeito? Por exemplo:

💸 *Despesa:* _"gastei 50 no mercado"_
💰 *Receita:* _"recebi 3000 de salário"_
📋 *Tarefa:* _"criar tarefa: ligar pro João"_
🔔 *Lembrete:* _"me lembra amanhã às 9h de pagar conta"_
🎯 *Meta:* _"meta: guardar 5000 para viagem"_
📊 *Saldo:* _"meu saldo"_ ou _"extrato"_

Ou digite *ajuda* pra ver tudo que eu sei fazer. Se a dúvida for sobre uma função que não aparece aqui, acesse o painel do Zelo e abra o *Suporte* no canto inferior direito.`;
}

export function replyLowConfidence(intent: string, details: string, originalMsg: string, locale?: string): string {
  const intentLabels: Record<string, Record<string, string>> = {
    "pt-BR": {
      finance_register: "registrar um lançamento financeiro", finance_edit: "editar um lançamento", finance_delete: "excluir um lançamento",
      task_create: "criar uma tarefa", task_update: "atualizar uma tarefa", reminder_set: "criar um lembrete",
      goal_create: "criar uma meta", goal_add: "adicionar valor a uma meta",
    },
    "pt-PT": {
      finance_register: "registar um lançamento financeiro", finance_edit: "editar um lançamento", finance_delete: "excluir um lançamento",
      task_create: "criar uma tarefa", task_update: "atualizar uma tarefa", reminder_set: "criar um lembrete",
      goal_create: "criar uma meta", goal_add: "adicionar valor a uma meta",
    },
    es: {
      finance_register: "registrar un movimiento financiero", finance_edit: "editar un movimiento", finance_delete: "eliminar un movimiento",
      task_create: "crear una tarea", task_update: "actualizar una tarea", reminder_set: "crear un recordatorio",
      goal_create: "crear una meta", goal_add: "agregar un valor a una meta",
    },
  };
  const dict = intentLabels[locale ?? "pt-BR"] ?? intentLabels["pt-BR"];
  const label = dict[intent] || intent;
  if (isEs(locale)) return `Entendí que quieres *${label}*, pero no quedé seguro de un detalle.\n\n> _"${originalMsg}"_\n\n${details}\n\n¿Está correcto? Si es así, solo confirma. Si no, corrígeme y lo ajusto.`;
  if (isPtPt(locale)) return `Percebi que queres *${label}*, mas não fiquei seguro de um detalhe.\n\n> _"${originalMsg}"_\n\n${details}\n\nEstá certo? Se sim, é só confirmares. Se não, corrige-me que eu ajusto.`;
  return `Entendi que você quer *${label}*, mas não fiquei seguro de um detalhe.\n\n> _"${originalMsg}"_\n\n${details}\n\nEstá certo? Se sim, é só confirmar. Se não, me corrige que eu ajusto.`;
}

// ── Supermercado ──────────────────────────

export function replyGroceryListAdded(count: number, source?: string, locale?: string): string {
  if (isEs(locale)) {
    if (count === 0) return `❓ No logré identificar qué agregar a la lista.`;
    const originLine = source ? ` de la lista de *${source}*` : "";
    return `🛒 Agregué ${count} ${count === 1 ? "artículo" : "artículos"}${originLine} a tu lista de compras.`;
  }
  if (isPtPt(locale)) {
    if (count === 0) return `❓ Não consegui identificar o que adicionar à lista.`;
    const originLine = source ? ` da lista de *${source}*` : "";
    return `🛒 Adicionei ${count} ${count === 1 ? "item" : "itens"}${originLine} à tua lista de compras.`;
  }
  if (count === 0) return `❓ Não consegui identificar o que adicionar na lista.`;
  const originLine = source ? ` da lista de *${source}*` : "";
  return `🛒 Adicionei ${count} ${count === 1 ? "item" : "itens"}${originLine} na sua lista de compras.`;
}

export function replyGroceryList(items: ShoppingListItem[], locale?: string): string {
  const pending = items.filter(i => !i.checked);
  if (isEs(locale)) {
    if (!pending.length) return `🛒 Tu lista de compras está vacía — nada pendiente.`;
    let msg = `🛒 *Lista de compras (${pending.length}):*\n\n`;
    let lastCategory = "";
    pending.forEach(i => {
      if (i.category !== lastCategory) { msg += `\n*${i.category}*\n`; lastCategory = i.category; }
      msg += `• ${i.name}${i.quantity ? ` — ${i.quantity}` : ""}\n`;
    });
    return msg.trim();
  }
  if (isPtPt(locale)) {
    if (!pending.length) return `🛒 A tua lista de compras está vazia — nada pendente.`;
    let msg = `🛒 *Lista de compras (${pending.length}):*\n\n`;
    let lastCategory = "";
    pending.forEach(i => {
      if (i.category !== lastCategory) { msg += `\n*${i.category}*\n`; lastCategory = i.category; }
      msg += `• ${i.name}${i.quantity ? ` — ${i.quantity}` : ""}\n`;
    });
    return msg.trim();
  }
  if (!pending.length) return `🛒 Sua lista de compras está vazia — nada pendente.`;
  let msg = `🛒 *Lista de compras (${pending.length}):*\n\n`;
  let lastCategory = "";
  pending.forEach(i => {
    if (i.category !== lastCategory) { msg += `\n*${i.category}*\n`; lastCategory = i.category; }
    msg += `• ${i.name}${i.quantity ? ` — ${i.quantity}` : ""}\n`;
  });
  return msg.trim();
}

export function replyGroceryItemChecked(checked: string[], notFound: string[], locale?: string): string {
  if (isEs(locale)) {
    let msg = "";
    if (checked.length) msg += `✅ Marqué como comprado: ${checked.join(", ")}.`;
    if (notFound.length) msg += `${msg ? "\n" : ""}❓ No encontré en la lista: ${notFound.join(", ")}.`;
    return msg || "❓ No encontré ninguno de esos artículos en tu lista.";
  }
  if (isPtPt(locale)) {
    let msg = "";
    if (checked.length) msg += `✅ Marquei como comprado: ${checked.join(", ")}.`;
    if (notFound.length) msg += `${msg ? "\n" : ""}❓ Não encontrei na lista: ${notFound.join(", ")}.`;
    return msg || "❓ Não encontrei nenhum desses itens na tua lista.";
  }
  let msg = "";
  if (checked.length) msg += `✅ Marquei como comprado: ${checked.join(", ")}.`;
  if (notFound.length) msg += `${msg ? "\n" : ""}❓ Não achei na lista: ${notFound.join(", ")}.`;
  return msg || "❓ Não encontrei nenhum desses itens na sua lista.";
}

export function replyGroceryPurchaseSaved(p: GroceryPurchase, locale?: string): string {
  const dateStr = formatDateBR(p.date);
  if (isEs(locale)) {
    let msg = `🧾 *¡Compra registrada!*\n\n🏪 ${p.storeName}\n📅 ${dateStr}\n\n`;
    p.items.forEach(i => {
      msg += i.quantity > 1
        ? `• ${i.productName} — ${formatCurrency(i.price)} × ${i.quantity} = ${formatCurrency(i.price * i.quantity)}\n`
        : `• ${i.productName} — ${formatCurrency(i.price)}\n`;
    });
    msg += `\n💰 *Total: ${formatCurrency(p.total)}*`;
    return msg;
  }
  let msg = `🧾 *Compra registada!*\n\n🏪 ${p.storeName}\n📅 ${dateStr}\n\n`;
  p.items.forEach(i => {
    msg += i.quantity > 1
      ? `• ${i.productName} — ${formatCurrency(i.price)} × ${i.quantity} = ${formatCurrency(i.price * i.quantity)}\n`
      : `• ${i.productName} — ${formatCurrency(i.price)}\n`;
  });
  msg += `\n💰 *Total: ${formatCurrency(p.total)}*`;
  return msg;
}

export function replyGroceryPurchaseFinished(p: GroceryPurchase, locale?: string): string {
  if (isEs(locale)) {
    let msg = `✅ *¡Compra cerrada — ${p.storeName}!*\n\n`;
    p.items.forEach(i => { msg += `• ${i.productName}\n`; });
    msg += `\n💰 *Total: ${formatCurrency(p.total)}*\n📊 Registrado en Finanzas y la lista marcada fue borrada.`;
    return msg;
  }
  if (isPtPt(locale)) {
    let msg = `✅ *Compra fechada — ${p.storeName}!*\n\n`;
    p.items.forEach(i => { msg += `• ${i.productName}\n`; });
    msg += `\n💰 *Total: ${formatCurrency(p.total)}*\n📊 Lançado em Finanças e a lista marcada foi limpa.`;
    return msg;
  }
  let msg = `✅ *Compra fechada — ${p.storeName}!*\n\n`;
  p.items.forEach(i => { msg += `• ${i.productName}\n`; });
  msg += `\n💰 *Total: ${formatCurrency(p.total)}*\n📊 Lançado em Finanças e a lista marcada foi limpa.`;
  return msg;
}

export function replyGrocerySpend(spend: Array<{ storeName: string; total: number; visits: number }>, totalSpent: number, locale?: string): string {
  if (isEs(locale)) {
    if (!spend.length) return `🛒 Ninguna compra de supermercado registrada todavía.`;
    let msg = `💲 *Gastos en el supermercado:*\n\n`;
    spend.slice(0, 6).forEach(s => { msg += `🏪 ${s.storeName} — ${formatCurrency(s.total)} _(${s.visits}x)_\n`; });
    msg += `\n💰 *Total general: ${formatCurrency(totalSpent)}*`;
    return msg;
  }
  if (isPtPt(locale)) {
    if (!spend.length) return `🛒 Nenhuma compra de supermercado registada ainda.`;
    let msg = `💲 *Despesas no supermercado:*\n\n`;
    spend.slice(0, 6).forEach(s => { msg += `🏪 ${s.storeName} — ${formatCurrency(s.total)} _(${s.visits}x)_\n`; });
    msg += `\n💰 *Total geral: ${formatCurrency(totalSpent)}*`;
    return msg;
  }
  if (!spend.length) return `🛒 Nenhuma compra de mercado registrada ainda.`;
  let msg = `💲 *Gastos no mercado:*\n\n`;
  spend.slice(0, 6).forEach(s => { msg += `🏪 ${s.storeName} — ${formatCurrency(s.total)} _(${s.visits}x)_\n`; });
  msg += `\n💰 *Total geral: ${formatCurrency(totalSpent)}*`;
  return msg;
}

// ── Funcionários ──────────────────────────

export function replyEmployeeCreated(e: Employee, locale?: string): string {
  const dateStr = formatDateBR(e.startDate);
  if (isEs(locale)) return `Registrado. 👥\n\n*${e.name}* — ${e.role}\n💰 ${formatCurrency(e.salary)}\n📅 Inicio: ${dateStr}\n\n🏢 Míralo en Empleados en el panel.`;
  if (isPtPt(locale)) return `Registado. 👥\n\n*${e.name}* — ${e.role}\n💰 ${formatCurrency(e.salary)}\n📅 Início: ${dateStr}\n\n🏢 Vê em Funcionários no painel.`;
  return `Cadastrado. 👥\n\n*${e.name}* — ${e.role}\n💰 ${formatCurrency(e.salary)}\n📅 Início: ${dateStr}\n\n🏢 Veja em Funcionários no dashboard.`;
}

export function replyEmployeeList(employees: Employee[], totalPayroll: number, locale?: string): string {
  if (isEs(locale)) {
    if (!employees.length) return `👥 Ningún empleado activo registrado.`;
    let msg = `👥 *Empleados activos (${employees.length}):*\n\n`;
    employees.forEach(e => { msg += `• ${e.name} — ${e.role} — ${formatCurrency(e.salary)}\n`; });
    msg += `\n💰 *Nómina mensual: ${formatCurrency(totalPayroll)}*`;
    return msg;
  }
  if (isPtPt(locale)) {
    if (!employees.length) return `👥 Nenhum funcionário ativo registado.`;
    let msg = `👥 *Funcionários ativos (${employees.length}):*\n\n`;
    employees.forEach(e => { msg += `• ${e.name} — ${e.role} — ${formatCurrency(e.salary)}\n`; });
    msg += `\n💰 *Folha mensal: ${formatCurrency(totalPayroll)}*`;
    return msg;
  }
  if (!employees.length) return `👥 Nenhum funcionário ativo cadastrado.`;
  let msg = `👥 *Funcionários ativos (${employees.length}):*\n\n`;
  employees.forEach(e => { msg += `• ${e.name} — ${e.role} — ${formatCurrency(e.salary)}\n`; });
  msg += `\n💰 *Folha mensal: ${formatCurrency(totalPayroll)}*`;
  return msg;
}

export function replyEmployeeUpdated(e: Employee, locale?: string): string {
  if (isEs(locale)) return `✏️ Actualizado.\n\n*${e.name}* — ${e.role}\n💰 ${formatCurrency(e.salary)}`;
  return `✏️ Atualizado.\n\n*${e.name}* — ${e.role}\n💰 ${formatCurrency(e.salary)}`;
}

export function replyEmployeeDeactivated(e: Employee, locale?: string): string {
  if (isEs(locale)) return `🗑️ *${e.name}* fue desactivado(a).`;
  return `🗑️ *${e.name}* foi desativado(a).`;
}

// ── Clientes (CRM) ────────────────────────

export function replyCustomerCreated(c: Customer, locale?: string): string {
  const line = [c.phone, c.email, c.company, c.address].filter(Boolean).join(" · ");
  if (isEs(locale)) return `Registrado. 🧾\n\n*${c.name}*${line ? `\n${line}` : ""}\n\n🏢 Míralo en Clientes en el panel.`;
  if (isPtPt(locale)) return `Registado. 🧾\n\n*${c.name}*${line ? `\n${line}` : ""}\n\n🏢 Vê em Clientes no painel.`;
  return `Cadastrado. 🧾\n\n*${c.name}*${line ? `\n${line}` : ""}\n\n🏢 Veja em Clientes no dashboard.`;
}

export function replyCustomerList(customers: Customer[], locale?: string): string {
  if (isEs(locale)) {
    if (!customers.length) return `🧾 Ningún cliente activo registrado.`;
    let msg = `🧾 *Clientes activos (${customers.length}):*\n\n`;
    customers.forEach(c => { msg += `• ${c.name}${c.phone ? ` — ${c.phone}` : ""}\n`; });
    return msg.trim();
  }
  if (isPtPt(locale)) {
    if (!customers.length) return `🧾 Nenhum cliente ativo registado.`;
    let msg = `🧾 *Clientes ativos (${customers.length}):*\n\n`;
    customers.forEach(c => { msg += `• ${c.name}${c.phone ? ` — ${c.phone}` : ""}\n`; });
    return msg.trim();
  }
  if (!customers.length) return `🧾 Nenhum cliente ativo cadastrado.`;
  let msg = `🧾 *Clientes ativos (${customers.length}):*\n\n`;
  customers.forEach(c => { msg += `• ${c.name}${c.phone ? ` — ${c.phone}` : ""}\n`; });
  return msg.trim();
}

export function replyCustomerInfo(customers: Customer[], keyword: string, locale?: string): string {
  if (isEs(locale)) {
    if (!customers.length) return `❓ No encontré ningún cliente con "${keyword}". Escribe *mis clientes* para ver la lista.`;
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
    let msg = `🧾 Encontré *${customers.length}* clientes con "${keyword}" — ¿cuál de ellos?\n\n`;
    customers.forEach(c => {
      const detail = [c.company, c.phone].filter(Boolean).join(" · ");
      msg += `• ${c.name}${detail ? ` — ${detail}` : ""}\n`;
    });
    return msg.trim();
  }
  if (isPtPt(locale)) {
    if (!customers.length) return `❓ Não encontrei nenhum cliente com "${keyword}". Escreve *meus clientes* para ver a lista.`;
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

export function replyCustomerUpdated(c: Customer, locale?: string): string {
  if (isEs(locale)) return `✏️ Actualizado.\n\n*${c.name}*`;
  return `✏️ Atualizado.\n\n*${c.name}*`;
}

export function replyCustomerDeactivated(c: Customer, locale?: string): string {
  if (isEs(locale)) return `🗑️ *${c.name}* fue eliminado(a) de los clientes activos.`;
  if (isPtPt(locale)) return `🗑️ *${c.name}* foi removido(a) dos clientes ativos.`;
  return `🗑️ *${c.name}* foi removido(a) dos clientes ativos.`;
}
