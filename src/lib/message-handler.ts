import { updateUser, hasAccess, getUserByWppCode, getUserById, getMaxWppPhones, generateWppVerifyCode } from "@/lib/users";
import { getUserIdByPhone, linkPhone, setPhoneName, findPhoneByName, setPhoneRelation, findPhoneByRelation, setPhoneAccess, getPhoneAccess, countPhonesForUser, getPhonesForUser } from "@/lib/wpp-phone-links";
import { checkRateLimit } from "@/lib/rate-limit";
import { processMessage, generateAnalysisResponse, generateFallbackResponse, generateWebSearchResponse, getWebSearchMissingQuestion, identifyImageSubject, categorizeDriveFile, findDriveFileByAI, extractFinanceFromDocument, extractInvoiceTransactions, extractGroceryReceiptItems, getFinanceAccountDestinationHint, getExplicitLastFinanceEmployeeEditResult, type AIResult, type FinanceData } from "@/lib/ai-processor";
import { saveFile, getFiles, getFolders, getFolderByName, getFilePath, getFileById, updateFile, getRecentFile } from "@/lib/drive";
import { readFileSync, existsSync } from "fs";
import { addFinance, getBalance, formatCurrency, findFinanceByDescription, deleteFinance, updateFinance, getRecentTransactions, getFinancesInRange, isLikelyDuplicateExpense, getBalanceInRange, getCategoryTotal, getByCategoryInRange, getTransactionsInRange, getAccountTransactionsInRange, getKeywordTotal, expandMerchantAliases, getPendingFinances, CATEGORIES_EXPENSE, CATEGORIES_INCOME, countFinances, deleteAllFinances, parseFinanceDestinationMode, type FinanceMode } from "@/lib/finances";
import { createAccount, deleteAccount, findAccountByName, getManualAccountsByUser, resolveAccountForFinance, setDefaultAccount, updateAccount, type Account } from "@/lib/accounts";
import { createTask, createTasks, getPendingTasks, updateTask, findTaskByNumber, findTaskByTitle, deleteTask } from "@/lib/tasks";
import { getRemindersByUser, findReminderByKeyword, updateReminder, deleteReminder, type Reminder } from "@/lib/reminders";
import { getActiveGoals, updateGoalAmount, updateGoalStatus, findGoalsByTitle, getGoalProgress } from "@/lib/goals";
import { getVehiclesByUser, addVehicleExpense, findVehicleByName, findVehiclesByName, updateVehicle, deleteVehicle, getVehicleTotalExpenses, setExpenseFinanceId, VEHICLE_FINANCE_CATEGORY, FUEL_TYPE_LABEL, type Vehicle, type VehicleUpdateInput } from "@/lib/vehicles";
import {
  addFromTemplate, addToShoppingList, getShoppingList, toggleShoppingItem, getSpendByStore,
  findOrCreateStore, addPurchase, setPurchaseFinanceId, getPriceComparison, getStorePriceRanking,
  getSuggestedListItems, categoryForTemplateKey, getPurchasesInRange, findLatestPurchaseByStoreName, clearShoppingList,
  removeShoppingItem, updateShoppingItem,
  type GroceryPurchaseItem, type GroceryCategory,
} from "@/lib/grocery";
import { createEmployee, getEmployeesByUser, getTotalPayroll, findEmployeeByName, findEmployeesByName, updateEmployee, type Employee } from "@/lib/employees";
import { getCustomersByUser, findCustomerByName, findCustomersByName, updateCustomer, type Customer } from "@/lib/customers";
import { setPendingAction, getPendingAction, clearPendingAction, parseVehicleChoice, parseVehiclePatchFromText, parseGoalChoice, parseAppointmentChoice, parseFinanceChoiceMulti, parseFinancePatchFromText, parseYesNo, parseAccountChoice, parseAccountCreateRequest, parseAccountDefaultChoice, parseFinanceEmployeeChoice, parseAmountBR, choiceIndexByLabels } from "@/lib/pending-actions";
import { beginBatchSlotFill, beginSlotFill, hasMissingSlotFields, runSlotFillTurn } from "@/lib/slot-filling";
import {
  buildActionContinuationMessage,
  getMissingActionQuestion,
  isActionContinuationCancel,
  isClearlyNewActionDuringContinuation,
  mergeActionContinuation,
} from "@/lib/action-completion";
import { getRecurringByUser, confirmRecurring, cancelRecurring, updateRecurring, findRecurringByDescription } from "@/lib/recurring";
import { buildBalanceForecast, collectUpcomingFinanceItems, replyUpcomingFinances } from "@/lib/upcoming-finances";
import { replyFinanceDetail } from "@/lib/finance-detail";
import { replyAdvisorSummary } from "@/lib/advisor-summary";
import { createAppointment, getUpcomingAppointments, getAppointmentsInRange, updateAppointment, deleteAppointment, findAppointmentsByKeyword, getAppointmentById, type Appointment } from "@/lib/agenda";
import { formatReminderOffset, isAgendaReminderTarget, isStandaloneAppointmentReminderRequest, parseAppointmentReminderRequest } from "@/lib/appointment-reminders";
import { createMeetEvent } from "@/lib/google-meet";
import { addMeetToGoogleCalendarEvent } from "@/lib/google-calendar";
import { isConnected } from "@/lib/google-oauth";
import { sendText as sendWhatsAppText, sendFile as wppSendFile } from "@/lib/whatsapp";
import { getConfig } from "@/lib/whatsapp-config";
import { addMessage, getAiPaused, getHistory, setLastFinanceBatch, getLastFinanceBatch, phoneVariants } from "@/lib/conversations";
import { nowBR, spToUTC, todayStrBR, weekBoundsBR, formatDateTimeBR } from "@/lib/date-br";
import { localeForWhatsAppPhone } from "@/lib/phone";
import {
  replyFinanceRegistered, replyBalance, replyTaskCreated, replyTasksCreated, replyTaskList,
  replyTaskUpdated, replyReminderSet, replyReminderList, replyReminderUpdated, replyReminderDeleted, replyModeSwitch, replyHelp,
  replyTrialExpired, replyAccountInactive, replyUnknown, replyLowConfidence,
  replyRecurringConfirmed, replyRecurringList,
  replyFileSaved, replyFileFound, replyFileNotFound, replyDriveFileList,
  replyAgendaList, replyAgendaUpdated, replyAgendaDeleted, replyAgendaReminderPolicy,
  replyMeetCreated, replyMeetInvite,
  replyPersonNotFound, replyWppNameSaved,
  replyGroceryListAdded, replyGroceryList, replyGroceryItemChecked, replyGrocerySpend,
  replyEmployeeList, replyEmployeeUpdated, replyEmployeeDeactivated,
  replyCustomerList, replyCustomerInfo, replyCustomerUpdated, replyCustomerDeactivated,
  replyFirstUseTips,
} from "@/lib/bot-replies";

export function phoneMatches(stored: string, incoming: string): boolean {
  const storedVariants = phoneVariants(stored);
  const incomingVariants = new Set(phoneVariants(incoming));
  return storedVariants.some(value => incomingVariants.has(value));
}

export function parseLinkedPhoneAccess(value: string): "personal" | "business" | "both" | null {
  const normalized = value.trim().toLowerCase();
  if (/^1\b|pessoal|personal/.test(normalized)) return "personal";
  if (/^2\b|empresa|empresarial|negocio/.test(normalized)) return "business";
  if (/^3\b|ambos|os dois|los dos|todo|todos/.test(normalized)) return "both";
  return null;
}

export function replyPhoneNotLinked(phone: string): string {
  const locale = localeForWhatsAppPhone(phone);
  if (locale === "es") {
    return "¡Hola! Soy Zelo, pero todavía no encontré tu número.\n\nSi ya tienes una cuenta, abre *Configuración → Vincular WhatsApp* y genera un nuevo código.\n\n⏱️ Después de confirmar el código, responde cada etapa en un máximo de *5 minutos*.\n\nzelogestaointeligente.com.br/es";
  }
  if (locale === "pt-PT") {
    return "Olá! Sou o Zelo, mas ainda não encontrei o seu número.\n\nSe já tem uma conta, aceda a *Configurações → Associar WhatsApp* e gere um novo código.\n\n⏱️ Depois de confirmar o código, responda a cada etapa num máximo de *5 minutos*.\n\nzelogestaointeligente.com.br/pt";
  }
  return "Olá! Sou o Zelo, mas ainda não encontrei seu número.\n\nSe você já tem uma conta, acesse *Configurações → Vincular WhatsApp* e gere um novo código.\n\n⏱️ Depois de confirmar o código, responda cada etapa em até *5 minutos*.\n\nzelogestaointeligente.com.br";
}

export function replyWppLinkStep(
  step: "name" | "relation" | "access",
  locale?: string,
  name?: string,
): string {
  const expiry = locale === "es"
    ? "\n\n⏱️ Responde esta etapa en un máximo de *5 minutos* para no perder la vinculación."
    : "\n\n⏱️ Responda esta etapa em até *5 minutos* para não perder a vinculação.";
  if (step === "name") {
    return (locale === "es"
      ? "✅ ¡Código confirmado!\n\nAntes de vincular el número, necesito saber quién lo va a usar.\n\n¿Cómo puedo llamarte?"
      : "✅ Código confirmado!\n\nAntes de vincular, preciso saber quem vai usar esse número.\n\nComo posso te chamar?") + expiry;
  }
  if (step === "relation") {
    return (locale === "es"
      ? `¡Mucho gusto, ${name}! 👋\n\n¿Cuál es tu relación con la cuenta? _(ej.: esposa, esposo, hijo, socio, tía...)_`
      : `Prazer, ${name}! 👋\n\nQual seu vínculo com a conta? _(ex: esposa, marido, filho, sócio, tia...)_`) + expiry;
  }
  return (locale === "es"
    ? "De acuerdo. ¿A qué modo puedes acceder?\n\n1️⃣ Solo personal\n2️⃣ Solo empresarial\n3️⃣ Los dos\n\nResponde con el número o la palabra."
    : "Certo. E qual modo você pode acessar?\n\n1️⃣ Só pessoal\n2️⃣ Só empresarial\n3️⃣ Os dois\n\nResponda o número ou a palavra.") + expiry;
}

