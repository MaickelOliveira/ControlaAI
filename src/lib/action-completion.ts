import type { AIResult, Intent } from "./ai-processor";

type Locale = string | undefined;

const SLOT_FILL_INTENTS = new Set<Intent>([
  "reminder_set",
  "recurring_create",
  "goal_create",
  "agenda_create",
  "vehicle_create",
  "employee_create",
  "customer_create",
  "grocery_purchase",
  "grocery_purchase_finish",
]);

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function say(locale: Locale, pt: string, es: string, ptPt = pt): string {
  return locale === "es" ? es : locale === "pt-PT" ? ptPt : pt;
}

function hasTaskChange(ai: AIResult): boolean {
  const task = ai.task;
  return !!(task?.newStatus || task?.newTitle || task?.newDueDate || task?.newPriority || task?.clearDueDate);
}

function hasReminderChange(ai: AIResult): boolean {
  return !!(ai.reminder?.message || ai.reminder?.scheduledAt || ai.reminder?.repeat);
}

function hasAgendaChange(ai: AIResult): boolean {
  const agenda = ai.agendaData;
  return !!(agenda?.title || agenda?.description || agenda?.location || agenda?.startDate || agenda?.startTime || agenda?.endDate || agenda?.endTime || agenda?.reminderMinutesBefore !== undefined);
}

function hasEmployeeChange(ai: AIResult): boolean {
  const employee = ai.employee;
  return !!(employee?.newName || employee?.role || employee?.salary || employee?.startDate || employee?.phone || employee?.email || employee?.notes);
}

function hasCustomerChange(ai: AIResult): boolean {
  const customer = ai.customer;
  return !!(customer?.phone || customer?.email || customer?.company || customer?.address || customer?.notes);
}

function hasRecurringChange(ai: AIResult): boolean {
  const recurring = ai.recurring;
  return !!(recurring?.amount || recurring?.category || recurring?.dayOfMonth || recurring?.repeatUnit || recurring?.totalInstallments || recurring?.startDate);
}

/**
 * Validação central das ações que ainda não usam o motor detalhado de slots.
 * Retorna só a pergunta do próximo dado indispensável. `null` significa que
 * o handler já tem o necessário (ou que o fluxo especializado cuidará disso).
 */
export function getMissingActionQuestion(ai: AIResult, locale?: string, sourceText = ""): string | null {
  if (SLOT_FILL_INTENTS.has(ai.intent)) return null;

  switch (ai.intent) {
    case "finance_register": {
      const items = ai.finances?.length ? ai.finances : ai.finance ? [ai.finance] : [];
      if (!items.length) return say(locale,
        "💰 O que deseja registrar? Diga se é despesa ou receita, o valor e a descrição.",
        "💰 ¿Qué quieres registrar? Dime si es un gasto o un ingreso, el importe y la descripción.",
        "💰 O que deseja registar? Diga se é despesa ou receita, o valor e a descrição.");
      const missingType = items.findIndex(item => item?.type !== "income" && item?.type !== "expense");
      if (missingType >= 0) return say(locale,
        `💰 O lançamento${items.length > 1 ? ` ${missingType + 1}` : ""} é uma despesa ou uma receita?`,
        `💰 ¿El movimiento${items.length > 1 ? ` ${missingType + 1}` : ""} es un gasto o un ingreso?`);
      const missingAmount = items.findIndex(item => !(typeof item?.amount === "number" && item.amount > 0));
      if (missingAmount >= 0) return say(locale,
        `💰 Qual é o valor${items.length > 1 ? ` do lançamento ${missingAmount + 1}` : ""}?`,
        `💰 ¿Cuál es el importe${items.length > 1 ? ` del movimiento ${missingAmount + 1}` : ""}?`);
      const missingDescription = items.findIndex(item => !hasText(item?.description));
      if (missingDescription >= 0) return say(locale,
        `📝 Qual é a descrição${items.length > 1 ? ` do lançamento ${missingDescription + 1}` : ""}?`,
        `📝 ¿Cuál es la descripción${items.length > 1 ? ` del movimiento ${missingDescription + 1}` : ""}?`);
      return null;
    }

    case "task_create": {
      const tasks = ai.tasks?.length ? ai.tasks : ai.task ? [ai.task] : [];
      if (!tasks.length) return say(locale, "📌 Qual tarefa deseja criar?", "📌 ¿Qué tarea quieres crear?");
      const missing = tasks.findIndex(task => !hasText(task?.title));
      return missing < 0
        ? null
        : say(locale,
          `📌 Qual é a tarefa${tasks.length > 1 ? ` do item ${missing + 1}` : ""}?`,
          `📌 ¿Cuál es la tarea${tasks.length > 1 ? ` del elemento ${missing + 1}` : ""}?`);
    }
    case "task_update":
      if (!ai.task?.taskNumber && !hasText(ai.task?.title)) return say(locale, "📌 Qual tarefa deseja alterar ou concluir?", "📌 ¿Qué tarea quieres cambiar o completar?");
      if (!hasTaskChange(ai) && !/\b(conclu|concluir|complete|completar|finaliz|termin|feito|hecho)\w*/i.test(sourceText)) {
        return say(locale, "✏️ O que deseja alterar nessa tarefa?", "✏️ ¿Qué quieres cambiar en esa tarea?");
      }
      return null;
    case "task_delete":
      return ai.task?.taskNumber || hasText(ai.task?.title) ? null : say(locale, "🗑️ Qual tarefa deseja excluir?", "🗑️ ¿Qué tarea quieres eliminar?");

    case "reminder_update":
      if (!hasText(ai.keyword)) return say(locale, "🔔 Qual lembrete deseja alterar?", "🔔 ¿Qué recordatorio quieres cambiar?");
      return hasReminderChange(ai) ? null : say(locale, "✏️ O que deseja alterar nesse lembrete: mensagem, data, horário ou repetição?", "✏️ ¿Qué quieres cambiar en ese recordatorio: mensaje, fecha, hora o repetición?");
    case "reminder_delete":
      return hasText(ai.keyword) ? null : say(locale, "🗑️ Qual lembrete deseja excluir?", "🗑️ ¿Qué recordatorio quieres eliminar?");

    case "goal_add": {
      const amount = ai.goal?.targetAmount ?? (ai.goal as unknown as Record<string, number> | undefined)?.amount ?? ai.finance?.amount;
      return typeof amount === "number" && amount > 0 ? null : say(locale, "💰 Qual valor deseja adicionar à meta?", "💰 ¿Qué importe quieres añadir a la meta?");
    }
    case "goal_complete":
    case "goal_cancel":
      return hasText(ai.keyword) || hasText(ai.goal?.title) ? null : say(locale, "🎯 Qual meta?", "🎯 ¿Qué meta?");

    case "vehicle_expense": {
      const amount = ai.vehicle?.amount ?? ai.finance?.amount;
      return typeof amount === "number" && amount > 0 ? null : say(locale, "💰 Qual foi o valor do gasto com o veículo?", "💰 ¿Cuál fue el importe del gasto del vehículo?");
    }

    case "grocery_list_add":
      return ai.grocery?.template || ai.grocery?.items?.length ? null : say(locale, "🛒 Quais produtos deseja adicionar à lista?", "🛒 ¿Qué productos quieres añadir a la lista?");
    case "grocery_list_remove":
      return ai.grocery?.itemNames?.length ? null : say(locale, "🗑️ Qual produto deseja remover da lista?", "🗑️ ¿Qué producto quieres eliminar de la lista?");
    case "grocery_list_check":
      return ai.grocery?.itemNames?.length ? null : say(locale, "✅ Qual produto deseja marcar como comprado?", "✅ ¿Qué producto quieres marcar como comprado?");
    case "grocery_list_edit":
      if (!ai.grocery?.itemNames?.length) return say(locale, "✏️ Qual produto da lista deseja alterar?", "✏️ ¿Qué producto de la lista quieres cambiar?");
      return ai.grocery.newProductName || ai.grocery.newQuantity || ai.grocery.newCategory
        ? null
        : say(locale, "✏️ O que deseja alterar nesse produto: nome, quantidade ou categoria?", "✏️ ¿Qué quieres cambiar en ese producto: nombre, cantidad o categoría?");
    case "grocery_price_compare":
      return hasText(ai.grocery?.productName) ? null : say(locale, "💲 De qual produto deseja comparar o preço?", "💲 ¿De qué producto quieres comparar el precio?");

    case "employee_update":
      if (!hasText(ai.keyword) && !hasText(ai.employee?.name)) return say(locale, "👤 Qual funcionário deseja alterar?", "👤 ¿Qué empleado quieres cambiar?");
      return hasEmployeeChange(ai) ? null : say(locale, "✏️ O que deseja alterar nesse funcionário?", "✏️ ¿Qué quieres cambiar en ese empleado?");
    case "employee_deactivate":
      return hasText(ai.keyword) || hasText(ai.employee?.name) ? null : say(locale, "👤 Qual funcionário deseja desativar?", "👤 ¿Qué empleado quieres desactivar?");

    case "customer_query":
      return hasText(ai.keyword) || hasText(ai.customer?.name) ? null : say(locale, "🧾 De qual cliente deseja consultar os dados?", "🧾 ¿De qué cliente quieres consultar los datos?");
    case "customer_update":
      if (!hasText(ai.keyword) && !hasText(ai.customer?.name)) return say(locale, "🧾 Qual cliente deseja alterar?", "🧾 ¿Qué cliente quieres cambiar?");
      return hasCustomerChange(ai) ? null : say(locale, "✏️ O que deseja alterar nesse cliente?", "✏️ ¿Qué quieres cambiar en ese cliente?");
    case "customer_deactivate":
      return hasText(ai.keyword) || hasText(ai.customer?.name) ? null : say(locale, "🧾 Qual cliente deseja desativar?", "🧾 ¿Qué cliente quieres desactivar?");

    case "recurring_cancel":
      return hasText(ai.keyword) ? null : say(locale, "🔁 Qual recorrente ou parcela deseja cancelar?", "🔁 ¿Qué movimiento recurrente o cuota quieres cancelar?");
    case "recurring_edit":
      if (!hasText(ai.keyword) && !hasText(ai.recurring?.description)) return say(locale, "🔁 Qual recorrente ou parcela deseja alterar?", "🔁 ¿Qué movimiento recurrente o cuota quieres cambiar?");
      return hasRecurringChange(ai) ? null : say(locale, "✏️ O que deseja alterar nesse recorrente?", "✏️ ¿Qué quieres cambiar en ese movimiento recurrente?");

    case "finance_confirm_pending":
      return hasText(ai.keyword) ? null : say(locale, "⏳ Qual lançamento agendado deseja confirmar?", "⏳ ¿Qué movimiento programado quieres confirmar?");

    case "agenda_update":
      if (!hasText(ai.keyword)) return say(locale, "📅 Qual compromisso deseja alterar?", "📅 ¿Qué cita quieres cambiar?");
      return hasAgendaChange(ai) ? null : say(locale, "✏️ O que deseja alterar nesse compromisso?", "✏️ ¿Qué quieres cambiar en esa cita?");
    case "agenda_delete":
      return hasText(ai.keyword) ? null : say(locale, "🗑️ Qual compromisso deseja cancelar?", "🗑️ ¿Qué cita quieres cancelar?");
    case "agenda_done":
      return hasText(ai.keyword) ? null : say(locale, "✅ Qual compromisso deseja marcar como realizado?", "✅ ¿Qué cita quieres marcar como realizada?");

    case "meet_create":
      {
        const meets = ai.meetItems?.length ? ai.meetItems : ai.meetData ? [ai.meetData] : [];
        if (!meets.length) return say(locale, "📅 Qual reunião deseja criar e para quando?", "📅 ¿Qué reunión quieres crear y para cuándo?");
        const missingDate = meets.findIndex(meet => !hasText(meet.startDate));
        if (missingDate >= 0) return say(locale,
          `📅 Em qual dia será a reunião${meets.length > 1 ? ` ${missingDate + 1}` : ""}?`,
          `📅 ¿Qué día será la reunión${meets.length > 1 ? ` ${missingDate + 1}` : ""}?`);
        const missingTime = meets.findIndex(meet => !hasText(meet.startTime));
        return missingTime < 0 ? null : say(locale,
          `🕒 Em qual horário será a reunião${meets.length > 1 ? ` ${missingTime + 1}` : ""}?`,
          `🕒 ¿A qué hora será la reunión${meets.length > 1 ? ` ${missingTime + 1}` : ""}?`);
      }

    case "drive_rename":
      return hasText(ai.keyword) ? null : say(locale, "📄 Qual deve ser o novo nome do arquivo?", "📄 ¿Cuál debe ser el nuevo nombre del archivo?");
    case "category_create":
      return hasText(ai.categoryName) ? null : say(locale, "🏷️ Qual é o nome da nova categoria?", "🏷️ ¿Cuál es el nombre de la nueva categoría?");
    default:
      return null;
  }
}