async function getUserByWppPhone(phone: string) {
  const userId = await getUserIdByPhone(phone);
  return userId ? getUserById(userId) : null;
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Keycap emoji só existe para um algarismo. Em 10️⃣ o WhatsApp renderiza
 * "1" + o ícone "0", então listas longas usam numeração textual a partir
 * de 10 para permanecerem legíveis. */
export function listNumberLabel(zeroBasedIndex: number): string {
  const number = zeroBasedIndex + 1;
  return number <= 9 ? `${number}️⃣` : `${number}.`;
}

/** No fluxo conversacional, falha de envio não pode parecer sucesso. A
 * facade retorna false quando o provedor rejeita a mensagem; transformar
 * isso em erro aciona o fallback do handler e deixa um log rastreável. */
async function wppSend(to: string, message: string): Promise<void> {
  const sent = await sendWhatsAppText(to, message);
  if (!sent) throw new Error(`[message-handler] WhatsApp recusou resposta para ${to.slice(-4)}`);
}

/** Divide respostas longas antes de enviá-las ao WhatsApp. Além de históricos,
 * o manual de ajuda completo também ultrapassa o limite aceito pelo provedor.
 * A quebra privilegia linhas completas e ainda protege contra uma linha única
 * excepcionalmente longa. */
export function splitWhatsAppMessage(message: string, maxLength = 3500): string[] {
  if (message.length <= maxLength) return [message];

  const chunks: string[] = [];
  let chunk = "";
  for (const line of message.split("\n")) {
    if (line.length > maxLength) {
      if (chunk) {
        chunks.push(chunk);
        chunk = "";
      }
      for (let offset = 0; offset < line.length; offset += maxLength) {
        chunks.push(line.slice(offset, offset + maxLength));
      }
      continue;
    }

    const candidate = chunk ? `${chunk}\n${line}` : line;
    if (candidate.length <= maxLength) {
      chunk = candidate;
      continue;
    }
    if (chunk) chunks.push(chunk);
    chunk = line;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

/** Manual inicial propositalmente dividido e numerado. Assim o WhatsApp não
 * corta conteúdo e a pessoa sabe a ordem mesmo se as mensagens chegarem com
 * pequeno intervalo entre elas. */
export function buildFirstUseGuideMessages(locale?: string): string[] {
  const chunks = splitWhatsAppMessage(`${replyHelp(locale)}\n\n${replyFirstUseTips(locale)}`, 2600);
  return chunks.map((chunk, index) => {
    const title = locale === "es" ? "GUÍA DE USO" : "GUIA DE USO";
    return `📘 *${title} — ${index + 1}/${chunks.length}*\n\n${chunk}`;
  });
}

/** Mantém respostas dentro do limite prático do WhatsApp sem omitir dados. */
async function wppSendLong(to: string, message: string, maxLength = 3500): Promise<void> {
  for (const chunk of splitWhatsAppMessage(message, maxLength)) await wppSend(to, chunk);
}

export type ImageAction = "save" | "search" | "describe";

export function parseImageAction(text: string): ImageAction | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (/\b(?:salva(?:r|la|lo)?|guarda(?:r|la|lo)?|archiva(?:r|la|lo)?|arquiva(?:r)?|almacena(?:r|la|lo)?|drive)\b/.test(normalized)) return "save";
  if (/\b(?:pesquisa|pesquisar|pesquise|procura|procurar|busca|buscar|preco|precio|valor|custa|cuesta|cotacao|cotizacion|investiga|investigar)\b|\bquanto\s+(?:esta|e|sai|custa)\b|\bcuanto\s+(?:esta|vale|sale|cuesta)\b/.test(normalized)) return "search";
  if (/\b(?:descreve|descreva|descrever|identifica|identifique|identificar|analisa|analise|analisar|o que e|que e isso|describe|identifica|analiza|analice|que es)\b/.test(normalized)) return "describe";
  return null;
}

function isImageSearchRequest(text?: string): boolean {
  return !!text && parseImageAction(text) === "search";
}

async function researchImage(from: string, buffer: Buffer, mimeType: string, request: string, locale?: string): Promise<void> {
  const subject = await identifyImageSubject(buffer, mimeType, locale);
  if (!subject) {
    await wppSend(from, localized(locale,
      "❓ Não consegui identificar o produto com segurança nessa imagem. Envie uma foto mais nítida, mostrando o nome, a marca e a embalagem.",
      "❓ No pude identificar el producto con seguridad en esta imagen. Envía una foto más nítida que muestre el nombre, la marca y el envase."));
    return;
  }
  const query = localized(locale,
    `${request}. Produto identificado na imagem: ${subject}. Pesquise preços atuais no Brasil e envie lojas, valores e links para conferir.`,
    `${request}. Producto identificado en la imagen: ${subject}. Busca precios actuales en el país del usuario y envía tiendas, importes y enlaces para comprobar.`);
  await wppSendLong(from, await generateWebSearchResponse(query, locale));
}

export function replyProcessingError(locale?: string): string {
  if (locale === "es") {
    return "Tuve un problema al procesar esto. ¿Puedes enviarlo de nuevo? Si vuelve a ocurrir, avísame y confirmaré si quedó registrado correctamente.";
  }
  if (locale === "pt-PT") {
    return "Tive um problema ao processar isto. Podes enviar novamente? Se voltar a acontecer, avisa-me e confirmarei se ficou registado corretamente.";
  }
  return "Tive um problema aqui ao processar isso. Pode mandar de novo? Se continuar acontecendo, me avise e eu confirmo se ficou registrado corretamente.";
}

/** Evita que mensagens excepcionais escritas no handler vazem em outro idioma. */
function localized(locale: string | undefined, ptBR: string, es: string, ptPT = ptBR): string {
  if (locale === "es") return es;
  if (locale === "pt-PT") return ptPT;
  return ptBR;
}

/** Pergunta qual compromisso o usuário quis dizer quando a busca por
 *  palavra-chave bate em mais de um (ex: duas "reunião" na mesma semana) —
 *  mesmo padrão usado para lançamentos financeiros e metas ambíguas: nunca
 *  agir na primeira opção que aparecer, sempre listar e deixar o usuário
 *  escolher por número ou nome. */
async function askWhichAppointment(
  from: string, userId: string,
  matches: Appointment[], action: "update" | "delete" | "done" | "add_meet" | "set_reminder",
  actionLabel: string, patch?: Record<string, unknown>,
  options?: { reminderOffsetMinutes?: number; mode?: "personal" | "business"; locale?: string },
): Promise<void> {
  const list = matches.map(a => ({ id: a.id, title: a.title, startAt: a.startAt, location: a.location }));
  await setPendingAction(from, { type: "appointment_selection", userId, action, patch, appointments: list, ...options });
  // O rótulo do lembrete é derivado da própria ação pendente. Assim, mesmo
  // que um classificador tenha chamado este fluxo como edição, nunca exibimos
  // "reagendar/alterar" quando o que será feito é configurar um aviso.
  const resolvedActionLabel = action === "set_reminder" && options?.reminderOffsetMinutes
    ? options.locale === "es"
      ? `configurar el aviso ${formatReminderOffset(options.reminderOffsetMinutes, "es")} antes`
      : `configurar o aviso de ${formatReminderOffset(options.reminderOffsetMinutes)} antes`
    : actionLabel;
  let msg = options?.locale === "es"
    ? `🗓️ Encontré ${matches.length} citas. ¿Cuál quieres ${resolvedActionLabel}?\n\n`
    : `🗓️ Encontrei ${matches.length} compromissos. Qual deseja ${resolvedActionLabel}?\n\n`;
  matches.forEach((a, i) => { msg += `*${i + 1}.* ${a.title} — ${formatDateTimeBR(a.startAt)}\n`; });
  msg += options?.locale === "es"
    ? `\nResponde con el número o el nombre. ⏱ _Válido durante 5 minutos._`
    : `\nResponda com o número ou nome. ⏱ _Válido por 5 min._`;
  await wppSend(from, msg);
}

function vehiclePatchFromAi(ai: AIResult): VehicleUpdateInput {
  const v = ai.vehicle;
  const patch: VehicleUpdateInput = {};
  if (v?.plate !== undefined) patch.plate = v.plate.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (v?.brand) patch.brand = cap(v.brand.trim());
  if (v?.model) patch.model = cap(v.model.trim());
  if (v?.year && v.year >= 1886 && v.year <= new Date().getFullYear() + 1) patch.year = v.year;
  if (v?.fuelType) patch.fuelType = v.fuelType;
  if (v?.currentKm !== undefined && v.currentKm >= 0) patch.currentKm = v.currentKm;
  if (v?.notes !== undefined) patch.notes = v.notes;
  if (v?.newMode) patch.mode = v.newMode;
  return patch;
}

function pendingVehicleRows(vehicles: Vehicle[]) {
  return vehicles.map(v => ({ id: v.id, brand: v.brand, model: v.model, year: v.year, plate: v.plate }));
}

function vehicleIdentity(vehicle: { brand: string; model: string; year: number; plate?: string }): string {
  return `${vehicle.brand} ${vehicle.model} (${vehicle.year})${vehicle.plate ? ` — ${vehicle.plate}` : ""}`;
}

async function askWhichVehicle(
  from: string, userId: string, vehicles: Vehicle[], action: "update" | "delete",
  mode: "personal" | "business", patch?: VehicleUpdateInput, locale?: string,
): Promise<void> {
  await setPendingAction(from, {
    type: "vehicle_selection", userId, mode, action, patch, vehicles: pendingVehicleRows(vehicles),
  });
  let msg = locale === "es"
    ? `🚗 Encontré ${vehicles.length} vehículos. ¿Cuál quieres ${action === "delete" ? "eliminar" : "cambiar"}?\n\n`
    : `🚗 Encontrei ${vehicles.length} veículos. Qual deseja ${action === "delete" ? "excluir" : "alterar"}?\n\n`;
  vehicles.forEach((v, i) => { msg += `*${i + 1}.* ${vehicleIdentity(v)}\n`; });
  msg += locale === "es"
    ? `\nResponde con el número, modelo, marca o matrícula. ⏱ _Válido durante 5 minutos._`
    : `\nResponda com o número, modelo, marca ou placa. ⏱ _Válido por 5 min._`;
  await wppSend(from, msg);
}

async function askVehiclePatch(from: string, userId: string, vehicle: Vehicle, mode: "personal" | "business", locale?: string): Promise<void> {
  await setPendingAction(from, {
    type: "vehicle_selection", userId, mode, action: "update", awaitingPatch: true,
    vehicles: pendingVehicleRows([vehicle]),
  });
  await wppSend(from, locale === "es"
    ? `✏️ ¿Qué quieres cambiar en *${vehicle.brand} ${vehicle.model}*?\n\nEjemplos:\n• _matrícula a ABC1D23_\n• _kilometraje a 45.000_\n• _año a 2022_\n• _combustible a flex_`
    : `✏️ O que deseja alterar no *${vehicle.brand} ${vehicle.model}*?\n\nExemplos:\n• _placa para ABC1D23_\n• _km para 45.000_\n• _ano para 2022_\n• _combustível para flex_`);
}

async function sendVehicleUpdated(from: string, vehicle: Vehicle, locale?: string): Promise<void> {
  const fuelEs: Record<string, string> = { gasoline: "Gasolina", ethanol: "Etanol", diesel: "Diésel", electric: "Eléctrico", flex: "Flex" };
  await wppSend(from, locale === "es"
    ? `✅ *¡Vehículo actualizado!*\n\n🚗 ${vehicleIdentity(vehicle)}\n⛽ ${fuelEs[vehicle.fuelType] || vehicle.fuelType}\n🛣️ ${vehicle.currentKm.toLocaleString("es-419")} km\n${vehicle.mode === "business" ? "🏢 Empresa" : "👤 Personal"}`
    : `✅ *Veículo atualizado!*\n\n🚗 ${vehicleIdentity(vehicle)}\n⛽ ${FUEL_TYPE_LABEL[vehicle.fuelType]}\n🛣️ ${vehicle.currentKm.toLocaleString("pt-BR")} km\n${vehicle.mode === "business" ? "🏢 Empresa" : "👤 Pessoal"}`);
}

function localDatePart(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

function localTimePart(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function appointmentPatchFromAi(ai: AIResult, current?: Appointment): Parameters<typeof updateAppointment>[2] {
  const data = ai.agendaData ?? {};
  const patch: Parameters<typeof updateAppointment>[2] = {};
  if (data.startDate || data.startTime) {
    const date = data.startDate || (current ? localDatePart(current.startAt) : undefined);
    const time = data.startTime || (current ? localTimePart(current.startAt) : "00:00");
    if (date) patch.startAt = spToUTC(`${date}T${time}:00`);
  }
  if (data.endDate || data.endTime) {
    const baseEnd = current?.endAt || current?.startAt;
    const date = data.endDate || (baseEnd ? localDatePart(baseEnd) : undefined);
    const time = data.endTime || (baseEnd ? localTimePart(baseEnd) : "00:00");
    if (date) patch.endAt = spToUTC(`${date}T${time}:00`);
  }
  if (data.title) patch.title = cap(data.title);
  if (data.location) patch.location = data.location;
  if (data.description) patch.description = data.description;
  return patch;
}

/** Cria o link do Google Meet pra um compromisso já existente — extraído
 *  pra ser reaproveitado tanto no caminho direto (1 compromisso encontrado)
 *  quanto na resolução da desambiguação (usuário escolheu entre vários). */
async function performAddMeet(appt: Appointment, userId: string, from: string, locale?: string): Promise<void> {
  if (appt.meetLink) {
    await wppSend(from, localized(locale,
      `ℹ️ *${appt.title}* já tem um link do Meet:\n🔗 ${appt.meetLink}`,
      `ℹ️ *${appt.title}* ya tiene un enlace de Meet:\n🔗 ${appt.meetLink}`));
    return;
  }
  if (!appt.endAt) {
    await wppSend(from, localized(locale,
      `⚠️ O compromisso *${appt.title}* não tem horário de fim definido. Edite-o pela agenda para adicionar a hora de término e tente novamente.`,
      `⚠️ La cita *${appt.title}* no tiene una hora de finalización. Edítala en la agenda, añade la hora de finalización e inténtalo de nuevo.`));
    return;
  }
  if (!await isConnected(userId)) {
    await wppSend(from, localized(locale,
      "🔗 Sua conta Google não está conectada.\n\nAcesse *Configurações → Integrações* para conectar e criar links do Meet.",
      "🔗 Tu cuenta de Google no está conectada.\n\nEntra en *Configuración → Integraciones* para conectarla y crear enlaces de Meet."));
    return;
  }
  await wppSend(from, localized(locale,
    `⏳ Criando link do Google Meet para *${appt.title}*...`,
    `⏳ Creando el enlace de Google Meet para *${appt.title}*...`));
  try {
    const result = appt.calendarEventId
      ? {
          meetLink: await addMeetToGoogleCalendarEvent({
            userId,
            calendarEventId: appt.calendarEventId,
            googleCalendarId: appt.googleCalendarId,
          }),
          calendarEventId: appt.calendarEventId,
          googleCalendarId: appt.googleCalendarId,
        }
      : await createMeetEvent({
          userId, title: appt.title, description: appt.description,
          startAt: appt.startAt, endAt: appt.endAt, attendees: [],
        });
    await updateAppointment(appt.id, userId, {
      meetLink: result.meetLink,
      calendarEventId: result.calendarEventId,
      googleCalendarId: result.googleCalendarId,
    });
    await wppSend(from, localized(locale,
      `✅ *Meet adicionado!*\n\n📅 *${appt.title}*\n🕒 ${formatDateTimeBR(appt.startAt)}\n🔗 ${result.meetLink}`,
      `✅ *¡Meet añadido!*\n\n📅 *${appt.title}*\n🕒 ${formatDateTimeBR(appt.startAt)}\n🔗 ${result.meetLink}`));
  } catch (e) {
    console.error("[agenda_add_meet]", e);
    await wppSend(from, localized(locale,
      "❌ Não consegui criar o Google Meet. Verifique se sua conta Google ainda está conectada em Configurações.",
      "❌ No pude crear el Google Meet. Comprueba en Configuración que tu cuenta de Google siga conectada."));
  }
}

// Label do modo (pessoal/empresa) pra deixar claro em listas e confirmações
// de qual lançamento se trata, já que descrição/categoria podem repetir entre modos.
function modeLabelFull(m: string): string {
  return m === "business" ? "🏢 Empresa" : "👤 Pessoal";
}

function replyModeAccessDenied(access: FinanceMode, locale?: string): string {
  const allowed = access === "business"
    ? (locale === "es" ? "empresarial" : "empresarial")
    : (locale === "es" ? "personal" : "pessoal");
  if (locale === "es") return `Este número solo tiene acceso al modo *${allowed}*. Pide al titular que cambie el permiso en Configuración para consultar el otro modo.`;
  if (locale === "pt-PT") return `Este número só tem acesso ao modo *${allowed}*. Pede ao titular para alterar a permissão nas Configurações para consultar o outro modo.`;
  return `Este número só tem acesso ao modo *${allowed}*. Peça ao titular para alterar a permissão nas Configurações para consultar o outro modo.`;
}

// Intervalo YYYY-MM-DD do mês informado — usado como período padrão quando a
// IA não identifica um período relativo ("mês passado" etc.) na pergunta.
function monthBounds(year: number, month: number): [string, string] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${pad(month)}-${pad(lastDay)}`;
  return [from, to];
}

// Rótulo textual do período pra usar nas respostas ("julho de 2026" pro mês
// atual, ou "01/07/2026 a 15/07/2026" pra um intervalo customizado pedido pela IA).
function periodLabelFor(period: { from?: string; to?: string } | undefined, fallbackDate: Date, locale?: string): string {
  const dateLocale = locale === "es" ? "es-419" : locale === "pt-PT" ? "pt-PT" : "pt-BR";
  if (!period?.from && !period?.to) {
    return fallbackDate.toLocaleDateString(dateLocale, { month: "long", year: "numeric" });
  }
  const fmt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString(dateLocale);
  if (period.from && period.to) return locale === "es" ? `${fmt(period.from)} al ${fmt(period.to)}` : `${fmt(period.from)} a ${fmt(period.to)}`;
  if (period.from) return locale === "es" ? `a partir del ${fmt(period.from)}` : `a partir de ${fmt(period.from)}`;
  return locale === "es" ? `hasta el ${fmt(period.to!)}` : `até ${fmt(period.to!)}`;
}

/** Resolve accountId para os fluxos legados de importação. Os registros de
 * texto fazem a seleção explícita antes de chegar aqui. */
async function resolveAccountFields(
  userId: string, mode: "personal" | "business", accountHint: string | undefined,
): Promise<{ accountId?: string; cardInvoiceId?: string }> {
  const resolved = await resolveAccountForFinance(userId, mode, accountHint);
  if (resolved.ambiguous) return {};
  return { accountId: resolved.accountId, cardInvoiceId: resolved.cardInvoiceId };
}

export function accountSelectionMessage(accounts: Account[], locale?: string): string {
  const heading = locale === "es" ? "🏦 ¿Qué cuenta quieres usar?" : "🏦 Qual conta deseja usar?";
  const instruction = locale === "es" ? "Responde con el número o el nombre." : "Responda com o número ou nome.";
  const createHint = locale === "es"
    ? "➕ Para registrar una nueva, responde *registrar cuenta*. Si ya sabes el nombre, puedes escribir, por ejemplo: *registrar cuenta Itaú*."
    : "➕ Para cadastrar uma nova, responda *cadastrar conta*. Se já souber o nome, pode escrever, por exemplo: *cadastrar conta Itaú*.";
  return `${heading}\n\n${accounts.map((account, index) => `${listNumberLabel(index)} ${account.name}${account.isDefault ? " ⭐" : ""}`).join("\n")}\n\n${instruction}\n${createHint}\n⏱ _${locale === "es" ? "Válido durante 5 minutos" : "Válido por 5 min"}._`;
}

function accountNameQuestion(locale?: string): string {
  return locale === "es"
    ? "🏦 ¿Qué nombre quieres darle a la nueva cuenta?\n\n_Ejemplo: Itaú. Después de registrarla, continuaré la acción automáticamente._"
    : "🏦 Qual nome deseja dar para a nova conta?\n\n_Exemplo: Itaú. Depois de cadastrar, vou continuar a ação automaticamente._";
}

function cleanPendingAccountName(text: string): string {
  const requestedName = parseAccountCreateRequest(text);
  const candidate = requestedName === null ? text : requestedName;
  return candidate
    .replace(/^(?:conta|cuenta)\s+/i, "")
    .replace(/^["“”']+|["“”'.!?;,]+$/g, "")
    .trim();
}

async function createOrReuseAccountForAction(
  userId: string,
  mode: FinanceMode,
  rawName: string,
): Promise<{ account: Account; created: boolean }> {
  const name = cap(rawName);
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const matches = await findAccountByName(userId, mode, name, "bank");
  const existing = matches.find(account => account.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase() === normalized);
  if (existing) return { account: existing, created: false };
  return { account: await createAccount({ userId, mode, name, type: "bank" }), created: true };
}

function accountDefaultConfirmationMessage(currentName: string, newName: string, locale?: string): string {
  if (locale === "es") {
    return `⭐ La cuenta predeterminada actual es *${currentName}*. ¿Quieres mantenerla o cambiarla por *${newName}*?\n\n1️⃣ Mantener *${currentName}*\n2️⃣ Usar *${newName}* como predeterminada\n\nResponde *1* o *2*.\n⏱ _Válido durante 5 minutos._`;
  }
  return `⭐ A conta padrão atual é *${currentName}*. Deseja mantê-la ou trocar para *${newName}*?\n\n1️⃣ Manter *${currentName}*\n2️⃣ Tornar *${newName}* a conta padrão\n\nResponda *1* ou *2*.\n⏱ _Válido por 5 min._`;
}

function applyAccountToAi(ai: AIResult, accountName: string, selectionMode: FinanceMode): AIResult {
  const finances = ai.finances?.map(item => (item.mode ?? selectionMode) === selectionMode ? { ...item, accountHint: accountName } : item);
  const finance = ai.finance && (ai.finance.mode ?? selectionMode) === selectionMode
    ? { ...ai.finance, accountHint: accountName }
    : ai.finance;
  return {
    ...ai,
    ...(finances ? { finances } : {}),
    ...(finance ? { finance } : {}),
    account: { ...(ai.account ?? {}), name: accountName, useContext: false, mode: selectionMode },
  };
}

function isEmployeeFinanceData(finance: FinanceData): boolean {
  const category = finance.category?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  return finance.type === "expense" && (category === "funcionarios" || category === "empleados");
}

function applyEmployeeToAi(ai: AIResult, employeeId: string | null, employeeName?: string): AIResult {
  const patch = (finance: FinanceData): FinanceData => isEmployeeFinanceData(finance)
    ? { ...finance, employeeId, ...(employeeName ? { employeeName } : {}) }
    : finance;
  return {
    ...ai,
    ...(ai.finance ? { finance: patch(ai.finance) } : {}),
    ...(ai.finances ? { finances: ai.finances.map(patch) } : {}),
  };
}

function financeEmployeeSelectionMessage(employees: Array<{ name: string; role: string }>, locale?: string): string {
  const title = locale === "es" ? "👥 ¿A qué empleado corresponde este pago?" : "👥 Para qual funcionário é esse pagamento?";
  const none = locale === "es" ? "Sin seleccionar empleado" : "Sem selecionar funcionário";
  const instruction = locale === "es" ? "Responde con el número o el nombre." : "Responda com o número ou nome.";
  const options = [
    ...employees.map((employee, index) => `${listNumberLabel(index)} ${employee.name} — ${employee.role}`),
    `${listNumberLabel(employees.length)} ${none}`,
  ].join("\n");
  return `${title}\n\n${options}\n\n${instruction}\n⏱ _${locale === "es" ? "Válido durante 5 minutos" : "Válido por 5 min"}._`;
}

function employeeLinkLabel(employeeName: string | undefined, cleared: boolean, locale?: string): string {
  if (cleared) return locale === "es" ? "\n👥 Empleado: *sin seleccionar*" : "\n👥 Funcionário: *sem selecionar*";
  return employeeName ? `\n👥 ${locale === "es" ? "Empleado" : "Funcionário"}: *${employeeName}*` : "";
}

function accountFromConversation(accounts: Account[], history: Array<{ role: string; content: string }>): Account | null {
  for (const entry of [...history].reverse()) {
    const normalized = entry.content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    const matches = accounts.filter(account => normalized.includes(account.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

async function resolveAccountForAi(
  userId: string,
  mode: FinanceMode,
  ai: AIResult,
  history: Array<{ role: string; content: string }>,
): Promise<{ account?: Account; choices?: Account[] }> {
  const accounts = await getManualAccountsByUser(userId, mode);
  const requested = ai.account?.name;
  if (requested) {
    const matches = await findAccountByName(userId, mode, requested, "bank");
    return matches.length === 1 ? { account: matches[0] } : { choices: matches.length ? matches : accounts };
  }
  if (ai.account?.useContext) {
    const contextual = accountFromConversation(accounts, history);
    if (contextual) return { account: contextual };
  }
  return accounts.length === 1 ? { account: accounts[0] } : { choices: accounts };
}

/** Resolve uma troca de conta durante finance_edit. Além de frases completas
 * ("mude para a conta Inter"), aceita a resposta curta da segunda etapa
 * ("conta Inter" ou apenas "Inter"). */
async function resolveFinanceEditAccount(
  userId: string,
  mode: FinanceMode,
  message: string,
  preferredHint?: string,
): Promise<{ requested: boolean; account?: Account; choices?: Account[] }> {
  const accounts = await getManualAccountsByUser(userId, mode);
  const hint = preferredHint?.trim() || getFinanceAccountDestinationHint(message)?.trim();
  if (hint) {
    const matches = await findAccountByName(userId, mode, hint, "bank");
    if (matches.length === 1) return { requested: true, account: matches[0] };
    return { requested: true, choices: matches.length > 1 ? matches : accounts };
  }

  const normalizedMessage = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const mentioned = accounts.filter(account => normalizedMessage.includes(
    account.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(),
  ));
  if (mentioned.length === 1) return { requested: true, account: mentioned[0] };
  if (mentioned.length > 1) return { requested: true, choices: mentioned };
  return { requested: false };
}

/** Mensagem recebida já normalizada pelo webhook do provider (Evolution ou
 *  WABA) — parsing do payload específico e transcrição de áudio acontecem no
 *  webhook, antes de chamar isso; aqui só entra texto/mídia já resolvidos. */
export type IncomingMessage = {
  from: string;
  text: string;
  contactName?: string;
  isFileMessage?: boolean;
  fileBuffer?: Buffer;
  fileMimeType?: string;
  fileCaption?: string;
  fileName?: string;
};

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const from = msg.from;
  let responseLocale: string | undefined;
  try {
    let messageText = msg.text;

    if (from) {
      await addMessage(from, { role: "user", content: messageText || (msg.isFileMessage ? "[Arquivo]" : ""), ts: Date.now() }, { contactName: msg.contactName });
    }

    // ── Detecta arquivo/documento enviado via WhatsApp ──
    const isFileMessage = !!msg.isFileMessage && !!msg.fileBuffer;

    if (isFileMessage) {
      // Identifica usuário antes de processar o arquivo
      const fileUser = await getUserByWppPhone(from);
      if (fileUser && hasAccess(fileUser)) {
        responseLocale = fileUser.locale;
        const buffer = msg.fileBuffer!;
        const mimeType = msg.fileMimeType || "application/octet-stream";
        const defaultExt = mimeType.includes("pdf") ? ".pdf" : mimeType.includes("image") ? ".jpg" : "";
        const caption = msg.fileCaption;

        // Extrai um nome explícito da legenda (ex: "salva como etac", "guarda como contrato assinado")
        const nameFromCaption = caption?.match(/(?:salva|salvar|guarda|guardar|arquiva|arquivar|nomeia|nomear|chama|chame)\s+(?:isso\s+|ele\s+|esse\s+arquivo\s+)?(?:de|como)\s+(.+)/i)?.[1]?.trim();
        const originalName = nameFromCaption ? `${nameFromCaption}${defaultExt}` : (msg.fileName || `arquivo_${Date.now()}${defaultExt}`);

        // A mesma classificação atende português e espanhol e evita que uma
        // ordem como "guárdala en Drive" seja confundida com leitura de
        // comprovante ou pesquisa.
        const requestedImageAction = caption?.trim() ? parseImageAction(caption) : null;
        const hasSaveIntent = requestedImageAction === "save";

        // Sem instrução, a imagem fica temporariamente guardada enquanto o
        // usuário escolhe o que fazer. Nunca arquiva automaticamente algo que
        // ele talvez quisesse pesquisar ou apenas identificar.
        if (mimeType.includes("image") && !caption?.trim()) {
          await setPendingAction(from, {
            type: "image_action",
            userId: fileUser.id,
            fileBase64: buffer.toString("base64"),
            mimeType,
            originalName,
          });
          await wppSend(from, localized(fileUser.locale,
            "🖼️ Recebi a imagem. O que você quer fazer com ela?\n\n• *guardar no Drive*\n• *pesquisar o preço*\n• *identificar o que aparece*",
            "🖼️ Recibí la imagen. ¿Qué quieres hacer con ella?\n\n• *guardarla en Drive*\n• *buscar el precio*\n• *identificar lo que aparece*"));
          return;
        }

        // Perguntas de preço/pesquisa usam primeiro a visão para identificar
        // o produto e depois uma busca pública atual com fontes e links.
        if (mimeType.includes("image") && isImageSearchRequest(caption)) {
          await researchImage(from, buffer, mimeType, caption!, fileUser.locale);
          return;
        }

        if (mimeType.includes("image") && requestedImageAction === "describe") {
          const subject = await identifyImageSubject(buffer, mimeType, fileUser.locale);
          await wppSend(from, subject
            ? localized(fileUser.locale, `🔎 Identifiquei na imagem: *${subject}*.`, `🔎 Identifiqué en la imagen: *${subject}*.`)
            : localized(fileUser.locale, "❓ Não consegui identificar a imagem com segurança. Envie uma foto mais nítida.", "❓ No pude identificar la imagen con seguridad. Envía una foto más nítida."));
          return;
        }

        // Fatura de cartão/extrato costuma vir em PDF, ou o usuário avisa na legenda —
        // nesses casos tenta extrair TODOS os lançamentos de uma vez (em vez de assumir
        // um único gasto), identificando duplicados antes de perguntar se importa.
        const looksLikeInvoice = !hasSaveIntent && (mimeType.includes("pdf") || /fatura|extrato/i.test(caption || ""));
        if (looksLikeInvoice) {
          try {
            const invoice = await extractInvoiceTransactions(buffer, mimeType, caption);
            if (invoice && invoice.transactions.length > 1) {
              const fMode = fileUser.activeMode;
              const withDup = await Promise.all(invoice.transactions.map(async t => ({
                ...t,
                category: cap(t.category),
                description: cap(t.description),
                duplicate: await isLikelyDuplicateExpense(fileUser.id, fMode, t.amount, t.date),
              })));
              const novos = withDup.filter(t => !t.duplicate);
              const duplicados = withDup.filter(t => t.duplicate);

              if (novos.length === 0) {
                await wppSend(from, `📑 Analisei a fatura e encontrei ${withDup.length} lançamento(s), mas todos já parecem estar registrados (mesmo valor e data próxima). Nada novo para importar.`);
                return;
              }

              await setPendingAction(from, {
                type: "invoice_import",
                userId: fileUser.id,
                mode: fMode,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- exclui "duplicate" do objeto, não usa a variável em si
                items: novos.map(({ duplicate: _duplicate, ...rest }) => rest),
                accountHint: invoice.bankName,
              });

              const total = novos.reduce((s, t) => s + t.amount, 0);
              await wppSend(from, `📑 *Fatura analisada!*\n\n${withDup.length} lançamento(s) encontrados\n✅ ${novos.length} novo(s) — total ${formatCurrency(total)}${duplicados.length ? `\n♻️ ${duplicados.length} já registrado(s) (mesmo valor e data próxima) — não serão duplicados` : ""}\n\n_💾 Quer que eu registre os ${novos.length} lançamentos novos como despesa? (sim/não)_`);
              return;
            }
          } catch (e) {
            console.error("[webhook] erro ao extrair fatura:", e);
          }
        }

        // Cupom fiscal de mercado (produtos individuais) — tenta ANTES do
        // caminho de "documento financeiro simples" (1 valor só), senão um
        // cupom de mercado cairia lá como um gasto único sem os itens.
        // Só imagem (cupom de mercado não vem em PDF na prática) e sem
        // intenção explícita de só salvar.
        if (!hasSaveIntent && mimeType.includes("image")) {
          try {
            const receipt = await extractGroceryReceiptItems(buffer, mimeType, caption);
            if (receipt) {
              const gMode = fileUser.activeMode;
              const isDup = await isLikelyDuplicateExpense(fileUser.id, gMode, receipt.total, receipt.date);
              if (isDup) {
                await wppSend(from, `📑 Analisei o cupom do *${receipt.storeName}* (${formatCurrency(receipt.total)}), mas já parece estar registrado (mesmo valor e data próxima). Não registrei de novo.`);
                return;
              }
              const store = await findOrCreateStore(fileUser.id, receipt.storeName);
              const items: GroceryPurchaseItem[] = receipt.items.map(i => ({
                productName: cap(i.productName), category: i.category, price: i.unitPrice, quantity: i.quantity, unit: i.unit,
              }));
              const purchase = await addPurchase({
                userId: fileUser.id, storeId: store.id, storeName: store.name,
                date: receipt.date, items, total: receipt.total, source: "whatsapp_receipt",
              });
              const finance = await addFinance({
                userId: fileUser.id, type: "expense", amount: receipt.total, category: "Alimentação",
                description: `Compra no ${store.name}`, date: receipt.date, mode: gMode, source: "whatsapp", registeredBy: from,
              });
              await setPurchaseFinanceId(purchase.id, fileUser.id, finance.id);
              const bal = await getBalance(fileUser.id, gMode, nowBR().getFullYear(), nowBR().getMonth() + 1);

              await setPendingAction(from, {
                type: "receipt_save", userId: fileUser.id, fileBase64: buffer.toString("base64"), mimeType,
                suggestedName: `${store.name} - ${receipt.date}${mimeType.includes("pdf") ? ".pdf" : ".jpg"}`,
                description: `Compra no ${store.name}`, financeId: finance.id,
              });

              const itemsList = items.map(i => `• ${i.productName} — ${formatCurrency(i.price)} × ${i.quantity} = ${formatCurrency(i.price * i.quantity)}`).join("\n");
              await wppSend(from, `🧾 *Compra registrada — ${store.name}!*\n\n${itemsList}\n\n💰 Total: ${formatCurrency(receipt.total)}\n📊 Saldo: ${formatCurrency(bal.balance)}\n\n_💾 Quer guardar a foto do cupom no Drive? (sim/não)_`);
              return;
            }
          } catch (e) {
            console.error("[webhook] erro ao extrair cupom de mercado:", e);
          }
        }

        if (!hasSaveIntent) {
          // Tenta extrair dados financeiros do documento/foto via Gemini Vision
          try {
            const financeData = await extractFinanceFromDocument(buffer, mimeType, caption);
            if (financeData) {
              const fNow = nowBR();
              const fYear = fNow.getFullYear();
              const fMonth = fNow.getMonth() + 1;
              const fMode = financeData.mode || fileUser.activeMode;
              const f = await addFinance({
                userId: fileUser.id,
                type: financeData.type,
                amount: financeData.amount,
                category: cap(financeData.category),
                description: cap(financeData.description),
                date: financeData.date || fNow.toISOString().slice(0, 10),
                mode: fMode,
                source: "whatsapp",
                registeredBy: from,
              });
              const bal = await getBalance(fileUser.id, fMode, fYear, fMonth);
              const typeLabel = financeData.type === "income" ? "Receita" : "Despesa";
              const typeEmoji = financeData.type === "income" ? "💰" : "💸";

              const receiptExt = mimeType.includes("pdf") ? ".pdf" : ".jpg";
              const suggestedName = `${f.category} - ${f.description} - ${f.date}${receiptExt}`.slice(0, 80);
              await setPendingAction(from, {
                type: "receipt_save",
                userId: fileUser.id,
                fileBase64: buffer.toString("base64"),
                mimeType,
                suggestedName,
                description: f.description,
                financeId: f.id,
              });

              await wppSend(from, `${typeEmoji} *${typeLabel} registrada!*\n\n📝 ${f.description}\n💰 ${formatCurrency(f.amount)}\n🏷️ ${f.category}\n📅 ${new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}\n\n📊 Saldo: ${formatCurrency(bal.balance)}\n\n_💾 Quer guardar esse comprovante no Drive? (sim/não)_`);
              return;
            }
          } catch (e) {
            console.error("[webhook] erro ao extrair finanças do documento:", e);
          }
        }

        // Sem dados financeiros ou com pedido de salvar → salva no Drive
        try {
          const folders = await getFolders(fileUser.id);
          const folderNames = folders.filter(f => f.parentId === null).map(f => f.name);
          // "salva"/"guarda" é comando, não descrição — só passa a legenda como
          // dica de conteúdo quando ela traz informação de verdade além do comando.
          const contentHint = hasSaveIntent ? undefined : caption;
          const { folder: suggestedFolder, keywords, suggestedName } = await categorizeDriveFile(buffer, mimeType, originalName, folderNames.length ? folderNames : ["Documentos","Comprovantes","Contratos","Fotos","Outros"], contentHint);
          const targetFolder = await getFolderByName(fileUser.id, suggestedFolder);
          const savedFile = await saveFile({
            userId: fileUser.id,
            folderId: targetFolder?.id ?? null,
            originalName: suggestedName,
            mimeType,
            size: buffer.length,
            description: caption,
            aiKeywords: keywords,
            source: "whatsapp",
            buffer,
          });
          console.log(`[drive] arquivo salvo: ${savedFile.id} | ${suggestedName} | pasta=${suggestedFolder}`);
          await wppSend(from, replyFileSaved(suggestedName, suggestedFolder, fileUser.locale));
          // Só repassa à IA se a legenda tem conteúdo além do comando de salvar
          if (caption && !hasSaveIntent) messageText = caption;
        } catch (e) {
          console.error("[drive] erro ao salvar arquivo:", e);
          await wppSend(from, localized(fileUser.locale, "❌ Não consegui salvar o arquivo. Tente novamente.", "❌ No pude guardar el archivo. Inténtalo de nuevo."));
        }
      }
      // Se não há legenda/caption para processar, encerra aqui
      if (!messageText) return;
    }

    if (!messageText) return;

    // ── Verifica se é um código de vinculação (4 dígitos) ──
    // Não vincula na hora — primeiro coleta nome, vínculo com a conta e o
    // modo que a pessoa pode acessar (awaiting_wpp_link_info), só então
    // chama linkPhone. Precisa ficar ANTES de identificar o usuário pelo
    // telefone (abaixo), porque o número ainda não está vinculado aqui.
    const codeMatch = messageText.trim().match(/^(\d{4})$/);
    if (codeMatch) {
      const allowed = await checkRateLimit(`wpp-code:${from}`, 10, 10 * 60_000);
      if (!allowed) {
        await wppSend(from, "⏳ Muitas tentativas de código. Aguarde 10 minutos e tente novamente.");
        return;
      }
      const codeUser = await getUserByWppCode(codeMatch[1]);
      if (codeUser) {
        const isSpanish = codeUser.locale === "es";
        const linkedCount = await countPhonesForUser(codeUser.id);
        if (linkedCount >= getMaxWppPhones(codeUser)) {
          await wppSend(from, isSpanish
            ? `❌ Esta cuenta ya alcanzó el límite de ${getMaxWppPhones(codeUser)} número(s) vinculado(s).`
            : `❌ Esta conta já atingiu o limite de ${getMaxWppPhones(codeUser)} número(s) vinculado(s).`);
          return;
        }
        await updateUser(codeUser.id, { wppVerifyCode: undefined, wppVerifyExpires: undefined });
        await setPendingAction(from, { type: "awaiting_wpp_link_info", userId: codeUser.id, step: "name" });
        await wppSend(from, replyWppLinkStep("name", codeUser.locale));
        return;
      }
    }

    // ── Vinculação em andamento (nome → vínculo → acesso) — precisa vir
    //    ANTES de identificar usuário pelo telefone, pelo mesmo motivo acima ──
    const linkPending = await getPendingAction(from);
    if (linkPending?.type === "awaiting_wpp_link_info") {
      const linkOwner = await getUserById(linkPending.userId);
      const isSpanish = linkOwner?.locale === "es";
      if (linkPending.step === "name") {
        const name = cap(messageText.trim().slice(0, 40)) || (isSpanish ? "Sin nombre" : "Sem nome");
        await setPendingAction(from, { type: "awaiting_wpp_link_info", userId: linkPending.userId, step: "relation", name });
        await wppSend(from, replyWppLinkStep("relation", linkOwner?.locale, name));
        return;
      }
      if (linkPending.step === "relation") {
        const relation = cap(messageText.trim().slice(0, 30)) || (isSpanish ? "Otro" : "Outro");
        await setPendingAction(from, { type: "awaiting_wpp_link_info", userId: linkPending.userId, step: "access", name: linkPending.name, relation });
        await wppSend(from, replyWppLinkStep("access", linkOwner?.locale));
        return;
      }
      if (linkPending.step === "access") {
        const access = parseLinkedPhoneAccess(messageText);
        if (!access) {
          await wppSend(from, isSpanish
            ? "❓ No entendí. Responde *1* (solo personal), *2* (solo empresarial) o *3* (los dos)."
            : "❓ Não entendi. Responda *1* (só pessoal), *2* (só empresarial) ou *3* (os dois).");
          return;
        }
        await clearPendingAction(from);
        const linkName = linkPending.name || (isSpanish ? "Sin nombre" : "Sem nome");
        const linkRelation = linkPending.relation || (isSpanish ? "Otro" : "Outro");
        const linkResult = await linkPhone(linkPending.userId, from);
        if (linkResult === "already_linked_elsewhere") {
          await wppSend(from, isSpanish
            ? "❌ Este número ya está vinculado a otra cuenta. Desvincúlalo antes de intentarlo de nuevo."
            : "❌ Este número já está vinculado a outra conta. Desvincule-o antes de tentar novamente.");
          return;
        }
        await setPhoneName(linkPending.userId, from, linkName);
        await setPhoneRelation(linkPending.userId, from, linkRelation);
        await setPhoneAccess(linkPending.userId, from, access);
        const accessLabel = isSpanish
          ? (access === "personal" ? "modo personal" : access === "business" ? "modo empresarial" : "los dos modos")
          : (access === "personal" ? "modo pessoal" : access === "business" ? "modo empresarial" : "os dois modos");
        await wppSend(from, isSpanish
          ? `✅ *¡WhatsApp vinculado correctamente!*\n\n${linkName} (${linkRelation}) ya puede usar Zelo por aquí, con acceso a ${accessLabel}.`
          : `✅ *WhatsApp vinculado com sucesso!*\n\n${linkName} (${linkRelation}) já pode usar o Zelo por aqui, com acesso a ${accessLabel}.`);
        const firstUseGuide = buildFirstUseGuideMessages(linkOwner?.locale);
        await wppSend(from, isSpanish
          ? `📚 Ahora te enviaré la guía completa en *${firstUseGuide.length} partes*, con ejemplos de todos los servicios y de cómo hacer pedidos claros.`
          : `📚 Agora vou enviar o guia completo em *${firstUseGuide.length} partes*, com exemplos de todos os serviços e de como fazer pedidos claros.`);
        for (const guideMessage of firstUseGuide) await wppSend(from, guideMessage);
        return;
      }
    }

    // ── Identifica usuário pelo wppPhone cadastrado ──
    const user = await getUserByWppPhone(from);

    if (!user) {
      await wppSend(from, replyPhoneNotLinked(from));
      return;
    }
    responseLocale = user.locale;

    // ── Verifica acesso (trial vencido OU desativado pelo admin) ──
    if (!hasAccess(user)) {
      await wppSend(from, user.status === "inactive" ? replyAccountInactive(user.locale) : replyTrialExpired(user.locale));
      return;
    }

    // Quem só tem acesso a um modo (definido na vinculação) fica travado nele,
    // independente do toggle global da conta. Quem tem acesso aos dois ("both",
    // ou números vinculados antes dessa feature) continua usando o toggle
    // compartilhado de sempre.
    const phoneAccess = await getPhoneAccess(user.id, from);
    const mode: "personal" | "business" = phoneAccess === "both" ? user.activeMode : phoneAccess;
    const now = nowBR(); // horário de Brasília/São Paulo
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // ── Comando para (re)definir o nome de quem usa este número ──
    const nameCmdMatch = messageText.trim().match(/^(?:meu nome (?:é|e)|me chamo|mi nombre es|me llamo)\s+(.{2,40})$/i);
    if (nameCmdMatch) {
      const name = cap(nameCmdMatch[1].trim());
      await setPhoneName(user.id, from, name);
      await wppSend(from, replyWppNameSaved(name, user.locale));
      return;
    }

    // ── Comando para (re)definir o vínculo de quem usa este número ──
    // Frase específica de propósito (igual "meu nome é X") — evita casar com
    // mensagens comuns que começam com "sou" por acaso.
    const relationCmdMatch = messageText.trim().match(/^(?:meu v[íi]nculo (?:é|e)|mi relaci[oó]n (?:es|con la cuenta es))\s+(.{2,30})$/i);
    if (relationCmdMatch) {
      const relation = cap(relationCmdMatch[1].trim());
      await setPhoneRelation(user.id, from, relation);
      await wppSend(from, user.locale === "es"
        ? `De acuerdo, tu relación en esta cuenta es *${relation}*. 👍`
        : `Combinado, você é *${relation}* nessa conta. 👍`);
      return;
    }

    // ── Comando pra gerar o código de vinculação de outro número direto pelo
    //    WhatsApp — antes só dava pra gerar entrando no painel web, o que
    //    trava quem só usa o bot pelo celular. Mesma função que o botão
    //    "Vincular mais um número" do painel usa (generateWppVerifyCode). ──
    const linkCodeCmdMatch = /(?:vincular|conectar).*n[uú]mero|n[uú]mero.*(?:vincular|conectar)|c[oó]digo de (?:vincula[çc][ãa]o|vinculaci[oó]n|conexi[oó]n)/i.test(messageText.trim());
    if (linkCodeCmdMatch) {
      const linkedCount = await countPhonesForUser(user.id);
      const max = getMaxWppPhones(user);
      if (linkedCount >= max) {
        await wppSend(from, user.locale === "es"
          ? `❌ Esta cuenta ya alcanzó el límite de ${max} número(s) vinculado(s).`
          : `❌ Esta conta já atingiu o limite de ${max} número(s) vinculado(s).`);
        return;
      }
      const code = await generateWppVerifyCode(user.id);
      const botNumber = (await getConfig()).wppBotNumber;
      await wppSend(from, user.locale === "es"
        ? `📲 *Código de vinculación:* ${code}\n\nPídele a la persona que guarde${botNumber ? ` el número *${botNumber}*` : " este número de Zelo"} y envíe este código por aquí. Zelo le preguntará su nombre, relación y el modo (personal/empresarial/los dos) al que puede acceder.\n\n⏱ Válido durante 10 minutos.`
        : `📲 *Código de vinculação:* ${code}\n\nPeça para a pessoa salvar${botNumber ? ` o número *${botNumber}*` : " este número do Zelo"} e mandar esse código por aqui — o bot vai perguntar o nome dela, o vínculo e o modo (pessoal/empresa/os dois) que ela pode acessar.\n\n⏱ Válido por 10 minutos.`);
      return;
    }

    // ── Verifica ação pendente (ex: seleção de veículo) ──
    const pending = await getPendingAction(from);
    let actionContinuation: { originalText: string; answers: string[]; partial: AIResult } | null = null;
    let accountSelectionResume: AIResult | null = null;
    let employeeSelectionResume: AIResult | null = null;

    if (pending?.type === "account_selection" && pending.userId === user.id) {
      const requestedAccountName = parseAccountCreateRequest(messageText);
      if (requestedAccountName !== null) {
        if (!requestedAccountName) {
          await setPendingAction(from, {
            type: "account_create_name", userId: user.id, mode: pending.mode,
            resumeAi: pending.ai, originalText: pending.originalText,
          });
          await wppSend(from, accountNameQuestion(user.locale));
          return;
        }
        try {
          const { account, created } = await createOrReuseAccountForAction(
            user.id,
            pending.mode as FinanceMode,
            requestedAccountName,
          );
          await clearPendingAction(from);
          accountSelectionResume = applyAccountToAi(pending.ai, account.name, pending.mode as FinanceMode);
          messageText = pending.originalText;
          await wppSend(from, localized(user.locale,
            created
              ? `✅ Conta *${account.name}* cadastrada. Vou usá-la neste lançamento.`
              : `ℹ️ A conta *${account.name}* já estava cadastrada. Vou usá-la neste lançamento.`,
            created
              ? `✅ Cuenta *${account.name}* registrada. La usaré en este movimiento.`
              : `ℹ️ La cuenta *${account.name}* ya estaba registrada. La usaré en este movimiento.`,
          ));
        } catch {
          await setPendingAction(from, {
            type: "account_selection", userId: user.id, mode: pending.mode,
            action: "resume_ai", ai: pending.ai, originalText: pending.originalText,
            accounts: pending.accounts,
          });
          await wppSend(from, localized(user.locale,
            `❌ Não consegui cadastrar a conta *${requestedAccountName}*. Tente outro nome ou escolha uma conta da lista.`,
            `❌ No pude registrar la cuenta *${requestedAccountName}*. Prueba otro nombre o elige una cuenta de la lista.`,
          ));
          return;
        }
      } else {
      const choice = parseAccountChoice(messageText, pending.accounts);
      if (choice < 0) {
        await setPendingAction(from, {
          type: "account_selection", userId: user.id, mode: pending.mode,
          action: "resume_ai", ai: pending.ai, originalText: pending.originalText,
          accounts: pending.accounts,
        });
        await wppSend(from, accountSelectionMessage(pending.accounts as Account[], user.locale));
        return;
      }
      await clearPendingAction(from);
      const chosen = pending.accounts[choice];
      accountSelectionResume = applyAccountToAi(pending.ai, chosen.name, pending.mode as FinanceMode);
      messageText = pending.originalText;
      }
    }

    if (pending?.type === "account_create_name" && pending.userId === user.id) {
      if (/^(?:cancelar|cancela|deixa pra l[áa]|n[ãa]o|no)$/i.test(messageText.trim())) {
        await clearPendingAction(from);
        await wppSend(from, localized(user.locale,
          "Cadastro cancelado. Nenhuma conta foi criada.",
          "Registro cancelado. No se creó ninguna cuenta."));
        return;
      }
      const name = cleanPendingAccountName(messageText);
      if (!name || name.length > 80 || /^\d+$/.test(name)) {
        await setPendingAction(from, {
          type: "account_create_name", userId: user.id, mode: pending.mode,
          resumeAi: pending.resumeAi, originalText: pending.originalText,
        });
        await wppSend(from, accountNameQuestion(user.locale));
        return;
      }
      if (pending.resumeAi) {
        try {
          const { account, created } = await createOrReuseAccountForAction(user.id, pending.mode as FinanceMode, name);
          await clearPendingAction(from);
          accountSelectionResume = applyAccountToAi(pending.resumeAi, account.name, pending.mode as FinanceMode);
          messageText = pending.originalText || messageText;
          await wppSend(from, localized(user.locale,
            created
              ? `✅ Conta *${account.name}* cadastrada. Vou usá-la neste lançamento.`
              : `ℹ️ A conta *${account.name}* já estava cadastrada. Vou usá-la neste lançamento.`,
            created
              ? `✅ Cuenta *${account.name}* registrada. La usaré en este movimiento.`
              : `ℹ️ La cuenta *${account.name}* ya estaba registrada. La usaré en este movimiento.`,
          ));
        } catch {
          await setPendingAction(from, {
            type: "account_create_name", userId: user.id, mode: pending.mode,
            resumeAi: pending.resumeAi, originalText: pending.originalText,
          });
          await wppSend(from, localized(user.locale,
            `❌ Não consegui cadastrar *${name}*. Tente outro nome.`,
            `❌ No pude registrar *${name}*. Prueba otro nombre.`,
          ));
          return;
        }
      } else {
        await clearPendingAction(from);
        accountSelectionResume = {
          intent: "account_create", confidence: 1,
          mode: pending.mode as FinanceMode,
          account: { name, type: "bank", mode: pending.mode as FinanceMode },
        };
      }
    }

    if (pending?.type === "account_default_confirm" && pending.userId === user.id) {
      const choice = parseAccountDefaultChoice(
        messageText,
        pending.currentAccountName,
        pending.newAccountName,
      );
      if (!choice) {
        await setPendingAction(from, {
          type: "account_default_confirm",
          userId: user.id,
          mode: pending.mode,
          currentAccountId: pending.currentAccountId,
          currentAccountName: pending.currentAccountName,
          newAccountId: pending.newAccountId,
          newAccountName: pending.newAccountName,
        });
        await wppSend(from, accountDefaultConfirmationMessage(
          pending.currentAccountName,
          pending.newAccountName,
          user.locale,
        ));
        return;
      }

      await clearPendingAction(from);
      if (choice === "keep") {
        await wppSend(from, localized(user.locale,
          `✅ Combinado. *${pending.currentAccountName}* continua como conta padrão.`,
          `✅ De acuerdo. *${pending.currentAccountName}* sigue siendo la cuenta predeterminada.`,
        ));
        return;
      }

      const changed = await setDefaultAccount(
        user.id,
        pending.mode as FinanceMode,
        pending.newAccountId,
      );
      await wppSend(from, changed
        ? localized(user.locale,
          `⭐ *${pending.newAccountName}* agora é a conta padrão.`,
          `⭐ *${pending.newAccountName}* ahora es la cuenta predeterminada.`,
        )
        : localized(user.locale,
          "❌ A conta foi cadastrada, mas não consegui defini-la como padrão agora.",
          "❌ La cuenta fue registrada, pero no pude establecerla como predeterminada ahora.",
        ));
      return;
    }

    // ── Funcionário de um lançamento financeiro. A opção final da lista é
    // sempre "sem funcionário", para permitir um gasto empresarial genérico. ──
    if (pending?.type === "finance_employee_select" && pending.userId === user.id) {
      const choice = parseFinanceEmployeeChoice(messageText, pending.employees);
      if (choice === null) {
        await setPendingAction(from, {
          type: "finance_employee_select", userId: user.id, mode: pending.mode,
          action: pending.action, ai: pending.ai, originalText: pending.originalText,
          financeIds: pending.financeIds, employees: pending.employees,
        });
        await wppSend(from, financeEmployeeSelectionMessage(pending.employees, user.locale));
        return;
      }
      await clearPendingAction(from);
      const chosen = choice === "none" ? null : pending.employees[choice];
      if (pending.action === "edit_finances") {
        const updated = [];
        for (const financeId of pending.financeIds ?? []) {
          const item = await updateFinance(financeId, user.id, { employeeId: chosen?.id ?? null });
          if (item) updated.push(item);
        }
        await wppSend(from, updated.length
          ? localized(user.locale,
            `✅ Colaborador do lançamento atualizado.${employeeLinkLabel(chosen?.name, !chosen, user.locale)}`,
            `✅ Se actualizó el empleado del movimiento.${employeeLinkLabel(chosen?.name, !chosen, user.locale)}`)
          : localized(user.locale, "❌ Não consegui atualizar o funcionário desse lançamento.", "❌ No pude actualizar el empleado de ese movimiento."));
        return;
      }
      if (!pending.ai) return;
      employeeSelectionResume = applyEmployeeToAi(pending.ai, chosen?.id ?? null, chosen?.name);
      messageText = pending.originalText || messageText;
    }

    // A correção citou uma pessoa que ainda não existe. Salário é o único
    // dado obrigatório ausente no cadastro atual; cargo recebe o padrão e pode
    // ser editado depois por comando ou no painel.
    if (pending?.type === "finance_employee_create" && pending.userId === user.id) {
      if (/^(?:cancelar|cancela|deixa pra l[áa]|no|n[ãa]o)$/i.test(messageText.trim())) {
        await clearPendingAction(from);
        await wppSend(from, localized(user.locale,
          "Cancelado — mantive o lançamento sem alterar o funcionário. 👍",
          "Cancelado; mantuve el movimiento sin cambiar el empleado. 👍"));
        return;
      }
      const salary = parseAmountBR(messageText);
      if (salary === null) {
        await setPendingAction(from, { ...pending, financeIds: pending.financeIds });
        await wppSend(from, localized(user.locale,
          `💰 *${pending.employeeName}* ainda não está cadastrado(a). Qual é o salário para concluir o cadastro e vincular este pagamento?`,
          `💰 *${pending.employeeName}* todavía no está registrado(a). ¿Cuál es el salario para completar el registro y vincular este pago?`));
        return;
      }
      await clearPendingAction(from);
      const employee = await createEmployee({
        userId: user.id, name: cap(pending.employeeName),
        role: user.locale === "es" ? "Empleado" : "Funcionário",
        salary, startDate: todayStrBR(), status: "active",
      });
      let changed = 0;
      for (const financeId of pending.financeIds) {
        if (await updateFinance(financeId, user.id, { employeeId: employee.id })) changed++;
      }
      await wppSend(from, localized(user.locale,
        `✅ Funcionário *${employee.name}* cadastrado com salário de ${formatCurrency(employee.salary)} e vinculado a ${changed === 1 ? "este pagamento" : `${changed} pagamentos`}.`,
        `✅ Empleado *${employee.name}* registrado con salario de ${formatCurrency(employee.salary)} y vinculado a ${changed === 1 ? "este pago" : `${changed} pagos`}.`));
      return;
    }

    // ── Imagem enviada sem legenda: só executa a ação depois que a pessoa
    // disser se quer guardar, pesquisar ou identificar. ──
    if (pending?.type === "image_action" && pending.userId === user.id) {
      const imageAction = parseImageAction(messageText);
      const cancelImage = /^(?:cancelar|cancela|deixa pra l[áa]|cancelar|no|não|nao)$/i.test(messageText.trim());
      if (cancelImage) {
        await clearPendingAction(from);
        await wppSend(from, localized(user.locale, "Combinado, não fiz nada com a imagem.", "De acuerdo, no hice nada con la imagen."));
        return;
      }
      if (!imageAction) {
        await setPendingAction(from, {
          type: "image_action", userId: user.id, fileBase64: pending.fileBase64,
          mimeType: pending.mimeType, originalName: pending.originalName,
        });
        await wppSend(from, localized(user.locale,
          "❓ O que devo fazer com a imagem? Responda *guardar no Drive*, *pesquisar o preço* ou *identificar*.",
          "❓ ¿Qué debo hacer con la imagen? Responde *guardar en Drive*, *buscar el precio* o *identificar*."));
        return;
      }

      const buffer = Buffer.from(pending.fileBase64, "base64");
      await clearPendingAction(from);
      if (imageAction === "search") {
        await researchImage(from, buffer, pending.mimeType, messageText, user.locale);
        return;
      }
      if (imageAction === "describe") {
        const subject = await identifyImageSubject(buffer, pending.mimeType, user.locale);
        await wppSend(from, subject
          ? localized(user.locale, `🔎 Identifiquei na imagem: *${subject}*.`, `🔎 Identifiqué en la imagen: *${subject}*.`)
          : localized(user.locale, "❓ Não consegui identificar a imagem com segurança. Envie uma foto mais nítida.", "❓ No pude identificar la imagen con seguridad. Envía una foto más nítida."));
        return;
      }

      const folders = await getFolders(user.id);
      const folderNames = folders.filter(f => f.parentId === null).map(f => f.name);
      const { folder, keywords, suggestedName } = await categorizeDriveFile(
        buffer, pending.mimeType, pending.originalName,
        folderNames.length ? folderNames : ["Documentos", "Comprovantes", "Contratos", "Fotos", "Outros"],
      );
      const targetFolder = await getFolderByName(user.id, folder);
      await saveFile({
        userId: user.id, folderId: targetFolder?.id ?? null,
        originalName: suggestedName, mimeType: pending.mimeType, size: buffer.length,
        aiKeywords: keywords, source: "whatsapp", buffer,
      });
      await wppSend(from, replyFileSaved(suggestedName, folder, user.locale));
      return;
    }

    // ── Aguardando confirmação de guardar comprovante (foto/documento) no Drive ──
    if (pending?.type === "receipt_save" && pending.userId === user.id) {
      const answer = parseYesNo(messageText);
      if (answer !== null) {
        await clearPendingAction(from);
        if (answer) {
          try {
            const buffer = Buffer.from(pending.fileBase64, "base64");
            const folders = await getFolders(user.id);
            const folderNames = folders.filter(f => f.parentId === null).map(f => f.name);
            // Aqui o nome já é bom (montado a partir dos dados financeiros extraídos:
            // "Categoria - Descrição - Data"), então só reaproveita a IA pra pasta/keywords.
            const { folder: suggestedFolder, keywords } = await categorizeDriveFile(buffer, pending.mimeType, pending.suggestedName, folderNames.length ? folderNames : ["Documentos","Comprovantes","Contratos","Fotos","Outros"]);
            const targetFolder = await getFolderByName(user.id, suggestedFolder);
            const savedFile = await saveFile({
              userId: user.id,
              folderId: targetFolder?.id ?? null,
              originalName: pending.suggestedName,
              mimeType: pending.mimeType,
              size: buffer.length,
              description: pending.description,
              aiKeywords: keywords,
              source: "whatsapp",
              buffer,
            });
            console.log(`[drive] comprovante salvo: ${savedFile.id} | ${pending.suggestedName} | pasta=${suggestedFolder}`);
            await wppSend(from, replyFileSaved(pending.suggestedName, suggestedFolder, user.locale));
          } catch (e) {
            console.error("[drive] erro ao salvar comprovante:", e);
            await wppSend(from, localized(user.locale, "❌ Não consegui guardar o comprovante. Tente novamente.", "❌ No pude guardar el comprobante. Inténtalo de nuevo."));
          }
        } else {
          await wppSend(from, localized(user.locale, "Combinado, não vou guardar esse comprovante. 👍", "De acuerdo, no guardaré este comprobante. 👍"));
        }
        return;
      }
      // resposta não reconhecida como sim/não — deixa expirar e processa normalmente
    }

    // ── Aguardando confirmação de importar lançamentos de uma fatura de cartão ──
    if (pending?.type === "invoice_import" && pending.userId === user.id) {
      const answer = parseYesNo(messageText);
      if (answer !== null) {
        await clearPendingAction(from);
        if (answer) {
          for (const item of pending.items) {
            const { accountId, cardInvoiceId } = await resolveAccountFields(user.id, pending.mode, pending.accountHint);
            await addFinance({
              userId: user.id,
              type: "expense",
              amount: item.amount,
              category: item.category,
              description: item.description,
              date: item.date,
              mode: pending.mode,
              source: "whatsapp",
              registeredBy: from,
              accountId, cardInvoiceId,
            });
          }
          const fNow = nowBR();
          const bal = await getBalance(user.id, pending.mode, fNow.getFullYear(), fNow.getMonth() + 1);
          await wppSend(from, `✅ *${pending.items.length} lançamento(s) importado(s) da fatura!*\n\n📊 Saldo ${pending.mode === "business" ? "Empresa" : "Pessoal"}: ${formatCurrency(bal.balance)}`);
        } else {
          await wppSend(from, "Combinado, não importei os lançamentos da fatura. 👍");
        }
        return;
      }
      // resposta não reconhecida como sim/não — deixa expirar e processa normalmente
    }

    if (pending?.type === "vehicle_selection" && pending.userId === user.id) {
      const vehicleAction = pending.action || "expense";

      if (vehicleAction === "update" && pending.awaitingPatch && pending.vehicles.length === 1) {
        const patch = parseVehiclePatchFromText(messageText);
        if (Object.keys(patch).length > 0) {
          await clearPendingAction(from);
          const updated = await updateVehicle(pending.vehicles[0].id, user.id, patch);
          if (updated) await sendVehicleUpdated(from, updated, user.locale);
          else await wppSend(from, localized(user.locale, "❌ Não consegui atualizar esse veículo agora. Nada foi modificado; tente novamente.", "❌ No pude actualizar este vehículo. No se modificó nada; inténtalo de nuevo."));
          return;
        }
        // Não prende outros comandos na pergunta pendente. Se a resposta não
        // contém um campo de veículo reconhecido, limpa e deixa a IA tratar.
        await clearPendingAction(from);
      } else {
        const choiceIdx = parseVehicleChoice(messageText, pending.vehicles);
        if (choiceIdx >= 0) {
          await clearPendingAction(from);
          const chosen = pending.vehicles[choiceIdx];

          if (vehicleAction === "delete") {
            const deleted = await deleteVehicle(chosen.id, user.id);
            await wppSend(from, deleted
              ? `🗑️ *Veículo excluído!*\n\n🚗 ${vehicleIdentity(chosen)}\n\n_Os lançamentos já registrados em Finanças foram mantidos no histórico._`
              : localized(user.locale, "❌ Não consegui excluir esse veículo agora. Nada foi modificado; tente novamente.", "❌ No pude eliminar este vehículo. No se modificó nada; inténtalo de nuevo."));
            return;
          }

          if (vehicleAction === "update") {
            if (pending.patch && Object.keys(pending.patch).length > 0) {
              const updated = await updateVehicle(chosen.id, user.id, pending.patch);
              if (updated) await sendVehicleUpdated(from, updated, user.locale);
              else await wppSend(from, localized(user.locale, "❌ Não consegui atualizar esse veículo agora. Nada foi modificado; tente novamente.", "❌ No pude actualizar este vehículo. No se modificó nada; inténtalo de nuevo."));
            } else {
              const fullVehicle = (await getVehiclesByUser(user.id)).find(v => v.id === chosen.id);
              if (fullVehicle) await askVehiclePatch(from, user.id, fullVehicle, pending.mode as "personal" | "business", user.locale);
              else await wppSend(from, localized(user.locale, "❌ Esse veículo não está mais cadastrado.", "❌ Este vehículo ya no está registrado."));
            }
            return;
          }

          if (!pending.expenseData) {
            await wppSend(from, localized(user.locale, "❌ Não encontrei os dados do gasto. Envie o valor novamente.", "❌ No encontré los datos del gasto. Envía el valor de nuevo."));
            return;
          }
          const typeEmoji: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };
          const exp = await addVehicleExpense(chosen.id, user.id, { date: pending.expenseData.date, km: pending.expenseData.km, type: pending.expenseData.expenseType, amount: pending.expenseData.amount, description: pending.expenseData.description });
          if (exp) {
            const newExp = exp.expenses[exp.expenses.length - 1];
            const f = await addFinance({ userId: user.id, type: "expense", amount: pending.expenseData.amount, category: VEHICLE_FINANCE_CATEGORY[pending.expenseData.expenseType] || "Transporte", description: `${pending.expenseData.description} — ${chosen.brand} ${chosen.model}`, date: pending.expenseData.date, mode: pending.mode as "personal" | "business", source: "whatsapp", registeredBy: from });
            await setExpenseFinanceId(chosen.id, newExp.id, f.id);
            const total = getVehicleTotalExpenses(exp);
            await wppSend(from, `${typeEmoji[pending.expenseData.expenseType] || "📌"} *Registrado no ${chosen.brand} ${chosen.model}!*\n\n💰 ${formatCurrency(pending.expenseData.amount)} — ${pending.expenseData.description}\n📊 Total do veículo: ${formatCurrency(total)}`);
          } else {
            await wppSend(from, "❌ Não consegui registrar o gasto no veículo agora. Nada foi lançado; tente novamente.");
          }
          return;
        } else {
          // não é uma resposta de veículo — limpa pendência e processa normalmente
          await clearPendingAction(from);
        }
      }
    }

    // ── Verifica seleção de funcionário pendente (pagamento recorrente) ──
    if (pending?.type === "employee_payment_select" && pending.userId === user.id) {
      const choice = parseFinanceEmployeeChoice(messageText, pending.employees);
      if (choice !== null) {
        await clearPendingAction(from);
        const chosen = choice === "none" ? null : pending.employees[choice];
        const resumedAi: AIResult = {
          intent: "recurring_create",
          confidence: 1,
          recurring: {
            ...pending.recurringData,
            description: chosen ? `Salário - ${chosen.name}` : (pending.recurringData.description || "Funcionário"),
            employeePayment: false, employeeName: undefined, employeeId: chosen?.id ?? null,
          },
        };
        const { reply } = await beginSlotFill("recurring_create", resumedAi, { user, userId: user.id, phone: from, mode: pending.mode as "personal" | "business" }, pending.originalText);
        await wppSend(from, reply);
        return;
      } else {
        // não reconheceu — limpa pendência e processa normalmente
        await clearPendingAction(from);
      }
    }

    // ── Verifica seleção de meta pendente ──
    if (pending?.type === "goal_selection" && pending.userId === user.id) {
      const choiceIdx = parseGoalChoice(messageText, pending.goals);
      if (choiceIdx >= 0) {
        await clearPendingAction(from);
        const chosen = pending.goals[choiceIdx];
        if (pending.action === "add") {
          const updated = await updateGoalAmount(chosen.id, user.id, pending.amount || 0);
          if (updated) {
            const p = getGoalProgress(updated);
            const emoji = p >= 100 ? "🎉" : p >= 75 ? "🚀" : "📈";
            await wppSend(from, `${emoji} *${formatCurrency(pending.amount || 0)} adicionado!*\n\n🎯 ${updated.title}\n📊 ${formatCurrency(updated.currentAmount)} / ${formatCurrency(updated.targetAmount)} (${p}%)${updated.status === "completed" ? "\n\n🏆 *Meta concluída! Parabéns!*" : ""}`);
          } else await wppSend(from, "❌ Não consegui atualizar essa meta agora. Nada foi modificado; tente novamente.");
        } else if (pending.action === "complete") {
          const updated = await updateGoalStatus(chosen.id, user.id, "completed");
          await wppSend(from, updated ? `🏆 *Meta concluída!*\n\n🎯 ${updated.title}\n\nParabéns! Você atingiu seu objetivo! 🎉` : "❌ Não consegui concluir essa meta agora. Tente novamente.");
        } else if (pending.action === "cancel") {
          const updated = await updateGoalStatus(chosen.id, user.id, "cancelled");
          await wppSend(from, updated ? `🗑️ Meta cancelada.\n\n🎯 ${updated.title}` : "❌ Não consegui cancelar essa meta agora. Tente novamente.");
        }
        return;
      } else {
        await clearPendingAction(from);
      }
    }

    // ── Verifica seleção de compromisso pendente. Também cobre a segunda
    // etapa de edição: depois de escolher "1", pode ainda faltar dizer o
    // que deve mudar. Nunca executa update com patch vazio. ──
    if (pending?.type === "appointment_selection" && pending.userId === user.id) {
      if (pending.awaitingPatch) {
        if (/^(?:cancelar|cancela|deixa pra l[áa])$/i.test(messageText.trim())) {
          await clearPendingAction(from);
          await wppSend(from, "Cancelado — não alterei o compromisso. 👍");
          return;
        }
        const chosenAppt = pending.appointments[0];
        const full = chosenAppt ? await getAppointmentById(chosenAppt.id, user.id) : null;
        if (!full) {
          await clearPendingAction(from);
          await wppSend(from, "❌ Não consegui mais localizar esse compromisso. Digite *meus compromissos* para conferir a agenda.");
          return;
        }

        const reminderRequest = parseAppointmentReminderRequest(messageText);
        if (reminderRequest) {
          await clearPendingAction(from);
          await wppSend(from, replyAgendaReminderPolicy(user.locale));
          return;
        }

        const editAi = await processMessage(messageText, { user });
        const editPatch = appointmentPatchFromAi(editAi, full);
        if (Object.keys(editPatch).length === 0) {
          await setPendingAction(from, { ...pending, appointments: pending.appointments, awaitingPatch: true });
          await wppSend(from, `❓ Não identifiquei o que mudar em *${full.title}*.\n\nExemplos:\n• _muda para dia 10 às 15h_\n• _altera o local para Escritório_\n• _me avisa 1 hora antes_\n\nOu responda *cancelar*.`);
          return;
        }
        await clearPendingAction(from);
        const updated = await updateAppointment(full.id, user.id, editPatch);
        await wppSend(from, updated ? replyAgendaUpdated(updated, user.locale) : "❌ Não consegui alterar o compromisso agora. Nada foi modificado; tente novamente.");
        return;
      }

      const apptChoiceIdx = parseAppointmentChoice(messageText, pending.appointments);
      if (apptChoiceIdx >= 0) {
        const chosenAppt = pending.appointments[apptChoiceIdx];
        if (pending.action === "update") {
          const patch = (pending.patch || {}) as Parameters<typeof updateAppointment>[2];
          if (Object.keys(patch).length === 0) {
            await setPendingAction(from, {
              type: "appointment_selection", userId: user.id, action: "update", patch: {},
              appointments: [chosenAppt], awaitingPatch: true, mode: pending.mode || mode,
            });
            await wppSend(from, `Certo, você escolheu *${chosenAppt.title}*. O que deseja alterar?\n\nExemplos:\n• _muda para dia 10 às 15h_\n• _altera o local para Escritório_\n• _me avisa 1 hora antes_`);
            return;
          }
          await clearPendingAction(from);
          const updated = await updateAppointment(chosenAppt.id, user.id, patch);
          await wppSend(from, updated ? replyAgendaUpdated(updated, user.locale) : "❌ Não consegui alterar o compromisso agora. Nada foi modificado; tente novamente.");
        } else if (pending.action === "delete") {
          await clearPendingAction(from);
          const deleted = await deleteAppointment(chosenAppt.id, user.id);
          await wppSend(from, deleted ? replyAgendaDeleted(chosenAppt.title, user.locale) : "❌ Não consegui cancelar esse compromisso agora. Tente novamente.");
        } else if (pending.action === "done") {
          await clearPendingAction(from);
          const updated = await updateAppointment(chosenAppt.id, user.id, { status: "done" });
          await wppSend(from, updated ? `✅ Marquei como realizado.\n\n📅 ${chosenAppt.title}` : "❌ Não consegui marcar esse compromisso como realizado. Tente novamente.");
        } else if (pending.action === "add_meet") {
          await clearPendingAction(from);
          const full = await getAppointmentById(chosenAppt.id, user.id);
          if (full) await performAddMeet(full, user.id, from, user.locale);
          else await wppSend(from, "❌ Não consegui mais localizar esse compromisso. Digite *meus compromissos* para conferir.");
        } else if (pending.action === "set_reminder") {
          await clearPendingAction(from);
          await wppSend(from, replyAgendaReminderPolicy(user.locale));
        }
        return;
      } else {
        if (/^(?:cancelar|cancela|deixa pra l[áa])$/i.test(messageText.trim())) {
          await clearPendingAction(from);
          await wppSend(from, "Cancelado — não alterei nenhum compromisso. 👍");
          return;
        }
        // Uma escolha inválida deve receber orientação, não cair no
        // classificador como se "1" fosse um comando novo.
        if (/^\d+$/.test(messageText.trim()) || messageText.trim().length <= 40) {
          await wppSend(from, localized(user.locale,
            `❓ Não reconheci essa opção. Responda com um número de *1 a ${pending.appointments.length}* ou com o nome do compromisso.`,
            `❓ No reconocí esa opción. Responde con un número del *1 al ${pending.appointments.length}* o con el nombre de la cita.`));
          return;
        }
        await clearPendingAction(from);
      }
    }

    // ── Confirmação de "apagar todo o histórico" (ação irreversível — exige
    // uma frase exata, não um "sim" qualquer, pra reduzir confirmação acidental) ──
    if (pending?.type === "confirm_clear_history" && pending.userId === user.id) {
      const confirmationText = messageText.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const confirmed = confirmationText === "apagar tudo" || confirmationText === "borrar todo";
      await clearPendingAction(from);
      if (confirmed) {
        const deleted = await deleteAllFinances(user.id, pending.mode);
        const modeLabel = user.locale === "es"
          ? pending.mode === "personal" ? "personal" : pending.mode === "business" ? "empresarial" : "personal y empresarial"
          : pending.mode === "personal" ? "pessoal" : pending.mode === "business" ? "empresarial" : "pessoal e empresarial";
        await wppSend(from, user.locale === "es"
          ? `🗑️ Listo. Borré ${deleted} ${deleted === 1 ? "movimiento" : "movimientos"} del historial ${modeLabel}. Esta acción no se puede deshacer.`
          : `🗑️ Pronto. Apaguei ${deleted} lançamento${deleted === 1 ? "" : "s"} do histórico ${modeLabel}. Não tem como desfazer isso.`);
      } else {
        await wppSend(from, user.locale === "es"
          ? "De acuerdo, no borré nada. Si quieres intentarlo de nuevo, solo tienes que pedirlo."
          : "Ok, não apaguei nada. Se quiser tentar de novo, é só pedir.");
      }
      return;
    }

    // ── Seleção de lançamento financeiro (editar/excluir com múltiplos resultados) ──
    if (pending?.type === "finance_select" && pending.userId === user.id) {
      const hasPatch = !!(pending.patch && Object.keys(pending.patch).length > 0);

      // Já sabemos QUAIS lançamentos (etapa anterior já escolheu 1 ou
      // vários) e só falta o que mudar — interpreta a mensagem atual como o
      // novo valor/categoria, não como uma escolha de número, e aplica em
      // todos os candidatos guardados.
      if (pending.action === "edit" && !hasPatch && pending.awaitingPatch) {
        const patch = parseFinancePatchFromText(messageText);
        let changedAccountName: string | undefined;
        let changedEmployeeName: string | undefined;
        let clearedEmployee = false;
        const employeeEdit = getExplicitLastFinanceEmployeeEditResult(messageText);
        if (employeeEdit?.finance?.clearEmployee) {
          patch.employeeId = null;
          clearedEmployee = true;
        } else if (employeeEdit?.finance?.employeeName) {
          const matches = await findEmployeesByName(user.id, employeeEdit.finance.employeeName, "active");
          if (matches.length === 1) {
            patch.employeeId = matches[0].id;
            changedEmployeeName = matches[0].name;
          } else if (matches.length > 1) {
            await setPendingAction(from, {
              type: "finance_employee_select", userId: user.id,
              mode: pending.candidates[0]?.mode || mode, action: "edit_finances",
              financeIds: pending.candidates.map(candidate => candidate.id),
              employees: matches.map(employee => ({ id: employee.id, name: employee.name, role: employee.role })),
            });
            await wppSend(from, financeEmployeeSelectionMessage(matches, user.locale));
            return;
          } else {
            await setPendingAction(from, {
              type: "finance_employee_create", userId: user.id,
              mode: pending.candidates[0]?.mode || mode,
              employeeName: employeeEdit.finance.employeeName,
              financeIds: pending.candidates.map(candidate => candidate.id),
            });
            await wppSend(from, localized(user.locale,
              `👤 *${employeeEdit.finance.employeeName}* não está cadastrado(a). Qual é o salário para concluir o cadastro e vincular este pagamento?`,
              `👤 *${employeeEdit.finance.employeeName}* no está registrado(a). ¿Cuál es el salario para completar el registro y vincular este pago?`));
            return;
          }
        }
        const candidateModes = [...new Set(pending.candidates.map(candidate => candidate.mode))];
        if (candidateModes.length === 1) {
          const accountEdit = await resolveFinanceEditAccount(
            user.id,
            candidateModes[0] as FinanceMode,
            messageText,
          );
          if (accountEdit.account) {
            patch.accountId = accountEdit.account.id;
            patch.cardInvoiceId = null;
            changedAccountName = accountEdit.account.name;
          } else if (accountEdit.requested) {
            await setPendingAction(from, {
              ...pending,
              candidates: pending.candidates,
              awaitingPatch: true,
            });
            const choices = accountEdit.choices ?? [];
            await wppSend(from, localized(user.locale,
              `❓ Não encontrei essa conta. Contas disponíveis: *${choices.map(account => account.name).join(", ")}*.\n\nResponda, por exemplo: _"conta Inter"_.`,
              `❓ No encontré esa cuenta. Cuentas disponibles: *${choices.map(account => account.name).join(", ")}*.\n\nResponde, por ejemplo: _"cuenta Caja"_.`,
            ));
            return;
          }
        }
        if (Object.keys(patch).length === 0) {
          await wppSend(from, localized(user.locale,
            `❓ Não entendi o que alterar. Ex: _"80 reais"_, _"categoria Lazer"_ ou _"conta Inter"_`,
            `❓ No entendí qué quieres cambiar. Ej.: _"80 dólares"_, _"categoría Ocio"_ o _"cuenta Caja"_`,
          ));
          return;
        }
        await clearPendingAction(from);
        const updatedItems = [];
        for (const c of pending.candidates) {
          const updated = await updateFinance(c.id, user.id, patch as Parameters<typeof updateFinance>[2]);
          if (updated) updatedItems.push(updated);
        }
        if (updatedItems.length > 0) {
          const bal = await getBalance(user.id, updatedItems[0].mode as "personal" | "business", year, month);
          const modeLabel = updatedItems[0].mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
          if (updatedItems.length === 1) {
            const updated = updatedItems[0];
            await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}${changedAccountName ? `\n🏦 ${user.locale === "es" ? "Cuenta" : "Conta"}: *${changedAccountName}*` : ""}${employeeLinkLabel(changedEmployeeName, clearedEmployee, user.locale)}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
          } else {
            await wppSend(from, `✏️ *${updatedItems.length} lançamentos atualizados!*${changedAccountName ? `\n🏦 ${user.locale === "es" ? "Cuenta" : "Conta"}: *${changedAccountName}*` : ""}${employeeLinkLabel(changedEmployeeName, clearedEmployee, user.locale)}\n_(${modeLabel})_\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
          }
        } else await wppSend(from, localized(user.locale, "❌ Não consegui atualizar os lançamentos selecionados. Nada foi modificado; tente novamente.", "❌ No pude actualizar los movimientos seleccionados. No se modificó nada; inténtalo de nuevo."));
        return;
      }

      // Aceita número único ("5"), intervalo ("1 a 10", "1 ao 130"), lista
      // ("1, 2 e 5") ou "todos" — sempre separando "e"/"ou" além de vírgula
      // pra não confundir números que a pessoa quis dizer separadamente.
      const choiceIndices = parseFinanceChoiceMulti(messageText, pending.candidates);
      if (choiceIndices.length > 0) {
        const chosen = choiceIndices.map(i => pending.candidates[i]);

        // Editar mas ainda não sabemos o que mudar → guarda os escolhidos (1
        // ou vários) e pergunta o que muda em todos eles de uma vez.
        if (pending.action === "edit" && !hasPatch) {
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "edit",
            candidates: chosen,
            awaitingPatch: true,
          });
          if (chosen.length === 1) {
            const c = chosen[0];
            await wppSend(from, `🔍 Encontrei: *${c.description}* — ${formatCurrency(c.amount)} (${c.category}) · ${modeLabelFull(c.mode)}\n\nO que deseja alterar? Ex:\n• _"muda para 80 reais"_\n• _"muda categoria para Lazer"_\n• _"muda para a conta Inter"_`);
          } else {
            await wppSend(from, `🔍 Selecionados *${chosen.length} lançamentos*.\n\nO que deseja alterar em todos eles? Ex:\n• _"muda categoria para Lazer"_\n• _"marca como a receber"_`);
          }
          return;
        }

        await clearPendingAction(from);
        if (pending.action === "edit" && hasPatch) {
          const updatedItems = [];
          for (const c of chosen) {
            const updated = await updateFinance(c.id, user.id, pending.patch as Parameters<typeof updateFinance>[2]);
            if (updated) updatedItems.push(updated);
          }
          if (updatedItems.length > 0) {
            const bal = await getBalance(user.id, updatedItems[0].mode as "personal" | "business", year, month);
            const modeLabel = updatedItems[0].mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
            if (updatedItems.length === 1) {
              const updated = updatedItems[0];
              await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
            } else {
              await wppSend(from, `✏️ *${updatedItems.length} lançamentos atualizados!*\n_(${modeLabel})_\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
            }
          } else await wppSend(from, localized(user.locale, "❌ Não consegui atualizar os lançamentos selecionados. Nada foi modificado; tente novamente.", "❌ No pude actualizar los movimientos seleccionados. No se modificó nada; inténtalo de nuevo."));
        } else if (pending.action === "delete") {
          let deletedCount = 0;
          for (const c of chosen) {
            if (await deleteFinance(c.id, user.id)) deletedCount++;
          }
          if (deletedCount > 0) {
            const delBal = await getBalance(user.id, chosen[0].mode as "personal" | "business", year, month);
            const modeLabel = modeLabelFull(chosen[0].mode);
            if (chosen.length === 1) {
              const c = chosen[0];
              await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${c.description} — ${formatCurrency(c.amount)}\n📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
            } else {
              await wppSend(from, `🗑️ *${deletedCount} lançamentos excluídos!*\n_(${modeLabel})_\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
            }
          } else await wppSend(from, localized(user.locale, "❌ Não consegui excluir os lançamentos selecionados. Nada foi apagado; tente novamente.", "❌ No pude eliminar los movimientos seleccionados. No se borró nada; inténtalo de nuevo."));
        }
        return;
      }
      // Resposta não é um número/intervalo/data válido pra essa lista — em
      // vez de repetir a mesma pergunta pra sempre (a pessoa pode ter
      // desistido, corrigido o pedido, ou a busca nem era o que ela queria),
      // cancela essa seleção e deixa a mensagem seguir pro fluxo normal
      // (IA), em vez de travar quem responde qualquer coisa fora do formato.
      await clearPendingAction(from);
    }

    // ── Confirmação de Meet (sim/não) ──
    if (pending?.type === "meet_confirm" && pending.userId === user.id) {
      const lower = messageText.toLowerCase().trim();
      const yes = /^(?:sim|s|s[ií]|yes|y|1|quero|pode|ok|confirmar)\b/.test(lower);
      const no = /^(?:n[ãa]o|n|no|0|sem|cancela)\b/.test(lower);
      if (yes || no) {
        await clearPendingAction(from);
        const meetItems = pending.items?.length ? pending.items : [{
          title: pending.title, description: pending.description, startAt: pending.startAt,
          endAt: pending.endAt, attendees: pending.attendees,
        }];
        const connected = yes ? await isConnected(user.id) : false;
        if (yes && !connected) {
          await wppSend(from, user.locale === "es"
            ? "⚠️ Tu cuenta de Google no está conectada. Crearé la cita sin enlace de Meet."
            : user.locale === "pt-PT"
              ? "⚠️ A tua conta Google não está ligada. Vou criar o compromisso sem ligação do Meet."
              : "⚠️ Sua conta Google não está conectada. Criando o compromisso sem link Meet.");
        }
        const confirmations: string[] = [];
        let failedMeetLinks = 0;
        for (const item of meetItems) {
          let meetLink: string | undefined;
          let calendarEventId: string | undefined;
          let googleCalendarId: string | undefined;
          if (yes && connected) {
            try {
              const r = await createMeetEvent({ userId: user.id, ...item });
              meetLink = r.meetLink;
              calendarEventId = r.calendarEventId;
              googleCalendarId = r.googleCalendarId;
            } catch (e) {
              console.error("[meet_confirm]", e);
              failedMeetLinks++;
            }
          }
          const apt = await createAppointment({
            userId: user.id, title: item.title, description: item.description,
            startAt: item.startAt, endAt: item.endAt, allDay: false, repeat: "none",
            status: "scheduled", source: "whatsapp", meetLink, calendarEventId, googleCalendarId,
          });
          confirmations.push(replyMeetCreated(apt, undefined, user.locale));
          for (const attendee of item.attendees.filter(attendee => attendee.phone)) {
            await wppSend(attendee.phone!, replyMeetInvite(apt, attendee.name, user.locale));
          }
        }
        const failedMeetWarning = failedMeetLinks === 0 ? "" : user.locale === "es"
          ? `⚠️ No pude generar el enlace de Meet en ${failedMeetLinks === 1 ? "una reunión" : `${failedMeetLinks} reuniones`}; las citas sí quedaron creadas.`
          : user.locale === "pt-PT"
            ? `⚠️ Não consegui gerar a ligação do Meet em ${failedMeetLinks === 1 ? "uma reunião" : `${failedMeetLinks} reuniões`}; os compromissos ficaram criados.`
            : `⚠️ Não consegui gerar o link do Meet em ${failedMeetLinks === 1 ? "uma reunião" : `${failedMeetLinks} reuniões`}; os compromissos foram criados.`;
        await wppSend(from, [failedMeetWarning, confirmations.join("\n\n────────\n\n")].filter(Boolean).join("\n\n"));
      } else {
        await wppSend(from, user.locale === "es"
          ? "Responde *Sí* para incluir el enlace de Google Meet o *No* para crear solo la cita."
          : user.locale === "pt-PT"
            ? "Responde *Sim* para incluir a ligação do Google Meet ou *Não* para criar apenas o compromisso."
            : "Responda *Sim* para incluir o link do Google Meet ou *Não* para criar só o compromisso.");
      }
      return;
    }

    // ── Confirmação de recorrente/parcela (resposta ao lembrete das 20h) ──
    if (pending?.type === "recurring_confirmation" && pending.userId === user.id) {
      const lower = messageText.toLowerCase().trim();
      const isYes = /^(sim|s|foi|paguei|recebi|yes|pago|recebido|ok)\b/.test(lower);
      const isNo  = /^(n(ão|ao)?|ainda não|ainda nao|não paguei|nao paguei|nao|não)\b/.test(lower);
      if (isYes) {
        await clearPendingAction(from);
        const result = await confirmRecurring(pending.recurringId, user.id);
        if (result) {
          await wppSend(from, replyRecurringConfirmed(result.updated, user.locale));
        } else await wppSend(from, localized(user.locale, "❌ Não consegui confirmar esse pagamento agora. Nada foi alterado; tente novamente.", "❌ No pude confirmar este pago. No se modificó nada; inténtalo de nuevo."));
      } else if (isNo) {
        await clearPendingAction(from);
        await wppSend(from, localized(user.locale, "Ok! Quando quiser marcar como pago, acesse *Recorrentes* no dashboard. 👍", "De acuerdo. Cuando quieras marcarlo como pagado, abre *Recurrentes* en el panel. 👍"));
      } else {
        await wppSend(from, localized(user.locale,
          `Não entendi. Responda *sim* se ${pending.installmentNumber ? "a parcela foi paga" : "foi pago/recebido"} ou *não* para deixar pendente.`,
          `No entendí. Responde *sí* si ${pending.installmentNumber ? "pagaste la cuota" : "ya se pagó o recibió"}, o *no* para dejarlo pendiente.`,
        ));
      }
      return;
    }

    // ── Continuação de uma ação que ainda precisava de algum dado ──
    // Mantém a intenção e os campos já extraídos. Assim uma resposta curta
    // como "amanhã", "100 reais" ou "o arroz" conclui o pedido anterior.
    if (pending?.type === "action_continuation" && pending.userId === user.id) {
      if (isActionContinuationCancel(messageText)) {
        await clearPendingAction(from);
        await wppSend(from, user.locale === "es" ? "Acción cancelada; no cambié nada. 👍" : "Ação cancelada — não alterei nada. 👍");
        return;
      }
      await clearPendingAction(from);
      if (!isClearlyNewActionDuringContinuation(messageText)) {
        actionContinuation = {
          originalText: pending.originalText,
          answers: [...pending.answers, messageText],
          partial: pending.partial,
        };
        messageText = buildActionContinuationMessage(actionContinuation.originalText, actionContinuation.answers);
      }
      // Se for claramente outro comando, a pendência é abandonada e a
      // mensagem atual segue normalmente para o classificador.
    }

    // ── Preenchimento de campos faltantes (slot filling genérico) ──
    // Precisa estar depois de getPendingAction e antes de processMessage:
    // uma resposta como "12" ou "dia 10" nunca pode chegar ao classificador.
    if (pending?.type === "slot_fill" && pending.userId === user.id) {
      const out = await runSlotFillTurn(pending, messageText, { user, userId: user.id, phone: from, mode });
      if (out.reply) await wppSend(from, out.reply);
      if (!out.fallThrough) return;
      // fallThrough → usuário mudou de assunto; segue o turno normalmente com esta mensagem
    }

    // ── IA pausada (atendente respondendo manualmente pelo Inbox) ──
    if (await getAiPaused(from)) {
      console.log("[message-handler] IA pausada, não processa");
      return;
    }

    // Um pedido direto de aviso para um compromisso existente é totalmente
    // determinístico. Resolve antes da IA para que "me avisa uma hora antes
    // da reunião" nunca possa cair no intent genérico agenda_update.
    const directAppointmentReminder = parseAppointmentReminderRequest(messageText);
    if (directAppointmentReminder
      && isStandaloneAppointmentReminderRequest(messageText)
      && isAgendaReminderTarget(directAppointmentReminder, messageText)) {
      await wppSend(from, replyAgendaReminderPolicy(user.locale));
      return;
    }

    // ── Processa com IA ──
    // A mensagem atual já foi gravada em addMessage() acima (linha ~179),
    // então o histórico já vem com ela como último item — removemos antes
    // de passar pro classificador pra não duplicar com "Mensagem do
    // usuário" no prompt.
    const recentHistory = (await getHistory(from))
      .slice(-16, -1)
      .map(h => ({ role: h.role, content: h.type === "audio" && !h.content ? "[Áudio]" : h.content }));
    const classifiedAi = accountSelectionResume ?? employeeSelectionResume ?? await processMessage(messageText, { user, history: recentHistory });
    const ai = actionContinuation
      ? mergeActionContinuation(actionContinuation.partial, classifiedAi)
      : classifiedAi;

    // Reconhece também a forma natural "no Nubank"/"en Caja", sem exigir
    // que a pessoa diga a palavra conta. Os nomes vêm das próprias contas do
    // cliente, portanto não há uma lista fixa de bancos nem adivinhação.
    if (["finance_register", "finance_edit", "finance_query", "balance_query", "finance_detail"].includes(ai.intent)) {
      const accountMode = (ai.mode || ai.finance?.mode || mode) as FinanceMode;
      const hasHint = ai.account?.name || ai.account?.useContext || ai.finance?.accountHint || ai.finances?.some(item => item.accountHint);
      if (!hasHint) {
        const accounts = await getManualAccountsByUser(user.id, accountMode);
        const normalizedMessage = messageText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
        const named = accounts.filter(account => normalizedMessage.includes(account.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()));
        if (named.length === 1) {
          ai.account = { name: named[0].name, mode: accountMode };
          if (ai.finance) ai.finance.accountHint = named[0].name;
          if (ai.finances) ai.finances = ai.finances.map(item => ({ ...item, accountHint: named[0].name }));
        }
      }
    }
    console.log(`[bot] ${user.name} | intent=${ai.intent} | confidence=${ai.confidence} | mode=${mode}`);

    // A Agenda usa sempre seus dois avisos automáticos (2h e 15min). Pedidos
    // de antecedência para lembretes COMUNS continuam no intent reminder_set
    // e respeitam exatamente o intervalo solicitado.
    const appointmentReminderRequest = parseAppointmentReminderRequest(messageText);
    if (appointmentReminderRequest && isAgendaReminderTarget(appointmentReminderRequest, messageText)) {
      if (ai.intent === "agenda_create" || ai.intent === "meet_create") {
        if (ai.agendaData) ai.agendaData.reminderMinutesBefore = undefined;
        if (ai.agendaItems) ai.agendaItems = ai.agendaItems.map(item => ({ ...item, reminderMinutesBefore: undefined }));
      } else {
        await wppSend(from, replyAgendaReminderPolicy(user.locale));
        return;
      }
    }

    // Validação central antes de qualquer mutação: se uma ação ainda não tem
    // todos os dados indispensáveis, guarda o que já entendeu e pergunta só
    // o próximo campo. A resposta retoma a mesma intent no turno seguinte.
    const missingActionQuestion = getMissingActionQuestion(ai, user.locale, messageText);
    if (missingActionQuestion) {
      await setPendingAction(from, {
        type: "action_continuation",
        userId: user.id,
        intent: ai.intent,
        partial: ai,
        originalText: actionContinuation?.originalText ?? msg.text,
        answers: actionContinuation?.answers ?? [],
        mode,
      });
      const ttl = user.locale === "es"
        ? "⏱ _Válido durante 10 minutos. Responde *cancelar* para desistir._"
        : "⏱ _Válido por 10 min. Responda *cancelar* para desistir._";
      await wppSend(from, `${missingActionQuestion}\n\n${ttl}`);
      return;
    }

    // Confiança baixa — pede esclarecimento antes de agir. Consultas são
    // seguras para executar e devem responder diretamente; pedir "confirma"
    // para uma simples pergunta de saldo soa robótico e não cria valor.
    const isEditIntent = ai.intent === "finance_edit" || ai.intent === "finance_delete";
    const isReadOnlyIntent = [
      "finance_query", "finance_upcoming", "daily_summary", "weekly_summary", "balance_query", "finance_detail", "finance_analysis",
      "task_query", "reminder_list", "goal_query", "recurring_query", "agenda_list", "vehicle_query",
      "grocery_list_show", "grocery_spend_query", "grocery_price_compare", "grocery_store_ranking", "grocery_last_purchase_query",
      "grocery_history_query", "employee_list", "customer_list", "customer_query",
      "account_list", "web_search",
    ].includes(ai.intent);
    const shouldCollectMissingSlots = hasMissingSlotFields(ai, { user, userId: user.id, phone: from, mode });
    if (ai.confidence < 0.6 && ai.intent !== "unknown" && ai.intent !== "help" && !isEditIntent && !isReadOnlyIntent && !shouldCollectMissingSlots) {
      const details = ai.finance
        ? `💰 Valor: ${formatCurrency(ai.finance.amount)}\n🏷️ Categoria: ${ai.finance.category}\n📝 Descrição: ${ai.finance.description}`
        : ai.task
        ? `📌 Título: ${ai.task.title}`
        : ai.reminder
        ? `🔔 Mensagem: ${ai.reminder.message}`
        : "";
      await wppSend(from, replyLowConfidence(ai.intent, details, messageText, user.locale));
      return;
    }

    switch (ai.intent) {

      case "account_create": {
        const accountMode = (ai.account?.mode || ai.mode || mode) as FinanceMode;
        if (phoneAccess !== "both" && accountMode !== mode) { await wppSend(from, replyModeAccessDenied(mode, user.locale)); break; }
        const name = ai.account?.name?.trim();
        if (!name) {
          await setPendingAction(from, { type: "account_create_name", userId: user.id, mode: accountMode });
          await wppSend(from, accountNameQuestion(user.locale));
          break;
        }
        try {
          const previousAccounts = await getManualAccountsByUser(user.id, accountMode);
          const previousDefault = previousAccounts.find(account => account.isDefault) ?? previousAccounts[0];
          const created = await createAccount({ userId: user.id, mode: accountMode, name: cap(name), type: "bank" });
          const createdMessage = localized(user.locale,
            `✅ Conta *${created.name}* cadastrada em ${accountMode === "business" ? "Empresa" : "Pessoal"}.`,
            `✅ Cuenta *${created.name}* registrada en ${accountMode === "business" ? "Empresa" : "Personal"}.`);
          if (previousDefault && previousDefault.id !== created.id) {
            await setPendingAction(from, {
              type: "account_default_confirm",
              userId: user.id,
              mode: accountMode,
              currentAccountId: previousDefault.id,
              currentAccountName: previousDefault.name,
              newAccountId: created.id,
              newAccountName: created.name,
            });
            await wppSend(from, `${createdMessage}\n\n${accountDefaultConfirmationMessage(previousDefault.name, created.name, user.locale)}`);
          } else {
            await wppSend(from, `${createdMessage}\n⭐ ${user.locale === "es" ? "Esta es ahora tu cuenta predeterminada." : "Ela agora é sua conta padrão."}`);
          }
        } catch {
          await wppSend(from, localized(user.locale,
            `❌ Não consegui cadastrar *${name}*. Verifique se já existe uma conta com esse nome.`,
            `❌ No pude registrar *${name}*. Comprueba si ya existe una cuenta con ese nombre.`));
        }
        break;
      }

      case "account_list": {
        const accountMode = (ai.mode || mode) as FinanceMode;
        if (phoneAccess !== "both" && accountMode !== mode) { await wppSend(from, replyModeAccessDenied(mode, user.locale)); break; }
        const accounts = await getManualAccountsByUser(user.id, accountMode);
        const title = user.locale === "es" ? "🏦 *Tus cuentas*" : "🏦 *Suas contas*";
        await wppSend(from, `${title}\n_(${accountMode === "business" ? (user.locale === "es" ? "Empresa" : "Empresa") : (user.locale === "es" ? "Personal" : "Pessoal")})_\n\n${accounts.map((account, index) => `${listNumberLabel(index)} ${account.name}${account.isDefault ? " ⭐" : ""}`).join("\n")}`);
        break;
      }

      case "account_update":
      case "account_delete":
      case "account_set_default": {
        const accountMode = (ai.account?.mode || ai.mode || mode) as FinanceMode;
        if (phoneAccess !== "both" && accountMode !== mode) { await wppSend(from, replyModeAccessDenied(mode, user.locale)); break; }
        const resolved = await resolveAccountForAi(user.id, accountMode, ai, recentHistory);
        if (!resolved.account) {
          const choices = resolved.choices ?? [];
          if (choices.length) {
            await setPendingAction(from, {
              type: "account_selection", userId: user.id, mode: accountMode,
              action: "resume_ai", ai, originalText: messageText,
              accounts: choices.map(account => ({ id: account.id, name: account.name, type: account.type })),
            });
            await wppSend(from, accountSelectionMessage(choices, user.locale));
          }
          break;
        }
        const account = resolved.account;
        if (ai.intent === "account_update") {
          const updated = await updateAccount(account.id, user.id, { name: cap(ai.account?.newName?.trim() || "") });
          await wppSend(from, updated
            ? localized(user.locale, `✅ Conta renomeada para *${updated.name}*.`, `✅ Cuenta renombrada como *${updated.name}*.`)
            : localized(user.locale, "❌ Não consegui renomear essa conta.", "❌ No pude renombrar esa cuenta."));
        } else if (ai.intent === "account_set_default") {
          const ok = await setDefaultAccount(user.id, accountMode, account.id);
          await wppSend(from, ok
            ? localized(user.locale, `⭐ *${account.name}* agora é a conta padrão.`, `⭐ *${account.name}* ahora es la cuenta predeterminada.`)
            : localized(user.locale, "❌ Não consegui alterar a conta padrão.", "❌ No pude cambiar la cuenta predeterminada."));
        } else {
          if (account.name.toLocaleLowerCase() === "dinheiro") {
            await wppSend(from, localized(user.locale,
              "ℹ️ A conta *Dinheiro* é a carteira básica do Zelo e não pode ser excluída. Você pode renomeá-la.",
              "ℹ️ La cuenta *Dinheiro* es la cartera básica de Zelo y no se puede eliminar. Puedes renombrarla."));
            break;
          }
          await deleteAccount(account.id, user.id);
          await wppSend(from, localized(user.locale,
            `🗑️ Conta *${account.name}* excluída. Os lançamentos antigos continuam no histórico.`,
            `🗑️ Cuenta *${account.name}* eliminada. Los movimientos anteriores siguen en el historial.`));
        }
        break;
      }

      case "finance_register": {
        // Suporte a múltiplos lançamentos de uma vez (campo "finances") ou único ("finance")
        const financeItems = (ai.finances && ai.finances.length > 0)
          ? ai.finances
          : (ai.finance ? [ai.finance] : []);
        if (!financeItems.length) { await wppSend(from, replyUnknown(messageText, user.locale)); break; }

        const unauthorizedMode = phoneAccess !== "both"
          ? financeItems.find(item => item.mode && item.mode !== mode)?.mode
          : undefined;
        if (unauthorizedMode) {
          await wppSend(from, replyModeAccessDenied(mode, user.locale));
          break;
        }

        // Pagamentos na categoria Funcionários ficam vinculados à ficha do
        // colaborador. Com um único ativo a associação é automática; com mais
        // de um, pergunta e inclui a opção explícita "sem funcionário".
        const employeeItems = financeItems.filter(fd => isEmployeeFinanceData(fd) && fd.employeeId === undefined);
        if (employeeItems.length) {
          const activeEmployees = await getEmployeesByUser(user.id, "active");
          for (const fd of employeeItems) {
            if (fd.employeeName) {
              const matches = await findEmployeesByName(user.id, fd.employeeName, "active");
              if (matches.length === 1) {
                fd.employeeId = matches[0].id;
                fd.employeeName = matches[0].name;
                continue;
              }
              if (matches.length > 1) {
                await setPendingAction(from, {
                  type: "finance_employee_select", userId: user.id,
                  mode: (fd.mode || mode) as FinanceMode, action: "resume_ai",
                  ai, originalText: messageText,
                  employees: matches.map(employee => ({ id: employee.id, name: employee.name, role: employee.role })),
                });
                await wppSend(from, financeEmployeeSelectionMessage(matches, user.locale));
                return;
              }
            }
            if (activeEmployees.length === 1) {
              fd.employeeId = activeEmployees[0].id;
              fd.employeeName = activeEmployees[0].name;
              continue;
            }
            if (activeEmployees.length > 1) {
              await setPendingAction(from, {
                type: "finance_employee_select", userId: user.id,
                mode: (fd.mode || mode) as FinanceMode, action: "resume_ai",
                ai, originalText: messageText,
                employees: activeEmployees.map(employee => ({ id: employee.id, name: employee.name, role: employee.role })),
              });
              await wppSend(from, financeEmployeeSelectionMessage(activeEmployees, user.locale));
              return;
            }
            // Não há ninguém cadastrado: mantém o gasto válido e sem vínculo.
            fd.employeeId = null;
          }
        }

        // A conta é obrigatória para lançamentos novos. Uma única conta é
        // escolhida automaticamente; com várias, o cliente escolhe. O lote
        // inteiro só começa a ser gravado depois de todas as escolhas, para
        // evitar registros parciais.
        for (const fd of financeItems) {
          const financeMode = (fd.mode || mode) as FinanceMode;
          const requestAi: AIResult = {
            ...ai,
            account: fd.accountHint
              ? { name: fd.accountHint, mode: financeMode }
              : { ...(ai.account ?? {}), mode: financeMode },
          };
          const resolved = await resolveAccountForAi(user.id, financeMode, requestAi, recentHistory);
          if (resolved.account) {
            fd.accountHint = resolved.account.name;
            continue;
          }
          const choices = resolved.choices ?? [];
          if (choices.length) {
            await setPendingAction(from, {
              type: "account_selection", userId: user.id, mode: financeMode,
              action: "resume_ai", ai, originalText: messageText,
              accounts: choices.map(account => ({ id: account.id, name: account.name, type: account.type })),
            });
            await wppSend(from, accountSelectionMessage(choices, user.locale));
            return;
          }
        }

        const today = todayStrBR();

        if (financeItems.length === 1) {
          // Lançamento único
          const fd = financeItems[0];
          const financeMode = (fd.mode || mode) as "personal" | "business";
          const hasExplicitDate = !!fd.date;
          const financeDate = fd.date || today;
          const isPending = fd.pending === true || financeDate > today;
          // autoPost=false só quando a IA marcou "pending" (ex: "a receber") sem
          // nenhuma data — sem isso o cron posta sozinho no próximo tick, já que
          // financeDate cai em "hoje" (ver migração 20260830000000).
          const autoPost = !(fd.pending === true && !hasExplicitDate);
          const { accountId, cardInvoiceId } = await resolveAccountFields(user.id, financeMode, fd.accountHint);
          const f = await addFinance({
            userId: user.id, type: fd.type, amount: fd.amount,
            category: cap(fd.category) || "Outros", description: cap(fd.description),
            date: financeDate, mode: financeMode, source: "whatsapp",
            status: isPending ? "pending" : "posted", autoPost,
            registeredBy: from, accountId, cardInvoiceId, employeeId: fd.employeeId ?? undefined,
          });
          await setLastFinanceBatch(from, [{ id: f.id, description: f.description, amount: f.amount, type: f.type }], financeMode);
          const bal = await getBalance(user.id, financeMode, year, month);
          const modeSuffix = ` _(${financeMode === "business" ? "🏢 Empresa" : "👤 Pessoal"})_`;
          const typeLabel = fd.type === "income" ? "Receita" : "Despesa";
          const typeEmoji = fd.type === "income" ? "💰" : "💸";
          if (isPending && autoPost) {
            const dtFormatted = new Date(financeDate + "T12:00:00").toLocaleDateString("pt-BR");
            await wppSend(from, `⏳ *${typeLabel} agendada!*${modeSuffix}\n\n${typeEmoji} ${f.description} — ${formatCurrency(f.amount)}\n🏷️ ${f.category}\n🏦 Conta: *${fd.accountHint}*\n📅 Será contabilizada em *${dtFormatted}*\n\n_Lançamentos futuros não entram no saldo até a data chegar._`);
          } else if (isPending) {
            const label = fd.type === "income" ? "a receber" : "a pagar";
            await wppSend(from, `⏳ *Marcado como ${label}!*${modeSuffix}\n\n${typeEmoji} ${f.description} — ${formatCurrency(f.amount)}\n🏷️ ${f.category}\n🏦 Conta: *${fd.accountHint}*\n\n_Não entra no saldo. Quando ${fd.type === "income" ? "cair" : "for pago"}, me avisa (ex: "recebi o ${f.description}") que eu confirmo._`);
          } else {
            await wppSend(from, `${replyFinanceRegistered(f, bal.balance, user.locale)}\n🏦 ${user.locale === "es" ? "Cuenta" : "Conta"}: *${fd.accountHint}*${employeeLinkLabel(fd.employeeName, fd.employeeId === null, user.locale)}`);
          }
        } else {
          // Múltiplos lançamentos — registra todos e exibe resumo
          const registered: Array<Awaited<ReturnType<typeof addFinance>> & { pending: boolean; autoPost: boolean; accountName: string; employeeName?: string }> = [];
          for (const fd of financeItems) {
            const financeMode = (fd.mode || mode) as "personal" | "business";
            const hasExplicitDate = !!fd.date;
            const financeDate = fd.date || today;
            const isPending = fd.pending === true || financeDate > today;
            const autoPost = !(fd.pending === true && !hasExplicitDate);
            const { accountId, cardInvoiceId } = await resolveAccountFields(user.id, financeMode, fd.accountHint);
            const f = await addFinance({
              userId: user.id, type: fd.type, amount: fd.amount,
              category: cap(fd.category) || "Outros", description: cap(fd.description),
              date: financeDate, mode: financeMode, source: "whatsapp",
              status: isPending ? "pending" : "posted", autoPost,
              registeredBy: from, accountId, cardInvoiceId, employeeId: fd.employeeId ?? undefined,
            });
            registered.push({ ...f, pending: isPending, autoPost, accountName: fd.accountHint ?? "Dinheiro", employeeName: fd.employeeName });
          }
          const primaryMode = (financeItems[0].mode || mode) as "personal" | "business";
          await setLastFinanceBatch(from, registered.map(f => ({ id: f.id, description: f.description, amount: f.amount, type: f.type })), primaryMode);
          const bal = await getBalance(user.id, primaryMode, year, month);
          const posted = registered.filter(f => !f.pending);
          const scheduled = registered.filter(f => f.pending && f.autoPost);
          const receivable = registered.filter(f => f.pending && !f.autoPost);
          const totalIncome = posted.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
          const totalExpense = posted.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
          const modeLabel = primaryMode === "business" ? "🏢 Empresa" : "👤 Pessoal";
          let msg = `✅ *${registered.length} lançamentos registrados!*\n_(${modeLabel})_\n\n`;
          for (const f of posted) {
            const emoji = f.type === "income" ? "💰" : "💸";
            msg += `${emoji} ${f.description} — ${formatCurrency(f.amount)} · 🏦 ${f.accountName}${f.employeeName ? ` · 👥 ${f.employeeName}` : ""}\n`;
          }
          if (scheduled.length > 0) {
            msg += `\n⏳ *Agendados (data futura):*\n`;
            for (const f of scheduled) {
              const emoji = f.type === "income" ? "💰" : "💸";
              const dt = new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR");
              msg += `${emoji} ${f.description} — ${formatCurrency(f.amount)} _(${dt})_\n`;
            }
          }
          if (receivable.length > 0) {
            msg += `\n⏳ *A receber/a pagar (sem previsão, não entra no saldo):*\n`;
            for (const f of receivable) {
              const emoji = f.type === "income" ? "💰" : "💸";
              msg += `${emoji} ${f.description} — ${formatCurrency(f.amount)}\n`;
            }
            msg += `_Me avisa quando cada um cair/for pago que eu confirmo._\n`;
          }
          if (totalIncome > 0) msg += `\n💰 *Total receitas: ${formatCurrency(totalIncome)}*`;
          if (totalExpense > 0) msg += `\n💸 *Total despesas: ${formatCurrency(totalExpense)}*`;
          msg += `\n${bal.balance >= 0 ? "📈" : "📉"} *Saldo ${modeLabel}: ${formatCurrency(bal.balance)}*`;
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "finance_edit": {
        const keyword = ai.keyword || ai.finance?.description || ai.finance?.category || "";
        console.log(`[bot] finance_edit keyword="${keyword}" hasAmount=${!!ai.finance?.amount} hasCategory=${!!ai.finance?.category}`);
        const lastBatch = ai.lastFinanceReference ? await getLastFinanceBatch(from) : null;

        const editPatch: Record<string, unknown> = {};
        if (ai.finance?.amount && ai.finance.amount > 0) editPatch.amount = ai.finance.amount;
        if (ai.finance?.category) editPatch.category = ai.finance.category;
        if (ai.finance?.date) editPatch.date = ai.finance.date;
        if (ai.finance?.type) editPatch.type = ai.finance.type;
        const destinationMode = ai.finance?.newMode || parseFinanceDestinationMode(messageText);
        if (destinationMode) editPatch.mode = destinationMode;
        if (ai.newDescription) editPatch.description = ai.newDescription;
        // Correção "isso na verdade é a receber/a pagar" num lançamento já
        // contabilizado — tira do saldo sem apagar (mesma regra de
        // autoPost do finance_register: sem data nova, não posta sozinho).
        if (ai.finance?.pending === true) {
          editPatch.status = "pending";
          editPatch.autoPost = !!ai.finance.date;
        }

        // Troca/removal do colaborador do último lançamento. Se o nome novo
        // ainda não existe, não inventa um vínculo: coleta o salário, cadastra
        // a pessoa e só então conclui a correção.
        let changedEmployeeName: string | undefined;
        let clearedEmployee = false;
        if (ai.finance?.clearEmployee) {
          editPatch.employeeId = null;
          clearedEmployee = true;
        } else if (ai.finance?.employeeName) {
          const matches = await findEmployeesByName(user.id, ai.finance.employeeName, "active");
          const targetIds = ai.lastFinanceReference && lastBatch?.items.length
            ? (ai.lastFinanceReference === "batch" ? lastBatch.items : [lastBatch.items[lastBatch.items.length - 1]]).map(item => item.id)
            : [];
          if (matches.length === 1) {
            editPatch.employeeId = matches[0].id;
            changedEmployeeName = matches[0].name;
          } else if (matches.length > 1 && targetIds.length) {
            await setPendingAction(from, {
              type: "finance_employee_select", userId: user.id,
              mode: (lastBatch?.mode || mode) as FinanceMode, action: "edit_finances",
              financeIds: targetIds,
              employees: matches.map(employee => ({ id: employee.id, name: employee.name, role: employee.role })),
            });
            await wppSend(from, financeEmployeeSelectionMessage(matches, user.locale));
            break;
          } else if (targetIds.length) {
            await setPendingAction(from, {
              type: "finance_employee_create", userId: user.id,
              mode: (lastBatch?.mode || mode) as FinanceMode,
              employeeName: ai.finance.employeeName, financeIds: targetIds,
            });
            await wppSend(from, localized(user.locale,
              `👤 *${ai.finance.employeeName}* não está cadastrado(a). Para cadastrar e vincular este pagamento, qual é o salário?\n\n_Responda o valor ou *cancelar*._`,
              `👤 *${ai.finance.employeeName}* no está registrado(a). Para registrarlo y vincular este pago, ¿cuál es el salario?\n\n_Responde el importe o *cancelar*._`));
            break;
          }
        }

        // Conta manual é uma dimensão editável do lançamento, assim como
        // valor e categoria. A referência ao último lançamento fornece o
        // modo correto sem precisar listar o mês nem pedir qual item é.
        const requestedAccount = ai.finance?.accountHint
          || ai.account?.name
          || getFinanceAccountDestinationHint(messageText)
          || undefined;
        let changedAccountName: string | undefined;
        if (requestedAccount) {
          const accountMode = (lastBatch?.mode || ai.finance?.mode || ai.mode || mode) as FinanceMode;
          const accountEdit = await resolveFinanceEditAccount(user.id, accountMode, messageText, requestedAccount);
          if (accountEdit.account) {
            editPatch.accountId = accountEdit.account.id;
            // Cartões não são mais oferecidos. Ao mover para uma conta
            // manual, remove qualquer associação antiga com fatura.
            editPatch.cardInvoiceId = null;
            changedAccountName = accountEdit.account.name;
          } else {
            const choices = accountEdit.choices ?? [];
            if (choices.length) {
              const resumeAi: AIResult = {
                ...ai,
                finance: { ...(ai.finance ?? {}), accountHint: requestedAccount } as NonNullable<AIResult["finance"]>,
                account: { ...(ai.account ?? {}), name: requestedAccount, mode: accountMode },
              };
              await setPendingAction(from, {
                type: "account_selection", userId: user.id, mode: accountMode,
                action: "resume_ai", ai: resumeAi, originalText: messageText,
                accounts: choices.map(account => ({ id: account.id, name: account.name, type: account.type })),
              });
              await wppSend(from, accountSelectionMessage(choices, user.locale));
              break;
            }
          }
        }

        // "esse último" é uma referência completa: aplica direto no item
        // mais recente. Só altera o lote inteiro quando a pessoa usar plural.
        if (ai.lastFinanceReference && lastBatch?.items.length && Object.keys(editPatch).length > 0) {
          const targets = ai.lastFinanceReference === "batch"
            ? lastBatch.items
            : [lastBatch.items[lastBatch.items.length - 1]];
          const updatedItems = [];
          for (const item of targets) {
            const updated = await updateFinance(item.id, user.id, editPatch as Parameters<typeof updateFinance>[2]);
            if (updated) updatedItems.push(updated);
          }
          if (updatedItems.length > 0) {
            const updatedMode = updatedItems[0].mode as "personal" | "business";
            const bal = await getBalance(user.id, updatedMode, year, month);
            const modeLabel = updatedMode === "business" ? "🏢 Empresa" : "👤 Pessoal";
            if (updatedItems.length === 1) {
              const updated = updatedItems[0];
              await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}${changedAccountName ? `\n🏦 ${user.locale === "es" ? "Cuenta" : "Conta"}: *${changedAccountName}*` : ""}${employeeLinkLabel(changedEmployeeName, clearedEmployee, user.locale)}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
            } else {
              await wppSend(from, `✏️ *${updatedItems.length} lançamentos atualizados!*${changedAccountName ? `\n🏦 ${user.locale === "es" ? "Cuenta" : "Conta"}: *${changedAccountName}*` : ""}${employeeLinkLabel(changedEmployeeName, clearedEmployee, user.locale)}\n_(${modeLabel})_\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
            }
          } else {
            await wppSend(from, localized(user.locale,
              "❌ Não consegui atualizar o último lançamento. Nada foi modificado; tente novamente.",
              "❌ No pude actualizar el último movimiento. No se modificó nada; inténtalo de nuevo.",
            ));
          }
          break;
        }

        // Correção curta e genérica ("tá errado, são despesas") logo depois
        // de um registro — corrige TODOS os lançamentos daquele registro
        // (1 ou vários) de uma vez, sem precisar buscar por nome.
        if (ai.bulkCorrectLastBatch && Object.keys(editPatch).length > 0) {
          const bulkBatch = lastBatch ?? await getLastFinanceBatch(from);
          if (bulkBatch && bulkBatch.items.length > 0) {
            const updatedItems = [];
            for (const item of bulkBatch.items) {
              const updated = await updateFinance(item.id, user.id, editPatch as Parameters<typeof updateFinance>[2]);
              if (updated) updatedItems.push(updated);
            }
            if (updatedItems.length > 0) {
              const bal = await getBalance(user.id, bulkBatch.mode, year, month);
              const modeLabel = bulkBatch.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
              if (updatedItems.length === 1) {
                const updated = updatedItems[0];
                await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}${changedAccountName ? `\n🏦 ${user.locale === "es" ? "Cuenta" : "Conta"}: *${changedAccountName}*` : ""}${employeeLinkLabel(changedEmployeeName, clearedEmployee, user.locale)}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
              } else {
                await wppSend(from, `✏️ *${updatedItems.length} lançamentos corrigidos!*${changedAccountName ? `\n🏦 ${user.locale === "es" ? "Cuenta" : "Conta"}: *${changedAccountName}*` : ""}${employeeLinkLabel(changedEmployeeName, clearedEmployee, user.locale)}\n_(${modeLabel})_\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
              }
            } else await wppSend(from, "❌ Não consegui corrigir os últimos lançamentos. Nada foi modificado; tente novamente.");
            break;
          }
          // Sem lote recente pra corrigir (expirou ou não achou) — cai no
          // fluxo normal abaixo (busca por keyword / lista do mês).
        }

        // Busca em TODOS os modos (null) para não perder lançamentos de outro modo
        let editCandidates = keyword ? await findFinanceByDescription(user.id, null, keyword) : [];
        // Fallback: tenta buscar sem acentos e sem espaços extras
        if (keyword && !editCandidates.length) {
          const normalizedKeyword = keyword.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
          editCandidates = await findFinanceByDescription(user.id, null, normalizedKeyword);
        }
        console.log(`[bot] finance_edit encontrados por palavra-chave=${editCandidates.length}`);

        // Achou exatamente 1 pela palavra-chave e já sabemos o que mudar → aplica direto
        if (keyword && editCandidates.length === 1 && Object.keys(editPatch).length > 0) {
          const editTarget = editCandidates[0];
          const updated = await updateFinance(editTarget.id, user.id, editPatch as Parameters<typeof updateFinance>[2]);
          if (updated) {
            const bal = await getBalance(user.id, updated.mode as "personal" | "business", year, month);
            const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
            await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
          } else await wppSend(from, "❌ Não consegui atualizar esse lançamento agora. Nada foi modificado; tente novamente.");
          break;
        }

        // Achou exatamente 1 pela palavra-chave mas ainda não sabemos o que mudar
        if (keyword && editCandidates.length === 1) {
          const editTarget = editCandidates[0];
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "edit",
            candidates: [{ id: editTarget.id, description: editTarget.description, amount: editTarget.amount, date: editTarget.date, category: editTarget.category, mode: editTarget.mode }],
            awaitingPatch: true,
          });
          await wppSend(from, `🔍 Encontrei: *${editTarget.description}* — ${formatCurrency(editTarget.amount)} (${editTarget.category}) · ${modeLabelFull(editTarget.mode)}\n\nO que deseja alterar? Ex:\n• _"muda para 80 reais"_\n• _"muda categoria para Lazer"_`);
          break;
        }

        // Palavra-chave achou vários → deixa escolher entre eles
        if (editCandidates.length > 1) {
          const list = editCandidates.map((c, i) =>
            `${listNumberLabel(i)} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
          ).join("\n");
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "edit",
            candidates: editCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
            patch: editPatch,
          });
          await wppSend(from, `✏️ Encontrei *${editCandidates.length} lançamentos* com *"${keyword}"*:\n\n${list}\n\nQual deles deseja alterar? Responda com o número, um intervalo (ex: *1 a 10*), vários (ex: *1, 2 e 5*), *todos*, ou a data (ex: *04/07*).`);
          break;
        }

        // Sem palavra-chave, ou palavra-chave não achou nada → lista todos os
        // lançamentos do mês vigente pra escolher, em vez de um beco sem saída
        const [editMonthFrom, editMonthTo] = monthBounds(year, month);
        const recentCandidates = await getFinancesInRange(user.id, undefined, editMonthFrom, editMonthTo);
        if (!recentCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento esse mês${keyword ? ` com *"${keyword}"*` : ""}.\n\nDigite *extrato* para ver os lançamentos.`);
          break;
        }
        const recentList = recentCandidates.map((c, i) =>
          `${listNumberLabel(i)} ${c.type === "income" ? "💰" : "💸"} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
        ).join("\n");
        await setPendingAction(from, {
          type: "finance_select", userId: user.id,
          action: "edit",
          candidates: recentCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
          patch: editPatch,
        });
        await wppSend(from, `✏️ ${keyword ? `Não encontrei nada com *"${keyword}"*, mas aqui` : "Aqui"} estão os lançamentos desse mês:\n\n${recentList}\n\nQual deles deseja alterar? Responda com o número, um intervalo (ex: *1 a 10*), vários (ex: *1, 2 e 5*), *todos*, ou a data (ex: *04/07*).`);
        break;
      }

      case "finance_delete": {
        const delKeyword = ai.keyword || ai.finance?.description || ai.finance?.category || "";
        console.log(`[bot] finance_delete keyword="${delKeyword}"`);

        // Pedido curto e genérico ("apaga isso", "apaga esses lançamentos")
        // logo depois de um registro — apaga TODOS os lançamentos daquele
        // registro (1 ou vários) de uma vez, sem precisar buscar por nome.
        if (ai.bulkCorrectLastBatch) {
          const lastBatch = await getLastFinanceBatch(from);
          if (lastBatch && lastBatch.items.length > 0) {
            let deletedCount = 0;
            for (const item of lastBatch.items) {
              if (await deleteFinance(item.id, user.id)) deletedCount++;
            }
            if (deletedCount > 0) {
              const delBal = await getBalance(user.id, lastBatch.mode, year, month);
              const modeLabel = lastBatch.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
              if (lastBatch.items.length === 1) {
                const item = lastBatch.items[0];
                await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${item.description} — ${formatCurrency(item.amount)}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
              } else {
                await wppSend(from, `🗑️ *${deletedCount} lançamentos excluídos!*\n_(${modeLabel})_\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
              }
            } else await wppSend(from, "❌ Não consegui excluir os últimos lançamentos. Nada foi apagado; tente novamente.");
            break;
          }
          // Sem lote recente pra apagar (expirou ou não achou) — cai no
          // fluxo normal abaixo (busca por keyword / lista do mês).
        }

        const delCandidates = delKeyword ? await findFinanceByDescription(user.id, null, delKeyword) : [];
        console.log(`[bot] finance_delete encontrados por palavra-chave=${delCandidates.length}`);

        // Achou exatamente 1 pela palavra-chave → exclui direto (fluxo rápido)
        if (delKeyword && delCandidates.length === 1) {
          const delTarget = delCandidates[0];
          const delOk = await deleteFinance(delTarget.id, user.id);
          if (delOk) {
            const delBal = await getBalance(user.id, delTarget.mode as "personal" | "business", year, month);
            await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${delTarget.description} — ${formatCurrency(delTarget.amount)}\n📅 ${new Date(delTarget.date + "T12:00:00").toLocaleDateString("pt-BR")}\n${modeLabelFull(delTarget.mode)}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
          } else await wppSend(from, "❌ Não consegui excluir esse lançamento agora. Nada foi apagado; tente novamente.");
          break;
        }

        // Palavra-chave achou vários → deixa escolher entre eles
        if (delCandidates.length > 1) {
          const delList = delCandidates.map((c, i) =>
            `${listNumberLabel(i)} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
          ).join("\n");
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "delete",
            candidates: delCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
          });
          await wppSend(from, `🗑️ Encontrei *${delCandidates.length} lançamentos* com *"${delKeyword}"*:\n\n${delList}\n\nQual deles deseja excluir? Responda com o número, um intervalo (ex: *1 a 10*), vários (ex: *1, 2 e 5*), *todos*, ou a data (ex: *04/07*).`);
          break;
        }

        // Sem palavra-chave, ou palavra-chave não achou nada → lista todos os
        // lançamentos do mês vigente pra escolher, em vez de um beco sem saída
        const [delMonthFrom, delMonthTo] = monthBounds(year, month);
        const recentCandidates = await getFinancesInRange(user.id, undefined, delMonthFrom, delMonthTo);
        if (!recentCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento esse mês${delKeyword ? ` com *"${delKeyword}"*` : ""}.\n\nDigite *extrato* para ver os lançamentos.`);
          break;
        }
        const recentList = recentCandidates.map((c, i) =>
          `${listNumberLabel(i)} ${c.type === "income" ? "💰" : "💸"} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
        ).join("\n");
        await setPendingAction(from, {
          type: "finance_select", userId: user.id,
          action: "delete",
          candidates: recentCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
        });
        await wppSend(from, `🗑️ ${delKeyword ? `Não encontrei nada com *"${delKeyword}"*, mas aqui` : "Aqui"} estão os lançamentos desse mês:\n\n${recentList}\n\nQual deles deseja excluir? Responda com o número, um intervalo (ex: *1 a 10*), vários (ex: *1, 2 e 5*), *todos*, ou a data (ex: *04/07*).`);
        break;
      }

      case "finance_analysis": {
        const [aFrom, aTo] = ai.period?.from || ai.period?.to
          ? [ai.period.from, ai.period.to]
          : monthBounds(year, month);
        const expCats = await getByCategoryInRange(user.id, mode, "expense", aFrom, aTo);
        const incCats = await getByCategoryInRange(user.id, mode, "income", aFrom, aTo);
        const analysisBal = await getBalanceInRange(user.id, mode, aFrom, aTo);
        const topExpenses = Object.entries(expCats)
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 6);
        const topIncomes = Object.entries(incCats)
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 4);
        const monthLabel = periodLabelFor(ai.period, now);
        const analysisReply = await generateAnalysisResponse(messageText, {
          mode, balance: analysisBal, topExpenses, topIncomes, month: monthLabel,
        }, user.locale);
        await wppSend(from, analysisReply);
        break;
      }

      case "finance_confirm_pending": {
        const pendKeyword = ai.keyword || "";
        if (!pendKeyword) { await wppSend(from, "❓ Qual lançamento agendado deseja confirmar?"); break; }
        const lower = pendKeyword.toLowerCase();
        const pendingItems = (await getPendingFinances(user.id)).filter(f => f.description.toLowerCase().includes(lower));
        if (!pendingItems.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento agendado com *"${pendKeyword}"*.`);
          break;
        }
        const target = pendingItems[0];
        const confirmed = await updateFinance(target.id, user.id, { status: "posted" });
        if (confirmed) {
          const bal = await getBalance(user.id, confirmed.mode, year, month);
          await wppSend(from, `✅ Confirmado antes da data.\n\n📝 ${confirmed.description}\n💰 ${formatCurrency(confirmed.amount)}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
        }
        break;
      }

      case "finance_detail": {
        try {
          const detailMode = (ai.mode as "personal" | "business" | undefined) || mode;
          if (phoneAccess !== "both" && detailMode !== mode) { await wppSend(from, replyModeAccessDenied(mode, user.locale)); break; }
          const isIncome = ai.financeType === "income";
          const targetType = isIncome ? "income" : "expense";

          const [defaultFrom, defaultTo] = monthBounds(year, month);
          const dFrom = ai.period?.from ?? defaultFrom;
          const dTo = ai.period?.to ?? defaultTo;
          let accountFilter: Account | undefined;
          if (ai.account) {
            const resolved = await resolveAccountForAi(user.id, detailMode, ai, recentHistory);
            if (!resolved.account) {
              const choices = resolved.choices ?? [];
              if (choices.length) {
                await setPendingAction(from, {
                  type: "account_selection", userId: user.id, mode: detailMode,
                  action: "resume_ai", ai, originalText: messageText,
                  accounts: choices.map(account => ({ id: account.id, name: account.name, type: account.type })),
                });
                await wppSend(from, accountSelectionMessage(choices, user.locale));
              }
              break;
            }
            accountFilter = resolved.account;
          }
          const [transactions, pendingFinances, recurringTransactions] = await Promise.all([
            accountFilter
              ? getAccountTransactionsInRange(user.id, detailMode, accountFilter.id, dFrom, dTo)
              : getTransactionsInRange(user.id, detailMode, dFrom, dTo),
            getPendingFinances(user.id, detailMode),
            getRecurringByUser(user.id, detailMode, "active"),
          ]);
          const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const keywordTerms = ai.keyword ? expandMerchantAliases(ai.keyword).map(normalize) : [];
          const matchesKeyword = (description: string, category?: string) => !keywordTerms.length
            || keywordTerms.some(term => normalize(description).includes(term) || normalize(category ?? "").includes(term));
          const txList = transactions.filter(item =>
            item.type === targetType
            && Number.isFinite(item.amount)
            && item.amount > 0
            && matchesKeyword(item.description, item.category)
          );
          const upcoming = collectUpcomingFinanceItems(
            accountFilter ? pendingFinances.filter(item => item.accountId === accountFilter.id) : pendingFinances,
            accountFilter ? [] : recurringTransactions,
            {
            from: dFrom,
            to: dTo,
            mode: detailMode,
            includeUndated: true,
          }).filter(item => item.type === targetType && matchesKeyword(item.description));
          const finalMsg = replyFinanceDetail(txList, upcoming, {
            type: targetType,
            mode: detailMode,
            periodLabel: periodLabelFor(ai.period, now, user.locale),
            locale: user.locale,
            keyword: ai.keyword,
          });
          const withAccount = accountFilter
            ? `${user.locale === "es" ? "🏦 Cuenta" : "🏦 Conta"}: *${accountFilter.name}*\n\n${finalMsg}`
            : finalMsg;
          await wppSend(from, withAccount.length > 4000 ? withAccount.slice(0, 3950) + "\n\n_(lista truncada — veja o restante no dashboard)_" : withAccount);
        } catch (detailErr) {
          console.error("[finance_detail]", detailErr);
          await wppSend(from, "❌ Não consegui gerar o extrato. Tente novamente.");
        }
        break;
      }

      case "daily_summary":
      case "weekly_summary": {
        const requestedMode = ai.mode as FinanceMode | undefined;
        if (phoneAccess !== "both" && requestedMode && requestedMode !== mode) {
          await wppSend(from, replyModeAccessDenied(mode, user.locale));
          break;
        }

        const queryMode = phoneAccess === "both" ? requestedMode : mode;
        const today = todayStrBR();
        const defaultPeriod: [string, string] = ai.intent === "daily_summary"
          ? [today, today]
          : weekBoundsBR(now);
        const periodFrom = ai.period?.from || defaultPeriod[0];
        const periodTo = ai.period?.to || defaultPeriod[1];
        // Num resumo em andamento interessam os compromissos que ainda vão
        // acontecer. Resumos de períodos passados mantêm o intervalo inteiro.
        const appointmentFrom = periodFrom < today && periodTo >= today ? today : periodFrom;

        const [pendingFinances, recurringTransactions, appointments, allTasks] = await Promise.all([
          getPendingFinances(user.id, queryMode),
          getRecurringByUser(user.id, queryMode, "active"),
          getAppointmentsInRange(user.id, appointmentFrom, periodTo),
          getPendingTasks(user.id, queryMode),
        ]);
        const upcomingItems = collectUpcomingFinanceItems(pendingFinances, recurringTransactions, {
          from: periodFrom,
          to: periodTo,
          mode: queryMode,
          includeUndated: ai.intent === "weekly_summary",
        });
        const summaryTasks = allTasks.filter(task => {
          if (!task.dueDate) return ai.intent === "weekly_summary";
          // Mantém atrasadas visíveis e inclui tudo que vence no período.
          return task.dueDate < today || (task.dueDate >= periodFrom && task.dueDate <= periodTo);
        });

        const forecastModes: FinanceMode[] = queryMode ? [queryMode] : ["personal", "business"];
        const balanceThrough = periodTo < today ? periodTo : today;
        const forecasts = await Promise.all(forecastModes.map(async forecastMode => {
          const current = periodFrom <= balanceThrough
            ? await getBalanceInRange(user.id, forecastMode, periodFrom, balanceThrough)
            : { income: 0, expense: 0, balance: 0 };
          return buildBalanceForecast(forecastMode, current.balance, upcomingItems);
        }));

        const dateLocale = user.locale === "es" ? "es-419" : user.locale === "pt-PT" ? "pt-PT" : "pt-BR";
        const summaryPeriodLabel = periodFrom === periodTo
          ? new Date(`${periodFrom}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
          : periodLabelFor({ from: periodFrom, to: periodTo }, now, user.locale);
        await wppSend(from, replyAdvisorSummary(
          ai.intent === "daily_summary" ? "daily" : "weekly",
          summaryPeriodLabel,
          appointments,
          summaryTasks,
          upcomingItems,
          forecasts,
          today,
          user.locale,
        ));
        break;
      }

      case "finance_upcoming": {
        const requestedMode = ai.mode as FinanceMode | undefined;
        if (phoneAccess !== "both" && requestedMode && requestedMode !== mode) {
          await wppSend(from, replyModeAccessDenied(mode, user.locale));
          break;
        }

        // Quem tem acesso aos dois modos vê a visão completa quando não
        // especifica "pessoal" ou "empresa". Em número restrito, a consulta
        // nunca atravessa a permissão daquele WhatsApp.
        const queryMode = phoneAccess === "both" ? requestedMode : mode;
        const [defaultFrom, defaultTo] = monthBounds(year, month);
        const periodFrom = ai.period?.from || defaultFrom;
        const periodTo = ai.period?.to || defaultTo;
        const today = todayStrBR();

        const [pendingFinances, recurringTransactions] = await Promise.all([
          getPendingFinances(user.id, queryMode),
          getRecurringByUser(user.id, queryMode, "active"),
        ]);
        const upcomingItems = collectUpcomingFinanceItems(pendingFinances, recurringTransactions, {
          // Inclui atrasadas ainda pendentes dentro do período; uma conta
          // vencida continua sendo algo que o cliente precisa pagar.
          from: periodFrom,
          to: periodTo,
          mode: queryMode,
          includeUndated: true,
        });

        const forecastModes: FinanceMode[] = queryMode ? [queryMode] : ["personal", "business"];
        const balanceThrough = periodTo < today ? periodTo : today;
        const forecasts = await Promise.all(forecastModes.map(async forecastMode => {
          const current = periodFrom <= balanceThrough
            ? await getBalanceInRange(user.id, forecastMode, periodFrom, balanceThrough)
            : { income: 0, expense: 0, balance: 0 };
          return buildBalanceForecast(forecastMode, current.balance, upcomingItems);
        }));

        await wppSend(from, replyUpcomingFinances(
          upcomingItems,
          ai.financeType === "income" ? "income" : "expense",
          forecasts,
          periodLabelFor(ai.period, now, user.locale),
          today,
          user.locale,
        ));
        break;
      }

      case "finance_query":
      case "balance_query": {
        const [pFrom, pTo] = ai.period?.from || ai.period?.to
          ? [ai.period.from, ai.period.to]
          : monthBounds(year, month);
        const periodLabel = periodLabelFor(ai.period, now);
        const queryMode = (ai.mode as FinanceMode | undefined) || mode;
        if (phoneAccess !== "both" && queryMode !== mode) { await wppSend(from, replyModeAccessDenied(mode, user.locale)); break; }
        let accountFilter: Account | undefined;
        let accountTransactions: Awaited<ReturnType<typeof getAccountTransactionsInRange>> | undefined;
        if (ai.account) {
          const resolved = await resolveAccountForAi(user.id, queryMode, ai, recentHistory);
          if (!resolved.account) {
            const choices = resolved.choices ?? [];
            if (choices.length) {
              await setPendingAction(from, {
                type: "account_selection", userId: user.id, mode: queryMode,
                action: "resume_ai", ai, originalText: messageText,
                accounts: choices.map(account => ({ id: account.id, name: account.name, type: account.type })),
              });
              await wppSend(from, accountSelectionMessage(choices, user.locale));
            }
            break;
          }
          accountFilter = resolved.account;
          accountTransactions = await getAccountTransactionsInRange(user.id, queryMode, accountFilter.id, pFrom, pTo);
        }

        if (ai.category) {
          const catMode = queryMode;
          const catType: "income" | "expense" = ai.financeType === "income" ? "income" : "expense";
          const total = accountTransactions
            ? accountTransactions.filter(item => item.type === catType && item.category.toLocaleLowerCase() === ai.category!.toLocaleLowerCase()).reduce((sum, item) => sum + item.amount, 0)
            : await getCategoryTotal(user.id, catMode, catType, ai.category, pFrom, pTo);
          const catModeLabel = catMode === "business" ? "Empresa" : "Pessoal";
          const verb = user.locale === "es" ? (catType === "income" ? "recibiste" : "gastaste") : (catType === "income" ? "recebeu" : "gastou");
          const accountLabel = accountFilter ? ` — 🏦 ${accountFilter.name}` : "";
          await wppSend(from, `${catType === "income" ? "💰" : "💸"} ${user.locale === "es" ? "Tú" : "Você"} ${verb} *${formatCurrency(total)}* ${user.locale === "es" ? "en" : "com"} *${ai.category}* ${user.locale === "es" ? "en" : "em"} ${periodLabel} (${catModeLabel}${accountLabel}).`);
          break;
        }

        // Comerciante/app específico (ex: "quanto gastei com ifood") — busca
        // na descrição, não na categoria, porque a descrição pode ter ficado
        // abreviada num extrato importado ("IFD" em vez de "iFood").
        if (ai.keyword) {
          const kwMode = queryMode;
          const kwType: "income" | "expense" = ai.financeType === "income" ? "income" : "expense";
          const terms = expandMerchantAliases(ai.keyword);
          const total = accountTransactions
            ? accountTransactions.filter(item => item.type === kwType && terms.some(term => item.description.toLocaleLowerCase().includes(term))).reduce((sum, item) => sum + item.amount, 0)
            : await getKeywordTotal(user.id, kwMode, kwType, terms, pFrom, pTo);
          const kwModeLabel = kwMode === "business" ? "Empresa" : "Pessoal";
          const verb = user.locale === "es" ? (kwType === "income" ? "recibiste" : "gastaste") : (kwType === "income" ? "recebeu" : "gastou");
          const accountLabel = accountFilter ? ` — 🏦 ${accountFilter.name}` : "";
          await wppSend(from, `${kwType === "income" ? "💰" : "💸"} ${user.locale === "es" ? "Tú" : "Você"} ${verb} *${formatCurrency(total)}* ${user.locale === "es" ? "en" : "com"} *${ai.keyword}* ${user.locale === "es" ? "en" : "em"} ${periodLabel} (${kwModeLabel}${accountLabel}).`);
          break;
        }

        if (ai.personName) {
          const personPhone = (await findPhoneByName(user.id, ai.personName)) ?? (await findPhoneByRelation(user.id, ai.personName));
          if (!personPhone) {
            await wppSend(from, replyPersonNotFound(ai.personName, user.locale));
            break;
          }
          const personal = await getBalanceInRange(user.id, "personal", pFrom, pTo, personPhone);
          const business = await getBalanceInRange(user.id, "business", pFrom, pTo, personPhone);
          await wppSend(from, replyBalance(personal, business, ai.personName, periodLabel, user.locale));
          break;
        }
        if (accountFilter && accountTransactions) {
          const income = accountTransactions.filter(item => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
          const expense = accountTransactions.filter(item => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
          const language = user.locale === "es";
          await wppSend(from, `🏦 *${accountFilter.name}* — ${periodLabel}\n\n💰 ${language ? "Ingresos" : "Receitas"}: *${formatCurrency(income)}*\n💸 ${language ? "Gastos" : "Despesas"}: *${formatCurrency(expense)}*\n📊 ${language ? "Saldo" : "Saldo"}: *${formatCurrency(income - expense)}*`);
          break;
        }
        const personal = await getBalanceInRange(user.id, "personal", pFrom, pTo);
        const business = await getBalanceInRange(user.id, "business", pFrom, pTo);
        await wppSend(from, replyBalance(personal, business, undefined, periodLabel, user.locale));
        break;
      }

      case "task_create": {
        const rawTasks = ai.tasks?.length ? ai.tasks : ai.task ? [ai.task] : [];
        const uniqueTasks = [...new Map(rawTasks
          .filter(task => task?.title?.trim())
          .map(task => [task.title.trim().toLocaleLowerCase(), task])).values()].slice(0, 30);
        if (!uniqueTasks.length) { await wppSend(from, replyUnknown(messageText, user.locale)); break; }
        const unauthorizedMode = phoneAccess !== "both"
          ? uniqueTasks.find(task => task.mode && task.mode !== mode)?.mode
          : undefined;
        if (unauthorizedMode) { await wppSend(from, replyModeAccessDenied(mode, user.locale)); break; }
        if (uniqueTasks.length === 1) {
          const data = uniqueTasks[0];
          const task = await createTask({ userId: user.id, title: cap(data.title), priority: data.priority || "medium", dueDate: data.dueDate, status: "pending", mode: data.mode || mode });
          await wppSend(from, replyTaskCreated(task, user.locale));
        } else {
          const tasks = await createTasks(uniqueTasks.map(data => ({
            userId: user.id, title: cap(data.title), priority: data.priority || "medium",
            dueDate: data.dueDate, status: "pending" as const, mode: data.mode || mode,
          })));
          await wppSend(from, replyTasksCreated(tasks, user.locale));
        }
        break;
      }

      case "task_query": {
        const tasks = await getPendingTasks(user.id, mode);
        await wppSend(from, replyTaskList(tasks, mode, user.locale));
        break;
      }

      case "task_update": {
        let taskToUpdate = null;
        if (ai.task?.taskNumber) taskToUpdate = await findTaskByNumber(user.id, ai.task.taskNumber, mode);
        else if (ai.task?.title) taskToUpdate = await findTaskByTitle(user.id, ai.task.title, mode);
        const numMatch = messageText.match(/(\d+)/);
        if (!taskToUpdate && numMatch) taskToUpdate = await findTaskByNumber(user.id, parseInt(numMatch[1]), mode);
        if (taskToUpdate) {
          const hasFieldChanges = Boolean(ai.task?.newTitle || ai.task?.newDueDate || ai.task?.newPriority || ai.task?.clearDueDate);
          const updated = await updateTask(taskToUpdate.id, user.id, {
            status: ai.task?.newStatus || (hasFieldChanges ? undefined : "completed"),
            title: ai.task?.newTitle ? cap(ai.task.newTitle) : undefined,
            dueDate: ai.task?.clearDueDate ? null : ai.task?.newDueDate,
            priority: ai.task?.newPriority,
          });
          if (!updated) {
            await wppSend(from, user.locale === "es" ? "❌ No pude actualizar esta tarea. No se modificó nada; inténtalo de nuevo." : "❌ Não consegui atualizar essa tarefa agora. Nada foi modificado; tente novamente.");
          } else if (hasFieldChanges) {
            const due = updated.dueDate ? new Date(`${updated.dueDate}T12:00:00`).toLocaleDateString(user.locale === "es" ? "es-419" : user.locale === "pt-PT" ? "pt-PT" : "pt-BR") : user.locale === "es" ? "sin plazo" : "sem prazo";
            await wppSend(from, user.locale === "es"
              ? `✏️ Tarea actualizada.\n\n📌 ${updated.title}\n📅 ${due}`
              : `✏️ Tarefa atualizada.\n\n📌 ${updated.title}\n📅 ${due}`);
          } else {
            await wppSend(from, replyTaskUpdated(updated, user.locale));
          }
        } else {
          await wppSend(from, user.locale === "es" ? "❓ No encontré esa tarea. Escribe *mis tareas* para ver la lista." : "❓ Tarefa não encontrada. Digite *minhas tarefas* para ver a lista.");
        }
        break;
      }

      case "task_delete": {
        let taskToDelete = null;
        if (ai.task?.taskNumber) taskToDelete = await findTaskByNumber(user.id, ai.task.taskNumber, mode);
        else if (ai.task?.title) taskToDelete = await findTaskByTitle(user.id, ai.task.title, mode);
        const delNumMatch = messageText.match(/(\d+)/);
        if (!taskToDelete && delNumMatch) taskToDelete = await findTaskByNumber(user.id, parseInt(delNumMatch[1]), mode);
        if (taskToDelete && await deleteTask(taskToDelete.id, user.id)) {
          await wppSend(from, user.locale === "es" ? `🗑️ Tarea eliminada.\n\n📌 ${taskToDelete.title}` : `🗑️ Tarefa excluída.\n\n📌 ${taskToDelete.title}`);
        } else {
          await wppSend(from, user.locale === "es" ? "❓ No encontré esa tarea. Escribe *mis tareas* para ver la lista." : "❓ Tarefa não encontrada. Digite *minhas tarefas* para ver a lista.");
        }
        break;
      }

      case "reminder_set": {
        const reminderAis = ai.reminders?.length
          ? ai.reminders.map(reminder => ({ ...ai, reminder, reminders: undefined }))
          : [ai];
        const { reply } = await beginBatchSlotFill("reminder_set", reminderAis, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, reply);
        break;
      }

      case "reminder_list": {
        const reminders = await getRemindersByUser(user.id, mode);
        await wppSend(from, replyReminderList(reminders, user.locale));
        break;
      }

      case "reminder_update": {
        const keyword = ai.keyword || "";
        const reminderNumber = Number(keyword.match(/^\s*(?:lembrete|recordatorio)?\s*(\d+)\s*$/i)?.[1] || messageText.match(/(?:lembrete|recordatorio)\s+(\d+)/i)?.[1] || 0);
        const target = reminderNumber > 0
          ? (await getRemindersByUser(user.id, mode))[reminderNumber - 1] ?? null
          : keyword ? await findReminderByKeyword(user.id, keyword, mode) : null;
        if (!target) { await wppSend(from, user.locale === "es" ? "❓ No encontré ese recordatorio. Escribe *mis recordatorios* para ver la lista." : "❓ Não encontrei esse lembrete. Digite *meus lembretes* para ver a lista."); break; }
        const patch: Partial<Pick<Reminder, "message" | "scheduledAt" | "repeat">> = {};
        if (ai.reminder?.message) patch.message = cap(ai.reminder.message);
        if (ai.reminder?.scheduledAt) patch.scheduledAt = spToUTC(ai.reminder.scheduledAt);
        if (ai.reminder?.repeat) patch.repeat = ai.reminder.repeat;
        if (Object.keys(patch).length === 0) { await wppSend(from, user.locale === "es" ? "❓ ¿Qué quieres cambiar en este recordatorio? Indica el nuevo mensaje, fecha, hora o repetición." : "❓ O que deseja alterar nesse lembrete? Informe a nova mensagem, data, horário ou repetição."); break; }
        const updated = await updateReminder(target.id, user.id, patch);
        await wppSend(from, updated ? replyReminderUpdated(updated, user.locale) : user.locale === "es" ? "❌ No pude actualizar este recordatorio. No se modificó nada; inténtalo de nuevo." : "❌ Não consegui atualizar esse lembrete agora. Nada foi modificado; tente novamente.");
        break;
      }

      case "reminder_delete": {
        const delKeyword = ai.keyword || "";
        const reminderNumber = Number(delKeyword.match(/^\s*(?:lembrete|recordatorio)?\s*(\d+)\s*$/i)?.[1] || messageText.match(/(?:lembrete|recordatorio)\s+(\d+)/i)?.[1] || 0);
        const delTarget = reminderNumber > 0
          ? (await getRemindersByUser(user.id, mode))[reminderNumber - 1] ?? null
          : delKeyword ? await findReminderByKeyword(user.id, delKeyword, mode) : null;
        if (!delTarget) { await wppSend(from, user.locale === "es" ? "❓ No encontré ese recordatorio. Escribe *mis recordatorios* para ver la lista." : "❓ Não encontrei esse lembrete. Digite *meus lembretes* para ver a lista."); break; }
        const deleted = await deleteReminder(delTarget.id, user.id);
        await wppSend(from, deleted ? replyReminderDeleted(delTarget.message, user.locale) : user.locale === "es" ? "❌ No pude eliminar este recordatorio. Inténtalo de nuevo." : "❌ Não consegui excluir esse lembrete agora. Tente novamente.");
        break;
      }

      case "goal_create": {
        const goalAis = ai.goals?.length ? ai.goals.map(goal => ({ ...ai, goal, goals: undefined })) : [ai];
        const { reply: goalReply } = await beginBatchSlotFill("goal_create", goalAis, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, goalReply);
        break;
      }

      case "goal_add": {
        const addAmt = (ai.goal?.targetAmount ?? (ai.goal as unknown as Record<string,number>)?.amount) || ai.finance?.amount || 0;
        const addTitle = (ai.goal?.title || "").trim();
        const activeGoals = await getActiveGoals(user.id, mode);

        if (!addAmt || addAmt <= 0) {
          await wppSend(from, `💰 Qual valor quer adicionar à meta?\n\nExemplo: _"adicionar 200 na meta viagem"_`);
          break;
        }

        // Tenta encontrar pelo título — pode bater em mais de uma (ex: duas
        // metas "viagem"), nesse caso não dá pra escolher sozinho.
        const titleMatches = addTitle ? await findGoalsByTitle(user.id, addTitle, mode) : [];
        const addGoal = titleMatches.length === 1 ? titleMatches[0]
          : titleMatches.length === 0 && activeGoals.length === 1 ? activeGoals[0]
          : null;
        const candidates = titleMatches.length > 1 ? titleMatches : activeGoals;

        if (addGoal) {
          const updated = await updateGoalAmount(addGoal.id, user.id, addAmt);
          if (updated) {
            const p = getGoalProgress(updated);
            const emoji = p >= 100 ? "🎉" : p >= 75 ? "🚀" : "📈";
            await wppSend(from, `${emoji} *${formatCurrency(addAmt)} adicionado!*\n\n🎯 ${updated.title}\n📊 ${formatCurrency(updated.currentAmount)} / ${formatCurrency(updated.targetAmount)} (${p}%)${updated.status === "completed" ? "\n\n🏆 *Meta concluída! Parabéns!*" : ""}`);
          } else await wppSend(from, "❌ Não consegui atualizar essa meta agora. Nada foi modificado; tente novamente.");
        } else if (candidates.length === 0) {
          await wppSend(from, "❓ Você não tem metas ativas. Crie uma primeiro!\n\nEx: _\"Meta: guardar 3000 para viagem\"_");
        } else {
          // Múltiplas metas (candidatas pelo título, ou todas se o título não
          // ajudou a filtrar) — pergunta qual.
          const goalList = candidates.map(g => ({ id: g.id, title: g.title, currentAmount: g.currentAmount, targetAmount: g.targetAmount }));
          await setPendingAction(from, { type: "goal_selection", userId: user.id, mode, action: "add", amount: addAmt, goals: goalList });
          let msg = `🎯 Você tem ${candidates.length} metas ${titleMatches.length > 1 ? `com "${addTitle}"` : "ativas"}. Em qual deseja adicionar *${formatCurrency(addAmt)}*?\n\n`;
          candidates.forEach((g, i) => {
            const p = getGoalProgress(g);
            msg += `*${i + 1}.* ${g.title} (${p}%)\n`;
          });
          msg += `\nResponda com o número ou nome da meta. ⏱ _Válido por 5 min._`;
          await wppSend(from, msg);
        }
        break;
      }

      case "goal_query": {
        const goals = await getActiveGoals(user.id, mode);
        if (!goals.length) {
          await wppSend(from, `🎯 Nenhuma meta ativa.\n\nCrie uma: _"Meta: guardar 5000 para viagem até dezembro"_`);
        } else {
          let msg = `🎯 *Suas metas ativas (${goals.length}):*\n\n`;
          goals.forEach((g, i) => {
            const pct = getGoalProgress(g);
            const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
            msg += `${i + 1}. *${g.title}*\n   ${bar} ${pct}%\n   ${formatCurrency(g.currentAmount)} / ${formatCurrency(g.targetAmount)}\n\n`;
          });
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "goal_complete": {
        const titleStr = ai.goal?.title || messageText;
        const matches = await findGoalsByTitle(user.id, titleStr, mode);
        if (matches.length === 1) {
          const updated = await updateGoalStatus(matches[0].id, user.id, "completed");
          await wppSend(from, updated ? `🏆 *Meta concluída!*\n\n🎯 ${matches[0].title}\n\nParabéns! Você atingiu seu objetivo! 🎉` : "❌ Não consegui concluir essa meta agora. Tente novamente.");
        } else if (matches.length === 0) {
          await wppSend(from, "❓ Meta não encontrada.");
        } else {
          const goalList = matches.map(g => ({ id: g.id, title: g.title, currentAmount: g.currentAmount, targetAmount: g.targetAmount }));
          await setPendingAction(from, { type: "goal_selection", userId: user.id, mode, action: "complete", goals: goalList });
          let msg = `🎯 Encontrei ${matches.length} metas com "${titleStr}". Qual concluir?\n\n`;
          matches.forEach((g, i) => { msg += `*${i + 1}.* ${g.title} (${getGoalProgress(g)}%)\n`; });
          msg += `\nResponda com o número ou nome da meta. ⏱ _Válido por 5 min._`;
          await wppSend(from, msg);
        }
        break;
      }

      case "goal_cancel": {
        const cancelTitle = ai.keyword || ai.goal?.title || messageText;
        const cancelMatches = await findGoalsByTitle(user.id, cancelTitle, mode);
        if (cancelMatches.length === 1) {
          const updated = await updateGoalStatus(cancelMatches[0].id, user.id, "cancelled");
          await wppSend(from, updated ? `🗑️ Meta cancelada.\n\n🎯 ${cancelMatches[0].title}` : "❌ Não consegui cancelar essa meta agora. Tente novamente.");
        } else if (cancelMatches.length === 0) {
          await wppSend(from, "❓ Meta não encontrada. Digite *minhas metas* para ver a lista.");
        } else {
          const goalList = cancelMatches.map(g => ({ id: g.id, title: g.title, currentAmount: g.currentAmount, targetAmount: g.targetAmount }));
          await setPendingAction(from, { type: "goal_selection", userId: user.id, mode, action: "cancel", goals: goalList });
          let msg = `🎯 Encontrei ${cancelMatches.length} metas com "${cancelTitle}". Qual cancelar?\n\n`;
          cancelMatches.forEach((g, i) => { msg += `*${i + 1}.* ${g.title} (${getGoalProgress(g)}%)\n`; });
          msg += `\nResponda com o número ou nome da meta. ⏱ _Válido por 5 min._`;
          await wppSend(from, msg);
        }
        break;
      }

      case "vehicle_create": {
        const vehicleAis = ai.vehicles?.length ? ai.vehicles.map(vehicle => ({ ...ai, vehicle, vehicles: undefined })) : [ai];
        const { reply } = await beginBatchSlotFill("vehicle_create", vehicleAis, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, reply);
        break;
      }

      case "vehicle_update": {
        const vehicleKeyword = ai.keyword || ai.vehicle?.name || "";
        const allVehicles = await getVehiclesByUser(user.id);
        if (!allVehicles.length) {
          await wppSend(from, user.locale === "es"
            ? `🚗 Todavía no tienes vehículos registrados.\n\nPuedes registrar uno así: _"registra un Volkswagen Gol 2020"_.`
            : `🚗 Você ainda não tem veículos cadastrados.\n\nCadastre por aqui, por exemplo: _"cadastre um Volkswagen Gol 2020"_.`);
          break;
        }

        const candidates = vehicleKeyword
          ? await findVehiclesByName(user.id, vehicleKeyword)
          : allVehicles;
        if (!candidates.length) {
          await wppSend(from, user.locale === "es" ? `❓ No encontré ningún vehículo con *"${vehicleKeyword}"*.\n\nEscribe *mis vehículos* para ver la lista.` : `❓ Não encontrei nenhum veículo com *"${vehicleKeyword}"*.\n\nDigite *meus veículos* para conferir a lista.`);
          break;
        }

        const patch = vehiclePatchFromAi(ai);
        if (candidates.length > 1) {
          await askWhichVehicle(from, user.id, candidates, "update", mode, patch, user.locale);
        } else if (!Object.keys(patch).length) {
          await askVehiclePatch(from, user.id, candidates[0], candidates[0].mode, user.locale);
        } else {
          const updated = await updateVehicle(candidates[0].id, user.id, patch);
          if (updated) await sendVehicleUpdated(from, updated, user.locale);
          else await wppSend(from, user.locale === "es" ? "❌ No pude actualizar este vehículo. No se modificó nada; inténtalo de nuevo." : "❌ Não consegui atualizar esse veículo agora. Nada foi modificado; tente novamente.");
        }
        break;
      }

      case "vehicle_delete": {
        const vehicleKeyword = ai.keyword || ai.vehicle?.name || "";
        const allVehicles = await getVehiclesByUser(user.id);
        if (!allVehicles.length) {
          await wppSend(from, user.locale === "es" ? "🚗 No tienes vehículos registrados para eliminar." : "🚗 Você não tem veículos cadastrados para excluir.");
          break;
        }

        const candidates = vehicleKeyword
          ? await findVehiclesByName(user.id, vehicleKeyword)
          : allVehicles;
        if (!candidates.length) {
          await wppSend(from, user.locale === "es" ? `❓ No encontré ningún vehículo con *"${vehicleKeyword}"*.\n\nEscribe *mis vehículos* para ver la lista.` : `❓ Não encontrei nenhum veículo com *"${vehicleKeyword}"*.\n\nDigite *meus veículos* para conferir a lista.`);
        } else if (candidates.length > 1) {
          await askWhichVehicle(from, user.id, candidates, "delete", mode, undefined, user.locale);
        } else {
          const deleted = await deleteVehicle(candidates[0].id, user.id);
          await wppSend(from, deleted
            ? user.locale === "es"
              ? `🗑️ *¡Vehículo eliminado!*\n\n🚗 ${vehicleIdentity(candidates[0])}\n\n_Los movimientos ya registrados en Finanzas se conservaron en el historial._`
              : `🗑️ *Veículo excluído!*\n\n🚗 ${vehicleIdentity(candidates[0])}\n\n_Os lançamentos já registrados em Finanças foram mantidos no histórico._`
            : user.locale === "es" ? "❌ No pude eliminar este vehículo. No se modificó nada; inténtalo de nuevo." : "❌ Não consegui excluir esse veículo agora. Nada foi modificado; tente novamente.");
        }
        break;
      }

      case "vehicle_expense": {
        if (ai.vehicleExpenses?.length) {
          const expenses = ai.vehicleExpenses.slice(0, 30);
          if (phoneAccess !== "both" && expenses.some(item => item.mode && item.mode !== mode)) {
            await wppSend(from, replyModeAccessDenied(mode, user.locale));
            break;
          }
          const missingAmount = expenses.findIndex(item => !(item.amount && item.amount > 0));
          if (missingAmount >= 0) {
            await wppSend(from, user.locale === "es"
              ? `💰 ¿Cuál fue el importe del gasto ${missingAmount + 1} del vehículo?`
              : `💰 Qual foi o valor do gasto ${missingAmount + 1} do veículo?`);
            break;
          }
          const prepared: Array<{ item: typeof expenses[number]; target: Vehicle | null; mode: "personal" | "business" }> = [];
          let unresolved = "";
          for (const item of expenses) {
            const expenseMode = item.mode || mode;
            const vehicles = await getVehiclesByUser(user.id, expenseMode);
            const target = item.name
              ? await findVehicleByName(user.id, item.name, expenseMode)
              : vehicles.length === 1 ? vehicles[0] : null;
            if (!target && vehicles.length > 1) {
              unresolved = item.description || item.name || String(prepared.length + 1);
              break;
            }
            prepared.push({ item, target, mode: expenseMode });
          }
          if (unresolved) {
            await wppSend(from, user.locale === "es"
              ? `🚗 ¿En cuál vehículo debo registrar *${unresolved}*? Indica la marca, el modelo o la matrícula.`
              : `🚗 Em qual veículo devo registrar *${unresolved}*? Informe a marca, modelo ou placa.`);
            break;
          }
          const registered: string[] = [];
          for (const { item, target, mode: expenseMode } of prepared) {
            const amount = item.amount!;
            const expenseType = item.expenseType || "other";
            const description = cap(item.description || expenseType);
            const date = todayStrBR();
            if (!target) {
              await addFinance({ userId: user.id, type: "expense", amount, category: "Transporte", description, date, mode: expenseMode, source: "whatsapp", registeredBy: from });
              registered.push(`${description} — ${formatCurrency(amount)}`);
              continue;
            }
            const updatedVehicle = await addVehicleExpense(target.id, user.id, { date, km: item.km, type: expenseType, amount, description });
            if (!updatedVehicle) throw new Error(`[vehicle_expense] falha no lote para ${target.id}`);
            const createdExpense = updatedVehicle.expenses[updatedVehicle.expenses.length - 1];
            const finance = await addFinance({ userId: user.id, type: "expense", amount, category: VEHICLE_FINANCE_CATEGORY[expenseType] || "Transporte", description: `${description} — ${target.brand} ${target.model}`, date, mode: expenseMode, source: "whatsapp", registeredBy: from });
            await setExpenseFinanceId(target.id, createdExpense.id, finance.id);
            registered.push(`${description} — ${target.brand} ${target.model} — ${formatCurrency(amount)}`);
          }
          const heading = user.locale === "es"
            ? `✅ Registré *${registered.length} gastos de vehículos*:`
            : `✅ Registrei *${registered.length} gastos de veículos*:`;
          await wppSend(from, `${heading}\n\n${registered.map((item, index) => `${index + 1}. ${item}`).join("\n")}`);
          break;
        }
        const vAmount = ai.vehicle?.amount || ai.finance?.amount || 0;
        const vType = ai.vehicle?.expenseType || "other";
        const vDesc = cap(ai.vehicle?.description || ai.finance?.description || vType);

        if (!vAmount || vAmount <= 0) {
          await wppSend(from, user.locale === "es"
            ? `❓ No pude identificar el importe del gasto.\n\nPrueba así:\n_"Gasté 50 en combustible"_\n_"Pagué 300 de mantenimiento del auto"_`
            : `❓ Não consegui identificar o valor do gasto.\n\nTente assim:\n_"Gastei 50 reais de combustível"_\n_"Paguei 300 de manutenção no carro"_`);
          break;
        }
        const vKm = ai.vehicle?.km;
        const vDate = now.toISOString().slice(0, 10);
        const typeEmoji: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };

        const vehicleMode = ai.vehicle?.mode || mode;
        const allVehicles = await getVehiclesByUser(user.id, vehicleMode);

        // Sem veículos → registra como despesa financeira
        if (allVehicles.length === 0) {
          const f = await addFinance({ userId: user.id, type: "expense", amount: vAmount, category: "Transporte", description: vDesc, date: vDate, mode: vehicleMode, source: "whatsapp", registeredBy: from });
          const bal = (await getBalance(user.id, vehicleMode, year, month)).balance;
          await wppSend(from, `${replyFinanceRegistered(f, bal, user.locale)}\n\n${user.locale === "es" ? "💡 _Consejo: registra el vehículo diciendo «registra un Volkswagen Gol 2020» para controlar sus gastos por separado._" : "💡 _Dica: cadastre por aqui dizendo \"cadastre um Volkswagen Gol 2020\" para controlar os gastos separadamente._"}`);
          break;
        }

        // Identifica veículo pelo nome mencionado na mensagem
        let targetVehicle = ai.vehicle?.name
          ? await findVehicleByName(user.id, ai.vehicle.name, vehicleMode)
          : null;

        // Um único veículo → registra direto
        if (!targetVehicle && allVehicles.length === 1) {
          targetVehicle = allVehicles[0];
        }

        if (targetVehicle) {
          const exp = await addVehicleExpense(targetVehicle.id, user.id, { date: vDate, km: vKm, type: vType, amount: vAmount, description: vDesc });
          if (exp) {
            const newExp = exp.expenses[exp.expenses.length - 1];
            const f = await addFinance({ userId: user.id, type: "expense", amount: vAmount, category: VEHICLE_FINANCE_CATEGORY[vType] || "Transporte", description: `${vDesc} — ${targetVehicle.brand} ${targetVehicle.model}`, date: vDate, mode: vehicleMode, source: "whatsapp", registeredBy: from });
            await setExpenseFinanceId(targetVehicle.id, newExp.id, f.id);
            const total = getVehicleTotalExpenses(exp);
            await wppSend(from, user.locale === "es" ? `${typeEmoji[vType]} *¡Registrado en ${targetVehicle.brand} ${targetVehicle.model}!*\n\n💰 ${formatCurrency(vAmount)} — ${vDesc}\n📊 Total del vehículo: ${formatCurrency(total)}` : `${typeEmoji[vType]} *Registrado no ${targetVehicle.brand} ${targetVehicle.model}!*\n\n💰 ${formatCurrency(vAmount)} — ${vDesc}\n📊 Total do veículo: ${formatCurrency(total)}`);
          } else await wppSend(from, user.locale === "es" ? "❌ No pude registrar el gasto del vehículo. No se guardó nada; inténtalo de nuevo." : "❌ Não consegui registrar o gasto no veículo agora. Nada foi lançado; tente novamente.");
          break;
        }

        // Múltiplos veículos → pergunta qual
        const expenseData = { amount: vAmount, expenseType: vType, description: vDesc, km: vKm, date: vDate };
        const vehicleList = pendingVehicleRows(allVehicles);
        await setPendingAction(from, { type: "vehicle_selection", userId: user.id, mode: vehicleMode, action: "expense", expenseData, vehicles: vehicleList });

        let msg = user.locale === "es" ? `🚗 Tienes ${allVehicles.length} vehículos registrados. ¿En cuál registro *${formatCurrency(vAmount)}* de ${vDesc}?\n\n` : `🚗 Você tem ${allVehicles.length} veículos cadastrados. Em qual registrar *${formatCurrency(vAmount)}* de ${vDesc}?\n\n`;
        allVehicles.forEach((v, i) => { msg += `*${i + 1}.* ${v.brand} ${v.model} (${v.year})${v.plate ? ` — ${v.plate}` : ""}\n`; });
        msg += user.locale === "es" ? `\nResponde con el número o nombre del vehículo. ⏱ _Válido durante 5 minutos._` : `\nResponda com o número ou nome do veículo. ⏱ _Válido por 5 min._`;
        await wppSend(from, msg);
        break;
      }

      case "vehicle_query": {
        const vehicles = await getVehiclesByUser(user.id, mode);
        if (!vehicles.length) {
          await wppSend(from, user.locale === "es" ? `🚗 No hay vehículos registrados.\n\nPuedes registrar uno así: _"registra un Volkswagen Gol 2020"_.` : `🚗 Sem veículos cadastrados.\n\nCadastre por aqui, por exemplo: _"cadastre um Volkswagen Gol 2020"_.`);
        } else {
          let msg = user.locale === "es" ? `🚗 *Tus vehículos:*\n\n` : `🚗 *Seus veículos:*\n\n`;
          vehicles.forEach(v => {
            const total = getVehicleTotalExpenses(v);
            msg += user.locale === "es"
              ? `• *${v.brand} ${v.model}* (${v.year})\n  Matrícula: ${v.plate || "—"} | Km: ${v.currentKm.toLocaleString("es-419")}\n  Total de gastos: ${formatCurrency(total)}\n\n`
              : `• *${v.brand} ${v.model}* (${v.year})\n  Placa: ${v.plate || "—"} | Km: ${v.currentKm.toLocaleString()}\n  Total gastos: ${formatCurrency(total)}\n\n`;
          });
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "grocery_list_add": {
        const g = ai.grocery;
        const before = await getShoppingList(user.id);
        if (g?.template) {
          await addFromTemplate(user.id, g.template);
        } else if (g?.items?.length) {
          for (const i of g.items) await addToShoppingList(user.id, cap(i.productName), i.category ?? "Outros", i.quantity ? String(i.quantity) : "1");
        } else {
          await wppSend(from, replyGroceryListAdded(0, undefined, user.locale));
          break;
        }

        const updatedList = await getShoppingList(user.id);
        const previousIds = new Set(before.map(item => item.id));
        const added = updatedList.filter(item => !previousIds.has(item.id)).length;
        const confirmation = added > 0
          ? replyGroceryListAdded(added, g.template, user.locale)
          : user.locale === "es"
            ? "🛒 Esos artículos ya estaban en tu lista."
            : user.locale === "pt-PT"
              ? "🛒 Esses itens já estavam na tua lista."
              : "🛒 Esses itens já estavam na sua lista.";
        await wppSend(from, `${confirmation}\n\n${replyGroceryList(updatedList, user.locale)}`);
        break;
      }

      case "grocery_list_show": {
        const list = await getShoppingList(user.id);
        await wppSend(from, replyGroceryList(list, user.locale));
        break;
      }

      case "grocery_list_clear": {
        const removedCount = await clearShoppingList(user.id);
        const confirmation = user.locale === "es"
          ? removedCount > 0 ? `🗑️ Lista vaciada. Eliminé ${removedCount} ${removedCount === 1 ? "artículo" : "artículos"}.` : "🛒 Tu lista ya estaba vacía."
          : user.locale === "pt-PT"
            ? removedCount > 0 ? `🗑️ Lista limpa. Removi ${removedCount} ${removedCount === 1 ? "item" : "itens"}.` : "🛒 A tua lista já estava vazia."
            : removedCount > 0 ? `🗑️ Lista limpa. Removi ${removedCount} ${removedCount === 1 ? "item" : "itens"}.` : "🛒 Sua lista já estava vazia.";
        await wppSend(from, confirmation);
        break;
      }

      case "grocery_list_remove": {
        const requestedNames = ai.grocery?.itemNames?.filter(Boolean) ?? [];
        if (!requestedNames.length) {
          await wppSend(from, user.locale === "es" ? "❓ ¿Qué artículo quieres eliminar de la lista?" : "❓ Qual item deseja remover da lista?");
          break;
        }
        const available = (await getShoppingList(user.id)).filter(item => !item.checked);
        const normalizeName = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
        const removedNames: string[] = [];
        const notFound: string[] = [];
        const usedIds = new Set<string>();
        for (const requestedName of requestedNames) {
          const needle = normalizeName(requestedName);
          const candidates = available.filter(item => {
            if (usedIds.has(item.id)) return false;
            const itemName = normalizeName(item.name);
            return itemName === needle || itemName.includes(needle) || needle.includes(itemName);
          });
          const exact = candidates.find(item => normalizeName(item.name) === needle);
          const match = exact || (candidates.length === 1 ? candidates[0] : undefined);
          if (!match) { notFound.push(requestedName); continue; }
          await removeShoppingItem(match.id, user.id);
          usedIds.add(match.id);
          removedNames.push(match.name);
        }
        const lines: string[] = [];
        if (removedNames.length) {
          lines.push(user.locale === "es"
            ? `🗑️ Eliminé de la lista: ${removedNames.join(", ")}.`
            : `🗑️ Removi da lista: ${removedNames.join(", ")}.`);
        }
        if (notFound.length) {
          lines.push(user.locale === "es"
            ? `❓ No encontré: ${notFound.join(", ")}.`
            : `❓ Não encontrei: ${notFound.join(", ")}.`);
        }
        const updatedList = await getShoppingList(user.id);
        await wppSend(from, `${lines.join("\n")}\n\n${replyGroceryList(updatedList, user.locale)}`.trim());
        break;
      }

      case "grocery_list_edit": {
        const targetName = ai.grocery?.itemNames?.[0];
        if (!targetName) {
          await wppSend(from, user.locale === "es" ? "❓ ¿Qué artículo de la lista quieres cambiar?" : "❓ Qual item da lista deseja alterar?");
          break;
        }
        const normalizeName = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
        const needle = normalizeName(targetName);
        const list = (await getShoppingList(user.id)).filter(item => !item.checked);
        const candidates = list.filter(item => {
          const itemName = normalizeName(item.name);
          return itemName === needle || itemName.includes(needle) || needle.includes(itemName);
        });
        const exact = candidates.find(item => normalizeName(item.name) === needle);
        if (!exact && candidates.length > 1) {
          const names = candidates.map(item => `• ${item.name}`).join("\n");
          await wppSend(from, user.locale === "es"
            ? `Encontré más de un artículo parecido. Dime el nombre exacto:\n${names}`
            : `Encontrei mais de um item parecido. Diga o nome exato:\n${names}`);
          break;
        }
        const target = exact || candidates[0];
        if (!target) {
          await wppSend(from, user.locale === "es" ? `❓ No encontré *${targetName}* en tu lista.` : `❓ Não encontrei *${targetName}* na sua lista.`);
          break;
        }
        const updated = await updateShoppingItem(target.id, user.id, {
          name: ai.grocery?.newProductName ? cap(ai.grocery.newProductName) : undefined,
          quantity: ai.grocery?.newQuantity,
          category: ai.grocery?.newCategory,
        });
        if (!updated) {
          await wppSend(from, user.locale === "es" ? "❓ Dime qué quieres cambiar: nombre, cantidad o categoría." : "❓ Diga o que deseja alterar: nome, quantidade ou categoria.");
          break;
        }
        const confirmation = user.locale === "es"
          ? `✏️ Artículo actualizado: *${updated.name}* — ${updated.quantity}.`
          : `✏️ Item atualizado: *${updated.name}* — ${updated.quantity}.`;
        await wppSend(from, `${confirmation}\n\n${replyGroceryList(await getShoppingList(user.id), user.locale)}`);
        break;
      }

      case "grocery_list_check": {
        const names = ai.grocery?.itemNames ?? [];
        if (!names.length) { await wppSend(from, user.locale === "es" ? "❓ ¿Qué artículo quieres marcar como comprado?" : "❓ Qual item deseja marcar como comprado?"); break; }
        const pendingItems = (await getShoppingList(user.id)).filter(i => !i.checked);
        const checked: string[] = [];
        const notFound: string[] = [];
        for (const name of names) {
          const lower = name.toLowerCase();
          const found = pendingItems.find(i => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
          if (found && await toggleShoppingItem(found.id, user.id)) checked.push(found.name);
          else notFound.push(name);
        }
        await wppSend(from, replyGroceryItemChecked(checked, notFound, user.locale));
        break;
      }

      case "grocery_last_purchase_query": {
        const requestedStore = ai.grocery?.storeName?.trim();
        const purchases = await getPurchasesInRange(user.id);
        const latestPurchase = requestedStore ? findLatestPurchaseByStoreName(purchases, requestedStore) : purchases[0] ?? null;
        if (!latestPurchase) {
          const target = requestedStore ? ` *${requestedStore}*` : "";
          await wppSend(from, user.locale === "es"
            ? `❓ No encontré ninguna compra registrada${requestedStore ? ` en${target}` : ""}.`
            : `❓ Não encontrei nenhuma compra registrada${requestedStore ? ` no${target}` : ""}.`);
          break;
        }
        const dateLocale = user.locale === "es" ? "es-419" : user.locale === "pt-PT" ? "pt-PT" : "pt-BR";
        const purchaseDate = new Date(`${latestPurchase.date}T12:00:00`).toLocaleDateString(dateLocale);
        if (ai.grocery?.queryDetail !== "items") {
          await wppSend(from, user.locale === "es"
            ? `🧾 En tu última compra en *${latestPurchase.storeName}*, el ${purchaseDate}, gastaste *${formatCurrency(latestPurchase.total)}* en ${latestPurchase.items.length} ${latestPurchase.items.length === 1 ? "artículo" : "artículos"}.`
            : `🧾 Na sua última compra no *${latestPurchase.storeName}*, em ${purchaseDate}, você gastou *${formatCurrency(latestPurchase.total)}* em ${latestPurchase.items.length} ${latestPurchase.items.length === 1 ? "item" : "itens"}.`);
          break;
        }
        let purchaseMessage = user.locale === "es"
          ? `🧾 *Última compra en ${latestPurchase.storeName}*\n📅 ${purchaseDate}\n\n`
          : `🧾 *Última compra no ${latestPurchase.storeName}*\n📅 ${purchaseDate}\n\n`;
        if (!latestPurchase.items.length) {
          purchaseMessage += user.locale === "es"
            ? "• Esta compra no tiene artículos detallados registrados.\n"
            : "• Esta compra não tem itens detalhados registrados.\n";
        } else {
          latestPurchase.items.forEach(item => {
            const simpleUnit = /^(?:un|und|unidad(?:es)?)$/i.test(item.unit || "");
            const quantity = item.quantity === 1 && item.unit && !simpleUnit ? item.unit : `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
            const estimated = item.priceEstimated ? " (estimado)" : "";
            purchaseMessage += `• ${item.productName} — ${quantity} × ${formatCurrency(item.price)} = ${formatCurrency(item.price * item.quantity)}${estimated}\n`;
          });
          if (latestPurchase.items.some(item => item.priceEstimated)) {
            purchaseMessage += user.locale === "es"
              ? "\nℹ️ Los valores por artículo son estimados a partir del total informado.\n"
              : "\nℹ️ Os valores por item são estimados a partir do total informado.\n";
          }
        }
        purchaseMessage += `\n💰 *Total: ${formatCurrency(latestPurchase.total)}*`;
        await wppSend(from, purchaseMessage);
        break;
      }

      case "grocery_spend_query": {
        const spendPeriod = ai.grocery?.period;
        const spend = await getSpendByStore(user.id, spendPeriod?.from, spendPeriod?.to, ai.grocery?.storeName);
        const totalSpent = spend.reduce((s, x) => s + x.total, 0);
        const spendPeriodLabel = spendPeriod ? periodLabelFor(spendPeriod, now, user.locale) : undefined;
        await wppSend(from, replyGrocerySpend(spend, totalSpent, user.locale, spendPeriodLabel));
        break;
      }

      case "grocery_purchase": {
        const purchaseAis = ai.groceryPurchases?.length
          ? ai.groceryPurchases.map(grocery => ({ ...ai, grocery, groceryPurchases: undefined }))
          : [ai];
        const { reply: groceryReply } = await beginBatchSlotFill("grocery_purchase", purchaseAis, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, groceryReply);
        break;
      }

      case "grocery_purchase_finish": {
        const { reply: finishReply } = await beginSlotFill("grocery_purchase_finish", ai, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, finishReply);
        break;
      }

      case "grocery_list_generate": {
        const keys = ai.grocery?.categories ?? [];
        const categories = keys.map(categoryForTemplateKey).filter((c): c is GroceryCategory => !!c);
        const suggested = await getSuggestedListItems(user.id, categories.length ? categories : undefined);

        if (suggested.length) {
          for (const item of suggested) await addToShoppingList(user.id, cap(item.productName), item.category);
          await wppSend(from, user.locale === "es"
            ? `🛒 *Lista sugerida según lo que compras con más frecuencia:*\n\n${suggested.map(i => `• ${cap(i.productName)}`).join("\n")}\n\nYa la agregué a tu lista de compras.`
            : `🛒 *Lista sugerida com base no que você mais compra:*\n\n${suggested.map(i => `• ${cap(i.productName)}`).join("\n")}\n\nJá adicionei na sua lista de compras!`);
        } else {
          const fallbackKeys = keys.length ? keys : ["mercearia", "hortifruti"];
          let total = 0;
          for (const key of fallbackKeys) total += await addFromTemplate(user.id, key);
          await wppSend(from, total > 0
            ? user.locale === "es" ? `🛒 Todavía no tengo tu historial de compras; preparé una lista básica (${total} artículos) para empezar. Se personalizará a medida que registres compras.` : `🛒 Ainda não tenho histórico seu de compras — montei uma lista básica (${total} itens) pra começar. Vai ficando mais personalizada conforme você registra suas compras!`
            : user.locale === "es" ? `❓ No reconocí esas categorías. Prueba: abarrotes, carnes, frutas y verduras, lácteos, panadería, bebidas, higiene o limpieza.` : `❓ Não reconheci essas categorias. Tente: mercearia, carnes, hortifruti, laticínios, padaria, bebidas, higiene ou limpeza.`);
        }
        break;
      }

      case "grocery_price_compare": {
        const productName = ai.grocery?.productName;
        if (!productName) { await wppSend(from, user.locale === "es" ? `❓ ¿Qué producto quieres comparar? Ej.: _"¿cuánto pago por el detergente?"_` : `❓ Qual produto você quer comparar? Ex: _"quanto pago no detergente"_`); break; }
        const cmp = await getPriceComparison(user.id, productName);
        if (!cmp.length) {
          await wppSend(from, user.locale === "es" ? `❓ Todavía no encontré *"${productName}"* en tu historial de más de un supermercado.` : `❓ Não achei *"${productName}"* no seu histórico em mais de um mercado ainda.`);
        } else {
          const item = cmp[0];
          let msg = user.locale === "es" ? `💰 *${cap(item.productName)}* — precio por supermercado:\n\n` : `💰 *${cap(item.productName)}* — preço por mercado:\n\n`;
          item.prices.forEach((p, i) => { msg += `${i === 0 ? "🟢" : "⚪"} ${p.storeName} — ${formatCurrency(p.price)}\n`; });
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "grocery_store_ranking": {
        const { ranking, method } = await getStorePriceRanking(user.id);
        if (!ranking.length) {
          await wppSend(from, user.locale === "es" ? "❓ Todavía no tengo suficientes compras para comparar supermercados." : "❓ Ainda não tenho compras suficientes pra comparar mercados.");
        } else {
          let msg = user.locale === "es"
            ? `🏆 *Clasificación de supermercados${method === "avg_ticket" ? " (por compra promedio; todavía hay pocos artículos en común para comparar precios)" : ""}:*\n\n`
            : `🏆 *Ranking de mercados${method === "avg_ticket" ? " (por ticket médio — poucos itens em comum ainda pra comparar preço)" : ""}:*\n\n`;
          ranking.forEach((r, i) => {
            msg += method === "relative_price"
              ? `${i + 1}. ${r.storeName} — ${Math.round(r.score * 100)}%${i === 0 ? user.locale === "es" ? " 🏅 más barato" : " 🏅 mais barato" : ""}\n`
              : `${i + 1}. ${r.storeName} — ${formatCurrency(r.score)}/${user.locale === "es" ? "visita" : "visita"}\n`;
          });
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "grocery_history_query": {
        const categoryFilter = ai.grocery?.category as GroceryCategory | undefined;
        const [defFrom, defTo] = monthBounds(year, month);
        const requestedPeriod = ai.grocery?.period;
        const requestedStore = ai.grocery?.storeName?.trim();
        const purchaseLimit = ai.grocery?.purchaseLimit && ai.grocery.purchaseLimit > 0 ? Math.floor(ai.grocery.purchaseLimit) : undefined;
        const purchaseOffset = ai.grocery?.purchaseOffset && ai.grocery.purchaseOffset > 0 ? Math.floor(ai.grocery.purchaseOffset) : 0;
        const useAllHistory = ai.grocery?.allHistory || !!requestedStore || !!purchaseLimit || purchaseOffset > 0;
        const histFrom = requestedPeriod?.from || (useAllHistory ? undefined : defFrom);
        const histTo = requestedPeriod?.to || (useAllHistory ? undefined : defTo);
        const allMatchingPurchases = await getPurchasesInRange(user.id, histFrom, histTo, categoryFilter, requestedStore);
        const histPurchases = allMatchingPurchases.slice(purchaseOffset, purchaseLimit ? purchaseOffset + purchaseLimit : undefined);

        if (!histPurchases.length) {
          const storePart = requestedStore ? (user.locale === "es" ? ` en *${requestedStore}*` : ` no *${requestedStore}*`) : "";
          const categoryPart = categoryFilter ? (user.locale === "es" ? ` de *${categoryFilter}*` : ` de *${categoryFilter}*`) : "";
          await wppSend(from, user.locale === "es"
            ? `❓ No encontré compras${categoryPart}${storePart} con esos filtros.`
            : `❓ Não encontrei compras${categoryPart}${storePart} com esses filtros.`);
          break;
        }

        const dateLocale = user.locale === "es" ? "es-419" : user.locale === "pt-PT" ? "pt-PT" : "pt-BR";
        const scopeLabel = requestedPeriod
          ? periodLabelFor(requestedPeriod, now, user.locale)
          : purchaseOffset === 1 && purchaseLimit === 1
            ? (user.locale === "es" ? "penúltima compra" : "penúltima compra")
            : purchaseOffset === 2 && purchaseLimit === 1
              ? (user.locale === "es" ? "antepenúltima compra" : "antepenúltima compra")
              : purchaseLimit
                ? (user.locale === "es" ? `últimas ${purchaseLimit} compras` : `últimas ${purchaseLimit} compras`)
                : useAllHistory
                  ? (user.locale === "es" ? "todo el historial" : "todo o histórico")
                  : periodLabelFor(undefined, now, user.locale);
        const categoryTitle = categoryFilter ? ` — ${categoryFilter}` : "";
        const storeTitle = requestedStore ? ` — ${histPurchases[0].storeName}` : "";
        let historyMessage = user.locale === "es"
          ? `📋 *Compras${storeTitle}${categoryTitle} — ${scopeLabel}*\n\n`
          : `📋 *Compras${storeTitle}${categoryTitle} — ${scopeLabel}*\n\n`;
        const grandTotal = histPurchases.reduce((sum, purchase) => sum + purchase.total, 0);

        if (ai.grocery?.queryDetail === "total") {
          for (const purchase of histPurchases) {
            const purchaseDate = new Date(`${purchase.date}T12:00:00`).toLocaleDateString(dateLocale);
            historyMessage += `• ${purchaseDate} — ${purchase.storeName}: *${formatCurrency(purchase.total)}*\n`;
          }
        } else {
          for (const purchase of histPurchases) {
            const purchaseDate = new Date(`${purchase.date}T12:00:00`).toLocaleDateString(dateLocale);
            historyMessage += `🏪 *${purchase.storeName}* — ${purchaseDate}\n`;
            if (!purchase.items.length) {
              historyMessage += user.locale === "es" ? "   • Sin artículos detallados\n" : "   • Sem itens detalhados\n";
            } else {
              for (const item of purchase.items) {
                const simpleUnit = /^(?:un|und|unidad(?:es)?)$/i.test(item.unit || "");
                const quantity = item.quantity === 1 && item.unit && !simpleUnit
                  ? item.unit
                  : `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
                const estimated = item.priceEstimated ? " _(estimado)_" : "";
                historyMessage += `   • ${item.productName} — ${quantity} × ${formatCurrency(item.price)} = ${formatCurrency(item.quantity * item.price)}${estimated}\n`;
              }
            }
            historyMessage += `${categoryFilter ? "Subtotal" : "Total"}: *${formatCurrency(purchase.total)}*\n\n`;
          }
        }
        historyMessage += user.locale === "es"
          ? `🧾 ${histPurchases.length} ${histPurchases.length === 1 ? "compra" : "compras"}\n💰 *Total: ${formatCurrency(grandTotal)}*`
          : `🧾 ${histPurchases.length} ${histPurchases.length === 1 ? "compra" : "compras"}\n💰 *Total: ${formatCurrency(grandTotal)}*`;
        await wppSendLong(from, historyMessage.trim());
        break;
      }

      case "employee_create": {
        const employeeAis = ai.employees?.length ? ai.employees.map(employee => ({ ...ai, employee, employees: undefined })) : [ai];
        const { reply: employeeReply } = await beginBatchSlotFill("employee_create", employeeAis, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, employeeReply);
        break;
      }

      case "employee_list": {
        const employees = await getEmployeesByUser(user.id, "active");
        const totalPayroll = await getTotalPayroll(user.id);
        await wppSend(from, replyEmployeeList(employees, totalPayroll, user.locale));
        break;
      }

      case "employee_update": {
        const empKeyword = ai.keyword || ai.employee?.name || "";
        const empTarget = empKeyword ? await findEmployeeByName(user.id, empKeyword) : null;
        if (!empTarget) { await wppSend(from, localized(user.locale, "❓ Não encontrei esse funcionário. Digite *meus funcionários* para ver a lista.", "❓ No encontré a ese empleado. Escribe *mis empleados* para ver la lista.")); break; }
        const empPatch: Partial<Employee> = {};
        if (ai.employee?.newName) empPatch.name = cap(ai.employee.newName);
        if (ai.employee?.role) empPatch.role = cap(ai.employee.role);
        if (ai.employee?.salary && ai.employee.salary > 0) empPatch.salary = ai.employee.salary;
        if (ai.employee?.startDate) empPatch.startDate = ai.employee.startDate;
        if (ai.employee?.phone) empPatch.phone = ai.employee.phone;
        if (ai.employee?.email) empPatch.email = ai.employee.email;
        if (ai.employee?.notes) empPatch.notes = ai.employee.notes;
        if (Object.keys(empPatch).length === 0) { await wppSend(from, localized(user.locale, "❓ O que deseja alterar? Ex: _\"muda o salário da Ana para 2200\"_", "❓ ¿Qué quieres cambiar? Ej.: _\"cambia el sueldo de Ana a 2200\"_")); break; }
        const empUpdated = await updateEmployee(empTarget.id, user.id, empPatch);
        await wppSend(from, empUpdated ? replyEmployeeUpdated(empUpdated, user.locale) : localized(user.locale, "❌ Não consegui atualizar esse funcionário agora. Nada foi modificado; tente novamente.", "❌ No pude actualizar a este empleado. No se modificó nada; inténtalo de nuevo."));
        break;
      }

      case "employee_deactivate": {
        const deactKeyword = ai.keyword || ai.employee?.name || "";
        const deactTarget = deactKeyword ? await findEmployeeByName(user.id, deactKeyword) : null;
        if (!deactTarget) { await wppSend(from, localized(user.locale, "❓ Não encontrei esse funcionário. Digite *meus funcionários* para ver a lista.", "❓ No encontré a ese empleado. Escribe *mis empleados* para ver la lista.")); break; }
        const deactivated = await updateEmployee(deactTarget.id, user.id, { status: "inactive" });
        await wppSend(from, deactivated ? replyEmployeeDeactivated(deactivated, user.locale) : localized(user.locale, "❌ Não consegui desativar esse funcionário agora. Tente novamente.", "❌ No pude desactivar a este empleado. Inténtalo de nuevo."));
        break;
      }

      case "customer_create": {
        const customerAis = ai.customers?.length ? ai.customers.map(customer => ({ ...ai, customer, customers: undefined })) : [ai];
        const { reply: customerReply } = await beginBatchSlotFill("customer_create", customerAis, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, customerReply);
        break;
      }

      case "customer_list": {
        const customers = await getCustomersByUser(user.id, "active");
        await wppSend(from, replyCustomerList(customers, user.locale));
        break;
      }

      case "customer_query": {
        const custQueryKeyword = ai.keyword || ai.customer?.name || "";
        const custMatches = custQueryKeyword ? await findCustomersByName(user.id, custQueryKeyword) : [];
        await wppSend(from, replyCustomerInfo(custMatches, custQueryKeyword, user.locale));
        break;
      }

      case "customer_update": {
        const custKeyword = ai.keyword || ai.customer?.name || "";
        const custTarget = custKeyword ? await findCustomerByName(user.id, custKeyword) : null;
        if (!custTarget) { await wppSend(from, localized(user.locale, "❓ Não encontrei esse cliente. Digite *meus clientes* para ver a lista.", "❓ No encontré a ese cliente. Escribe *mis clientes* para ver la lista.")); break; }
        const custPatch: Partial<Customer> = {};
        if (ai.customer?.phone) custPatch.phone = ai.customer.phone;
        if (ai.customer?.email) custPatch.email = ai.customer.email;
        if (ai.customer?.company) custPatch.company = ai.customer.company;
        if (ai.customer?.address) custPatch.address = ai.customer.address;
        if (ai.customer?.notes) custPatch.notes = ai.customer.notes;
        if (Object.keys(custPatch).length === 0) { await wppSend(from, localized(user.locale, "❓ O que deseja alterar? Ex: _\"muda o telefone do Pedro para 11988887777\"_", "❓ ¿Qué quieres cambiar? Ej.: _\"cambia el teléfono de Pedro a 56912345678\"_")); break; }
        const custUpdated = await updateCustomer(custTarget.id, user.id, custPatch);
        await wppSend(from, custUpdated ? replyCustomerUpdated(custUpdated, user.locale) : localized(user.locale, "❌ Não consegui atualizar esse cliente agora. Nada foi modificado; tente novamente.", "❌ No pude actualizar a este cliente. No se modificó nada; inténtalo de nuevo."));
        break;
      }

      case "customer_deactivate": {
        const custDeactKeyword = ai.keyword || ai.customer?.name || "";
        const custDeactTarget = custDeactKeyword ? await findCustomerByName(user.id, custDeactKeyword) : null;
        if (!custDeactTarget) { await wppSend(from, localized(user.locale, "❓ Não encontrei esse cliente. Digite *meus clientes* para ver a lista.", "❓ No encontré a ese cliente. Escribe *mis clientes* para ver la lista.")); break; }
        const custDeactivated = await updateCustomer(custDeactTarget.id, user.id, { status: "inactive" });
        await wppSend(from, custDeactivated ? replyCustomerDeactivated(custDeactivated, user.locale) : localized(user.locale, "❌ Não consegui desativar esse cliente agora. Tente novamente.", "❌ No pude desactivar a este cliente. Inténtalo de nuevo."));
        break;
      }

      case "recurring_create": {
        if (ai.recurrings?.length) {
          const recurringAis = ai.recurrings.map(recurring => ({ ...ai, recurring, recurrings: undefined }));
          const { reply } = await beginBatchSlotFill("recurring_create", recurringAis, { user, userId: user.id, phone: from, mode }, messageText);
          await wppSend(from, reply);
          break;
        }
        // Pagamento de funcionário: precisa saber QUAL antes de criar o
        // recorrente, pra não ficar com descrição genérica "Funcionário".
        if (ai.recurring?.employeePayment) {
          const activeEmployees = await getEmployeesByUser(user.id, "active");
          if (activeEmployees.length === 0) {
            ai.recurring = { ...ai.recurring, employeePayment: false, employeeName: undefined, employeeId: null };
          }
          let targetEmployee = ai.recurring.employeeName
            ? (await findEmployeesByName(user.id, ai.recurring.employeeName, "active"))[0] ?? null
            : null;
          if (!targetEmployee && activeEmployees.length === 1) targetEmployee = activeEmployees[0];

          if (activeEmployees.length > 0 && !targetEmployee) {
            await setPendingAction(from, {
              type: "employee_payment_select", userId: user.id, mode,
              recurringData: ai.recurring, originalText: messageText,
              employees: activeEmployees.map(e => ({ id: e.id, name: e.name, role: e.role })),
            });
            await wppSend(from, financeEmployeeSelectionMessage(activeEmployees, user.locale));
            break;
          }

          if (targetEmployee) {
            ai.recurring = { ...ai.recurring, description: `Salário - ${targetEmployee.name}`, employeePayment: false, employeeName: undefined, employeeId: targetEmployee.id };
          }
        }

        const { reply } = await beginSlotFill("recurring_create", ai, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, reply);
        break;
      }

      case "recurring_query": {
        const recs = await getRecurringByUser(user.id, mode, "active");
        await wppSend(from, replyRecurringList(recs, user.locale));
        break;
      }

      case "recurring_cancel": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, localized(user.locale, "❓ Qual recorrente ou parcela deseja cancelar?", "❓ ¿Qué movimiento recurrente o cuota quieres cancelar?")); break; }
        const found = await findRecurringByDescription(user.id, keyword);
        if (!found) { await wppSend(from, localized(user.locale, `❓ Não encontrei recorrente com *"${keyword}"*.\n\nDigite *minhas parcelas* para ver a lista.`, `❓ No encontré ningún movimiento recurrente con *"${keyword}"*.\n\nEscribe *mis cuotas* para ver la lista.`)); break; }
        await cancelRecurring(found.id, user.id);
        await wppSend(from, localized(user.locale, `✅ *${found.description}* cancelado(a)!\n\nSe quiser reativar, acesse *Recorrentes* no dashboard.`, `✅ *${found.description}* se canceló.\n\nSi quieres reactivarlo, entra en *Recurrentes* en el panel.`));
        break;
      }

      case "recurring_edit": {
        const editKw = ai.keyword || ai.recurring?.description || "";
        if (!editKw) { await wppSend(from, localized(user.locale, "❓ Qual recorrente ou parcela deseja editar?", "❓ ¿Qué movimiento recurrente o cuota quieres editar?")); break; }
        const editFound = await findRecurringByDescription(user.id, editKw);
        if (!editFound) { await wppSend(from, localized(user.locale, `❓ Não encontrei recorrente com *"${editKw}"*.\n\nDigite *minhas parcelas* para ver a lista.`, `❓ No encontré ningún movimiento recurrente con *"${editKw}"*.\n\nEscribe *mis cuotas* para ver la lista.`)); break; }
        const patch: Parameters<typeof updateRecurring>[2] = {};
        if (ai.recurring?.amount) patch.amount = ai.recurring.amount;
        if (ai.recurring?.description) patch.description = cap(ai.recurring.description);
        if (ai.recurring?.category) patch.category = cap(ai.recurring.category);
        if (ai.recurring?.dayOfMonth) patch.dayOfMonth = ai.recurring.dayOfMonth;
        if (ai.recurring?.repeatUnit) patch.repeatUnit = ai.recurring.repeatUnit;
        if (ai.recurring?.totalInstallments) patch.totalInstallments = ai.recurring.totalInstallments;
        if (Object.keys(patch).length === 0) { await wppSend(from, localized(user.locale, "❓ O que deseja alterar? Ex: _\"muda o netflix para 65 reais\"_ ou _\"a academia é só até dezembro, 5 meses\"_", "❓ ¿Qué quieres cambiar? Ej.: _\"cambia Netflix a 65 dólares\"_ o _\"el gimnasio termina en diciembre, 5 meses\"_")); break; }
        const editUpdated = await updateRecurring(editFound.id, user.id, patch);
        if (editUpdated) {
          await wppSend(from, localized(user.locale, `✏️ *${editUpdated.description}* atualizado!\n\n💰 Novo valor: ${formatCurrency(editUpdated.amount)}`, `✏️ *${editUpdated.description}* se actualizó.\n\n💰 Nuevo importe: ${formatCurrency(editUpdated.amount)}`));
        } else await wppSend(from, localized(user.locale, "❌ Não consegui atualizar esse recorrente agora. Nada foi modificado; tente novamente.", "❌ No pude actualizar este movimiento recurrente. No se modificó nada; inténtalo de nuevo."));
        break;
      }

      case "drive_search": {
        const driveQuery = ai.keyword || messageText;
        const allFiles = await getFiles(user.id);
        if (!allFiles.length) {
          await wppSend(from, replyDriveFileList(0, user.locale));
          break;
        }
        const fileId = await findDriveFileByAI(driveQuery, allFiles.map(f => ({
          id: f.id, originalName: f.originalName, description: f.description, aiKeywords: f.aiKeywords,
        })));
        if (!fileId) {
          await wppSend(from, replyFileNotFound(driveQuery, user.locale));
          break;
        }
        const foundFile = await getFileById(fileId, user.id);
        if (!foundFile) { await wppSend(from, replyFileNotFound(driveQuery, user.locale)); break; }
        const filePath = getFilePath(foundFile);
        if (!existsSync(filePath)) { await wppSend(from, replyFileNotFound(driveQuery, user.locale)); break; }
        await wppSend(from, replyFileFound(foundFile.originalName, user.locale));
        const fileBuffer = readFileSync(filePath);
        await wppSendFile(from, fileBuffer, foundFile.originalName, foundFile.mimeType);
        break;
      }

      case "drive_rename": {
        const newName = ai.keyword || "";
        if (!newName) { await wppSend(from, localized(user.locale, "❓ Qual o novo nome para o arquivo?", "❓ ¿Cuál será el nuevo nombre del archivo?")); break; }
        const recentFile = await getRecentFile(user.id);
        if (!recentFile) { await wppSend(from, localized(user.locale, "❓ Não encontrei nenhum arquivo recente no Drive.", "❓ No encontré ningún archivo reciente en Drive.")); break; }
        // Gera um nome de arquivo "limpo" a partir da descrição (sem caracteres especiais)
        const ext = recentFile.originalName.includes(".") ? recentFile.originalName.slice(recentFile.originalName.lastIndexOf(".")) : "";
        const cleanName = newName.toLowerCase().replace(/[^a-z0-9\s\-_]/g, "").replace(/\s+/g, "_").slice(0, 60) + ext;
        await updateFile(recentFile.id, user.id, { originalName: cleanName, description: newName });
        await wppSend(from, localized(user.locale, `✅ *Arquivo renomeado!*\n\n📄 ${cleanName}\n💬 Descrição: ${newName}\n\nJá está atualizado no *📁 Drive*. Para encontrar depois: _"ache ${newName}"_`, `✅ *¡Archivo renombrado!*\n\n📄 ${cleanName}\n💬 Descripción: ${newName}\n\nYa está actualizado en *📁 Drive*. Para encontrarlo después: _"busca ${newName}"_`));
        break;
      }

      case "agenda_create": {
        const agendaAis = ai.agendaItems?.length ? ai.agendaItems.map(agendaData => ({ ...ai, agendaData, agendaItems: undefined })) : [ai];
        const { reply: agendaReply } = await beginBatchSlotFill("agenda_create", agendaAis, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, agendaReply);
        break;
      }

      case "agenda_list": {
        const apts = await getUpcomingAppointments(user.id, 14);
        await wppSend(from, replyAgendaList(apts, user.locale));
        break;
      }

      case "agenda_update": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, localized(user.locale, "❓ Qual compromisso deseja alterar?", "❓ ¿Qué cita quieres cambiar?")); break; }
        const matches = await findAppointmentsByKeyword(user.id, keyword);
        if (matches.length === 0) {
          await wppSend(from, localized(user.locale, `❓ Não encontrei nenhum compromisso com *"${keyword}"*.\n\nDigite *meus compromissos* para ver a lista.`, `❓ No encontré ninguna cita con *"${keyword}"*.\n\nEscribe *mis citas* para ver la lista.`));
        } else if (matches.length === 1) {
          const patch = appointmentPatchFromAi(ai, matches[0]);
          if (Object.keys(patch).length === 0) {
            await setPendingAction(from, {
              type: "appointment_selection", userId: user.id, action: "update", patch: {},
              appointments: [{ id: matches[0].id, title: matches[0].title, startAt: matches[0].startAt, location: matches[0].location }],
              awaitingPatch: true, mode,
            });
            await wppSend(from, localized(user.locale, `Certo, encontrei *${matches[0].title}*. O que deseja alterar?\n\nExemplos:\n• _muda para dia 10 às 15h_\n• _altera o local para Escritório_\n• _me avisa 1 hora antes_`, `Encontré *${matches[0].title}*. ¿Qué quieres cambiar?\n\nEjemplos:\n• _cámbiala al día 10 a las 15:00_\n• _cambia el lugar a Oficina_\n• _avísame 1 hora antes_`));
            break;
          }
          const updated = await updateAppointment(matches[0].id, user.id, patch);
          await wppSend(from, updated ? replyAgendaUpdated(updated, user.locale) : localized(user.locale, "❌ Não consegui alterar o compromisso agora. Nada foi modificado; tente novamente.", "❌ No pude cambiar esta cita. No se modificó nada; inténtalo de nuevo."));
        } else {
          const patch = appointmentPatchFromAi(ai);
          await askWhichAppointment(from, user.id, matches, "update", user.locale === "es" ? "reprogramar o cambiar" : "reagendar/alterar", patch, { locale: user.locale });
        }
        break;
      }

      case "agenda_delete": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, localized(user.locale, "❓ Qual compromisso deseja cancelar?", "❓ ¿Qué cita quieres cancelar?")); break; }
        const matches = await findAppointmentsByKeyword(user.id, keyword);
        if (matches.length === 0) {
          await wppSend(from, localized(user.locale, `❓ Não encontrei nenhum compromisso com *"${keyword}"*.\n\nDigite *meus compromissos* para ver a lista.`, `❓ No encontré ninguna cita con *"${keyword}"*.\n\nEscribe *mis citas* para ver la lista.`));
        } else if (matches.length === 1) {
          const deleted = await deleteAppointment(matches[0].id, user.id);
          await wppSend(from, deleted ? replyAgendaDeleted(matches[0].title, user.locale) : localized(user.locale, "❌ Não consegui cancelar esse compromisso agora. Tente novamente.", "❌ No pude cancelar esta cita. Inténtalo de nuevo."));
        } else {
          await askWhichAppointment(from, user.id, matches, "delete", "cancelar", undefined, { locale: user.locale });
        }
        break;
      }

      case "agenda_done": {
        const doneKeyword = ai.keyword || "";
        if (!doneKeyword) { await wppSend(from, localized(user.locale, "❓ Qual compromisso deseja marcar como feito?", "❓ ¿Qué cita quieres marcar como realizada?")); break; }
        const matches = await findAppointmentsByKeyword(user.id, doneKeyword);
        if (matches.length === 0) {
          await wppSend(from, localized(user.locale, `❓ Não encontrei nenhum compromisso com *"${doneKeyword}"*.\n\nDigite *meus compromissos* para ver a lista.`, `❓ No encontré ninguna cita con *"${doneKeyword}"*.\n\nEscribe *mis citas* para ver la lista.`));
        } else if (matches.length === 1) {
          const updated = await updateAppointment(matches[0].id, user.id, { status: "done" });
          await wppSend(from, updated
            ? localized(user.locale, `✅ Marquei como realizado.\n\n📅 ${matches[0].title}`, `✅ La marqué como realizada.\n\n📅 ${matches[0].title}`)
            : localized(user.locale, "❌ Não consegui marcar esse compromisso como realizado. Tente novamente.", "❌ No pude marcar esta cita como realizada. Inténtalo de nuevo."));
        } else {
          await askWhichAppointment(from, user.id, matches, "done", user.locale === "es" ? "marcar como realizada" : "marcar como feito", undefined, { locale: user.locale });
        }
        break;
      }

      case "agenda_add_meet": {
        // Adiciona Google Meet a compromisso existente sem alterar data/hora
        const addMeetKeyword = ai.keyword || "";
        const addMeetMatches = addMeetKeyword
          ? await findAppointmentsByKeyword(user.id, addMeetKeyword)
          : (await getUpcomingAppointments(user.id, 1));
        if (addMeetMatches.length === 0) {
          await wppSend(from, localized(user.locale,
            `❓ Não encontrei o compromisso${addMeetKeyword ? ` com *"${addMeetKeyword}"*` : ""}.\n\nDigite *meus compromissos* para ver a lista.`,
            `❓ No encontré la cita${addMeetKeyword ? ` con *"${addMeetKeyword}"*` : ""}.\n\nEscribe *mis citas* para ver la lista.`,
          ));
        } else if (addMeetMatches.length === 1) {
          await performAddMeet(addMeetMatches[0], user.id, from, user.locale);
        } else {
          await askWhichAppointment(from, user.id, addMeetMatches, "add_meet", user.locale === "es" ? "añadir Google Meet" : "adicionar o Meet", undefined, { locale: user.locale });
        }
        break;
      }

      case "meet_create": {
        const rawMeetItems = ai.meetItems?.length ? ai.meetItems : ai.meetData ? [ai.meetData] : [];
        if (!rawMeetItems.length || rawMeetItems.some(item => !item.startDate || !item.startTime)) {
          await wppSend(from, localized(user.locale, `🗓️ Me diga a data e horário da reunião!\n\nEx: _"reunião amanhã às 14h"_\nEx: _"meet hoje às 16h com João (11 99999-9999)"_`, `🗓️ Indícame la fecha y la hora de la reunión.\n\nEj.: _"reunión mañana a las 14:00"_\nEj.: _"Meet hoy a las 16:00 con Juan (+56 9 1234 5678)"_`));
          break;
        }
        const pendingMeetItems = rawMeetItems.slice(0, 30).map(d => {
          const startAt = spToUTC(`${d.startDate}T${d.startTime}:00`);
          const durationMs = (d.duration || 60) * 60_000;
          return {
            title: cap(d.title || "Reunião"), description: d.description, startAt,
            endAt: d.endDate ? spToUTC(`${d.endDate}T${d.endTime || "00:00"}:00`) : new Date(new Date(startAt).getTime() + durationMs).toISOString(),
            attendees: d.attendees || [],
          };
        });
        const firstMeet = pendingMeetItems[0];
        // Pergunta se quer link do Google Meet
        const { formatDateTimeBR } = await import("@/lib/date-br");
        const timeStr = formatDateTimeBR(firstMeet.startAt);
        await setPendingAction(from, {
          type: "meet_confirm",
          userId: user.id,
          title: firstMeet.title,
          description: firstMeet.description,
          startAt: firstMeet.startAt,
          endAt: firstMeet.endAt,
          attendees: firstMeet.attendees,
          items: pendingMeetItems,
          mode,
        });
        const title = pendingMeetItems.length === 1
          ? `📅 *${firstMeet.title}*\n🕒 ${timeStr}`
          : user.locale === "es"
            ? `📅 *${pendingMeetItems.length} reuniones* — primera: ${firstMeet.title}, ${timeStr}`
            : `📅 *${pendingMeetItems.length} reuniões* — primeira: ${firstMeet.title}, ${timeStr}`;
        const question = user.locale === "es"
          ? `¿Quieres incluir un enlace de *Google Meet* en ${pendingMeetItems.length === 1 ? "esta reunión" : "todas"}?\n\nResponde *Sí* o *No*`
          : user.locale === "pt-PT"
            ? `Queres incluir uma ligação do *Google Meet* em ${pendingMeetItems.length === 1 ? "esta reunião" : "todas"}?\n\nResponde *Sim* ou *Não*`
            : `Deseja incluir link do *Google Meet* em ${pendingMeetItems.length === 1 ? "esta reunião" : "todas"}?\n\nResponda *Sim* ou *Não*`;
        await wppSend(from, `${title}\n${firstMeet.attendees.length > 0 ? `👥 ${firstMeet.attendees.map(a => a.name).join(", ")}\n` : ""}\n${question}`);
        break;
      }

      case "mode_switch": {
        if (phoneAccess !== "both") {
          const accessLabel = phoneAccess === "personal"
            ? (user.locale === "es" ? "personal" : "pessoal")
            : "empresarial";
          await wppSend(from, user.locale === "es"
            ? `❌ Solo tienes acceso al modo *${accessLabel}* en esta cuenta.`
            : user.locale === "pt-PT"
              ? `❌ Só tens acesso ao modo *${accessLabel}* nesta conta.`
              : `❌ Você só tem acesso ao modo *${accessLabel}* nessa conta.`);
          break;
        }
        const newMode = ai.mode || (mode === "personal" ? "business" : "personal");
        await updateUser(user.id, { activeMode: newMode });
        await wppSend(from, replyModeSwitch(newMode, user.locale));
        break;
      }

      case "how_to": {
        if (ai.response) {
          await wppSend(from, ai.response);
        } else {
          await wppSendLong(from, replyHelp(user.locale));
        }
        break;
      }

      case "web_search": {
        if (ai.response) {
          await wppSend(from, ai.response);
          break;
        }
        const query = ai.keyword?.trim() || messageText.trim();
        const missingQuestion = getWebSearchMissingQuestion(query, user.locale);
        if (missingQuestion) {
          await wppSend(from, missingQuestion);
          break;
        }
        await wppSend(from, await generateWebSearchResponse(query, user.locale));
        break;
      }

      case "help": {
        await wppSendLong(from, replyHelp(user.locale));
        break;
      }

      case "category_create": {
        const categoryNames = [...new Map((ai.categoryNames?.length ? ai.categoryNames : ai.categoryName ? [ai.categoryName] : [])
          .map(name => name.trim()).filter(Boolean).map(name => [name.toLocaleLowerCase(), name])).values()].slice(0, 30);
        if (!categoryNames.length) { await wppSend(from, replyUnknown(messageText, user.locale)); break; }

        // Ação de 1 passo só: por padrão cria pros dois tipos ao mesmo tempo
        // (sem perguntar), só restringe se a IA identificou um tipo explícito.
        const targets: Array<"expense" | "income"> = ai.financeType ? [ai.financeType] : ["expense", "income"];
        const summaries: string[] = [];
        for (const type of targets) {
          const defaults = type === "expense" ? CATEGORIES_EXPENSE : CATEGORIES_INCOME;
          const existing = type === "expense" ? [...(user.customCategoriesExpense || [])] : [...(user.customCategoriesIncome || [])];
          const added = categoryNames.filter(name => ![...defaults, ...existing].some(c => c.toLocaleLowerCase() === name.toLocaleLowerCase()));
          if (added.length) {
            const updated = [...existing, ...added];
            if (type === "expense") await updateUser(user.id, { customCategoriesExpense: updated });
            else await updateUser(user.id, { customCategoriesIncome: updated });
          }
          const label = user.locale === "es" ? (type === "expense" ? "gastos" : "ingresos") : (type === "expense" ? "despesas" : "receitas");
          summaries.push(`${label}: ${added.length ? added.join(", ") : user.locale === "es" ? "ninguna nueva" : "nenhuma nova"}`);
        }
        const heading = user.locale === "es"
          ? `✅ Procesé *${categoryNames.length} ${categoryNames.length === 1 ? "categoría" : "categorías"}*.`
          : `✅ Processei *${categoryNames.length} ${categoryNames.length === 1 ? "categoria" : "categorias"}*.`;
        await wppSend(from, `${heading}\n\n${summaries.join("\n")}`);
        break;
      }

      case "finance_clear_history": {
        // Ação irreversível — nunca decide sozinho o modo por engano.
        // Sem sinal explícito na mensagem (nem da IA, nem no texto cru),
        // pergunta em vez de assumir "os dois" ou só um dos modos.
        const lowerMsg = messageText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let clearMode: "personal" | "business" | "both" | null = ai.mode ?? null;
        if (!clearMode) {
          if (/\b(?:pessoal|personal)\b/.test(lowerMsg) && !/\bos dois\b|\btudo\b|\bambos\b|\blos dos\b|\btodo\b/.test(lowerMsg)) clearMode = "personal";
          else if (/\bempresa(rial)?\b|\bnegocio\b/.test(lowerMsg) && !/\bos dois\b|\btudo\b|\bambos\b|\blos dos\b|\btodo\b/.test(lowerMsg)) clearMode = "business";
          else if (/\bos dois\b|\btudo\b|\bambos\b|\blos dos\b|\btodo\b/.test(lowerMsg)) clearMode = "both";
        }
        if (!clearMode) {
          await wppSend(from, user.locale === "es"
            ? "❓ Esto borrará tu historial financiero. ¿Es del modo *personal*, *empresarial* o *los dos*?"
            : "❓ Isso vai apagar seu histórico financeiro. É do modo *pessoal*, *empresa*, ou *os dois*?");
          break;
        }

        const count = await countFinances(user.id, clearMode);
        if (count === 0) {
          await wppSend(from, user.locale === "es" ? "No encontré ningún movimiento para borrar en ese modo." : "Não encontrei nenhum lançamento pra apagar nesse modo.");
          break;
        }
        const modeLabel = user.locale === "es"
          ? clearMode === "personal" ? "personal" : clearMode === "business" ? "empresarial" : "personal y empresarial"
          : clearMode === "personal" ? "pessoal" : clearMode === "business" ? "empresarial" : "pessoal e empresarial";
        await setPendingAction(from, { type: "confirm_clear_history", userId: user.id, mode: clearMode, count });
        await wppSend(from, user.locale === "es"
          ? `⚠️ Esto borrará *${count} ${count === 1 ? "movimiento" : "movimientos"}* del historial ${modeLabel} — gastos e ingresos, definitivamente.\n\nSi estás seguro, responde exactamente *borrar todo*. Cualquier otra respuesta cancela la acción.`
          : `⚠️ Isso vai apagar *${count} lançamento${count === 1 ? "" : "s"}* do histórico ${modeLabel} — despesas e receitas, de vez, sem como desfazer.\n\nSe tiver certeza, responda exatamente *apagar tudo*. Qualquer outra coisa cancela.`);
        break;
      }

      default: {
        const lower = messageText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (lower.includes("ajuda") || lower.includes("ayuda") || lower === "help" || lower === "?") {
          await wppSendLong(from, replyHelp(user.locale));
        } else if (lower.includes("saldo") || lower.includes("resumo") || lower.includes("resumen")) {
          const personal = await getBalance(user.id, "personal", year, month);
          const business = await getBalance(user.id, "business", year, month);
          await wppSend(from, replyBalance(personal, business, undefined, undefined, user.locale));
        } else if (lower.includes("extrato") || lower.includes("extracto") || lower.includes("ultimos")) {
          const recents = await getRecentTransactions(user.id, mode, 10);
          if (!recents.length) {
            await wppSend(from, user.locale === "es" ? "📋 Todavía no encontré ningún movimiento." : "📋 Nenhum lançamento encontrado ainda.");
          } else {
            let msg = user.locale === "es"
              ? `📋 *Últimos movimientos (${mode === "business" ? "Empresa" : "Personal"}):*\n\n`
              : `📋 *Últimos lançamentos (${mode === "business" ? "Empresa" : "Pessoal"}):*\n\n`;
            recents.forEach((f, i) => {
              const emoji = f.type === "income" ? "💰" : "💸";
              const dateLocale = user.locale === "es" ? "es-419" : user.locale === "pt-PT" ? "pt-PT" : "pt-BR";
              msg += `${i + 1}. ${emoji} ${f.description} — ${formatCurrency(f.amount)}\n   📅 ${new Date(f.date + "T12:00:00").toLocaleDateString(dateLocale)} · ${f.category}\n\n`;
            });
            await wppSend(from, msg.trim());
          }
        } else {
          const fallback = await generateFallbackResponse(messageText, recentHistory, user.locale);
          await wppSend(from, fallback || replyUnknown(messageText, user.locale));
        }
      }
    }

    return;
  } catch (e) {
    console.error("[message-handler]", e);
    if (from) {
      if (!responseLocale) {
        try { responseLocale = (await getUserByWppPhone(from))?.locale; } catch { /* usa o DDI abaixo */ }
      }
      try { await wppSend(from, replyProcessingError(responseLocale ?? localeForWhatsAppPhone(from))); } catch { /* ignora */ }
    }
    return;
  }
}