const NESTED_KEYS = [
  "finance", "task", "reminder", "goal", "vehicle", "recurring", "agendaData",
  "meetData", "grocery", "account", "employee", "customer", "period",
] as const;

/** Junta os dados extraídos do pedido original aos dados da resposta curta. */
export function mergeActionContinuation(previous: AIResult, next: AIResult): AIResult {
  const merged = { ...previous, ...next, intent: previous.intent, confidence: Math.max(previous.confidence || 0, next.confidence || 0, 0.85) } as AIResult;
  for (const key of NESTED_KEYS) {
    const before = previous[key] as Record<string, unknown> | undefined;
    const after = next[key] as Record<string, unknown> | undefined;
    if (before || after) (merged as unknown as Record<string, unknown>)[key] = { ...(before || {}), ...(after || {}) };
  }
  const arrayKeys = ["finances", "tasks", "reminders", "goals", "vehicles", "vehicleExpenses", "recurrings", "agendaItems", "meetItems", "groceryPurchases", "employees", "customers", "categoryNames"] as const;
  for (const key of arrayKeys) {
    if (previous[key]?.length && !next[key]?.length) (merged as AIResult)[key] = previous[key] as never;
  }
  return merged;
}

export function buildActionContinuationMessage(originalText: string, answers: string[]): string {
  return [
    `Pedido original: ${originalText}`,
    ...answers.map((answer, index) => `Informação complementar ${index + 1}: ${answer}`),
    "Interprete tudo como um único pedido e mantenha a intenção do pedido original.",
  ].join("\n");
}

export function isActionContinuationCancel(text: string): boolean {
  return /^(?:cancelar|cancela|deixa(?: pra l[áa])?|esquece|desisto|cancelar acci[oó]n|olvida)\b/i.test(text.trim());
}

/** Só abandona por comandos novos muito claros; respostas como "comprar pão"
 * podem ser justamente o título/item que a pergunta anterior solicitou. */
export function isClearlyNewActionDuringContinuation(text: string): boolean {
  return /^(?:quanto|qual (?:[ée]|foi)|meu saldo|mi saldo|minhas tarefas|mis tareas|meus lembretes|mis recordatorios|resumo|resumen|extrato|ajuda|ayuda|help)\b/i.test(text.trim());
}
