import { updateUser, hasAccess, getUserByWppCode, getUserById, getMaxWppPhones, generateWppVerifyCode } from "@/lib/users";
import { getUserIdByPhone, linkPhone, setPhoneName, findPhoneByName, setPhoneRelation, findPhoneByRelation, setPhoneAccess, getPhoneAccess, countPhonesForUser } from "@/lib/wpp-phone-links";
import { checkRateLimit } from "@/lib/rate-limit";
import { processMessage, generateAnalysisResponse, categorizeDriveFile, findDriveFileByAI, extractFinanceFromDocument, extractInvoiceTransactions, extractGroceryReceiptItems, type AIResult } from "@/lib/ai-processor";
import { saveFile, getFiles, getFolders, getFolderByName, getFilePath, getFileById, updateFile, getRecentFile } from "@/lib/drive";
import { readFileSync, existsSync } from "fs";
import { addFinance, getBalance, formatCurrency, findFinanceByDescription, deleteFinance, updateFinance, getRecentTransactions, getFinancesLastDays, isLikelyDuplicateExpense, getBalanceInRange, getCategoryTotal, getByCategoryInRange, getTransactionsInRange, getKeywordTotal, expandMerchantAliases, getPendingFinances } from "@/lib/finances";
import { resolveAccountForFinance } from "@/lib/accounts";
import { createTask, getPendingTasks, updateTaskStatus, findTaskByNumber, findTaskByTitle, deleteTask } from "@/lib/tasks";
import { createReminder, getRemindersByUser, findReminderByKeyword, updateReminder, deleteReminder, type Reminder } from "@/lib/reminders";
import { getActiveGoals, updateGoalAmount, updateGoalStatus, findGoalsByTitle, getGoalProgress } from "@/lib/goals";
import { getVehiclesByUser, addVehicleExpense, findVehicleByName, getVehicleTotalExpenses, setExpenseFinanceId, VEHICLE_FINANCE_CATEGORY } from "@/lib/vehicles";
import {
  addFromTemplate, addToShoppingList, getShoppingList, toggleShoppingItem, getSpendByStore,
  findOrCreateStore, addPurchase, setPurchaseFinanceId, getPriceComparison, getStorePriceRanking,
  getSuggestedListItems, categoryForTemplateKey, getPurchasesInRange,
  type GroceryPurchaseItem, type GroceryCategory,
} from "@/lib/grocery";
import { getEmployeesByUser, getTotalPayroll, findEmployeeByName, updateEmployee, type Employee } from "@/lib/employees";
import { getCustomersByUser, findCustomerByName, findCustomersByName, updateCustomer, type Customer } from "@/lib/customers";
import { setPendingAction, getPendingAction, clearPendingAction, parseVehicleChoice, parseGoalChoice, parseAppointmentChoice, parseFinanceChoice, parseFinancePatchFromText, parseYesNo, choiceIndexByLabels } from "@/lib/pending-actions";
import { beginSlotFill, runSlotFillTurn } from "@/lib/slot-filling";
import { getRecurringByUser, confirmRecurring, cancelRecurring, updateRecurring, findRecurringByDescription } from "@/lib/recurring";
import { createAppointment, getUpcomingAppointments, updateAppointment, deleteAppointment, findAppointmentsByKeyword, getAppointmentById, type Appointment } from "@/lib/agenda";
import { createMeetEvent } from "@/lib/google-meet";
import { isConnected } from "@/lib/google-oauth";
import { generateMeetAta } from "@/lib/ai-processor";
import { sendText as wppSend, sendFile as wppSendFile } from "@/lib/whatsapp";
import { getConfig } from "@/lib/whatsapp-config";
import { addMessage, getAiPaused } from "@/lib/conversations";
import { nowBR, spToUTC, todayStrBR, formatDateTimeBR } from "@/lib/date-br";
import {
  replyFinanceRegistered, replyBalance, replyTaskCreated, replyTaskList,
  replyTaskUpdated, replyReminderSet, replyReminderList, replyReminderUpdated, replyReminderDeleted, replyModeSwitch, replyHelp,
  replyTrialExpired, replyAccountInactive, replyUnknown, replyLowConfidence,
  replyRecurringConfirmed, replyRecurringList,
  replyFileSaved, replyFileFound, replyFileNotFound, replyDriveFileList,
  replyAgendaList, replyAgendaUpdated, replyAgendaDeleted,
  replyMeetCreated, replyMeetInvite, replyMeetAtaRequest, replyMeetAtaGenerated,
  replyPersonNotFound, replyWppNameSaved,
  replyGroceryListAdded, replyGroceryList, replyGroceryItemChecked, replyGrocerySpend,
  replyEmployeeList, replyEmployeeUpdated, replyEmployeeDeactivated,
  replyCustomerList, replyCustomerInfo, replyCustomerUpdated, replyCustomerDeactivated,
} from "@/lib/bot-replies";

export function phoneMatches(stored: string, incoming: string): boolean {
  const s = stored.replace(/\D/g, "");
  const i = incoming.replace(/\D/g, "");
  if (!s || !i) return false;
  if (s === i) return true;
  if (i.length >= 9 && s.length >= 9 && (i.endsWith(s.slice(-9)) || s.endsWith(i.slice(-9)))) return true;
  if (i.length >= 11 && s.length >= 11 && (i.endsWith(s.slice(-11)) || s.endsWith(i.slice(-11)))) return true;
  return false;
}

async function getUserByWppPhone(phone: string) {
  const userId = await getUserIdByPhone(phone);
  return userId ? getUserById(userId) : null;
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Pergunta qual compromisso o usuário quis dizer quando a busca por
 *  palavra-chave bate em mais de um (ex: duas "reunião" na mesma semana) —
 *  mesmo padrão usado para lançamentos financeiros e metas ambíguas: nunca
 *  agir na primeira opção que aparecer, sempre listar e deixar o usuário
 *  escolher por número ou nome. */
async function askWhichAppointment(
  from: string, userId: string,
  matches: Appointment[], action: "update" | "delete" | "done" | "add_meet",
  actionLabel: string, patch?: Record<string, unknown>,
): Promise<void> {
  const list = matches.map(a => ({ id: a.id, title: a.title, startAt: a.startAt, location: a.location }));
  await setPendingAction(from, { type: "appointment_selection", userId, action, patch, appointments: list });
  let msg = `🗓️ Encontrei ${matches.length} compromissos. Qual deseja ${actionLabel}?\n\n`;
  matches.forEach((a, i) => { msg += `*${i + 1}.* ${a.title} — ${formatDateTimeBR(a.startAt)}\n`; });
  msg += `\nResponda com o número ou nome. ⏱ _Válido por 5 min._`;
  await wppSend(from, msg);
}

/** Cria o link do Google Meet pra um compromisso já existente — extraído
 *  pra ser reaproveitado tanto no caminho direto (1 compromisso encontrado)
 *  quanto na resolução da desambiguação (usuário escolheu entre vários). */
async function performAddMeet(appt: Appointment, userId: string, from: string): Promise<void> {
  if (appt.meetLink) {
    await wppSend(from, `ℹ️ *${appt.title}* já tem um link do Meet:\n🔗 ${appt.meetLink}`);
    return;
  }
  if (!appt.endAt) {
    await wppSend(from, `⚠️ O compromisso *${appt.title}* não tem horário de fim definido. Edite-o pela agenda para adicionar a hora de término e tente novamente.`);
    return;
  }
  if (!await isConnected(userId)) {
    await wppSend(from, `🔗 Sua conta Google não está conectada.\n\nAcesse *Configurações → Integrações* para conectar e criar links do Meet.`);
    return;
  }
  await wppSend(from, `⏳ Criando link do Google Meet para *${appt.title}*...`);
  try {
    const meetResult = await createMeetEvent({
      userId, title: appt.title, description: appt.description,
      startAt: appt.startAt, endAt: appt.endAt, attendees: [],
    });
    await updateAppointment(appt.id, userId, { meetLink: meetResult.meetLink, calendarEventId: meetResult.calendarEventId });
    await wppSend(from, `✅ *Meet adicionado!*\n\n📅 *${appt.title}*\n🕒 ${formatDateTimeBR(appt.startAt)}\n🔗 ${meetResult.meetLink}`);
  } catch (e) {
    console.error("[agenda_add_meet]", e);
    await wppSend(from, `❌ Não consegui criar o Google Meet. Verifique se sua conta Google ainda está conectada em Configurações.`);
  }
}

// Label do modo (pessoal/empresa) pra deixar claro em listas e confirmações
// de qual lançamento se trata, já que descrição/categoria podem repetir entre modos.
function modeLabelFull(m: string): string {
  return m === "business" ? "🏢 Empresa" : "👤 Pessoal";
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
function periodLabelFor(period: { from?: string; to?: string } | undefined, fallbackDate: Date): string {
  if (!period?.from && !period?.to) {
    return fallbackDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
  const fmt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR");
  if (period.from && period.to) return `${fmt(period.from)} a ${fmt(period.to)}`;
  if (period.from) return `a partir de ${fmt(period.from)}`;
  return `até ${fmt(period.to!)}`;
}

/** Resolve accountId/cardInvoiceId pra um lançamento de finanças a partir de
 *  um "accountHint" opcional extraído pela IA (ex: "Nubank"). Se o hint bater
 *  em mais de uma conta, V1 não abre um fluxo de desambiguação próprio pra
 *  isso (custo alto pra um caso raro) — cai direto pra conta padrão do modo,
 *  mesmo comportamento de quando não há hint nenhum. Sem conta cadastrada,
 *  retorna {} e o lançamento segue exatamente como antes da feature de contas. */
async function resolveAccountFields(
  userId: string, mode: "personal" | "business", accountHint: string | undefined, date: string,
): Promise<{ accountId?: string; cardInvoiceId?: string }> {
  const resolved = await resolveAccountForFinance(userId, mode, accountHint, date);
  if (resolved.ambiguous) {
    const fallback = await resolveAccountForFinance(userId, mode, undefined, date);
    return { accountId: fallback.accountId, cardInvoiceId: fallback.cardInvoiceId };
  }
  return { accountId: resolved.accountId, cardInvoiceId: resolved.cardInvoiceId };
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
        const buffer = msg.fileBuffer!;
        const mimeType = msg.fileMimeType || "application/octet-stream";
        const defaultExt = mimeType.includes("pdf") ? ".pdf" : mimeType.includes("image") ? ".jpg" : "";
        const caption = msg.fileCaption;

        // Extrai um nome explícito da legenda (ex: "salva como etac", "guarda como contrato assinado")
        const nameFromCaption = caption?.match(/(?:salva|salvar|guarda|guardar|arquiva|arquivar|nomeia|nomear|chama|chame)\s+(?:isso\s+|ele\s+|esse\s+arquivo\s+)?(?:de|como)\s+(.+)/i)?.[1]?.trim();
        const originalName = nameFromCaption ? `${nameFromCaption}${defaultExt}` : (msg.fileName || `arquivo_${Date.now()}${defaultExt}`);

        // Verifica se o usuário pediu explicitamente para guardar no Drive
        const SAVE_KEYWORDS = ["guarda", "salva", "arquiva", "armazena", "salvar", "guardar", "arquivar", "arquivo", "pasta", "drive"];
        const hasSaveIntent = !!caption && SAVE_KEYWORDS.some(k => caption.toLowerCase().includes(k));

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
          await wppSend(from, replyFileSaved(suggestedName, suggestedFolder));
          // Só repassa à IA se a legenda tem conteúdo além do comando de salvar
          if (caption && !hasSaveIntent) messageText = caption;
        } catch (e) {
          console.error("[drive] erro ao salvar arquivo:", e);
          await wppSend(from, "❌ Não consegui salvar o arquivo. Tente novamente.");
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
        const linkedCount = await countPhonesForUser(codeUser.id);
        if (linkedCount >= getMaxWppPhones(codeUser)) {
          await wppSend(from, `❌ Esta conta já atingiu o limite de ${getMaxWppPhones(codeUser)} número(s) vinculado(s).`);
          return;
        }
        await updateUser(codeUser.id, { wppVerifyCode: undefined, wppVerifyExpires: undefined });
        await setPendingAction(from, { type: "awaiting_wpp_link_info", userId: codeUser.id, step: "name" });
        await wppSend(from, `✅ Código confirmado!\n\nAntes de vincular, preciso saber quem vai usar esse número.\n\nComo posso te chamar?`);
        return;
      }
    }

    // ── Vinculação em andamento (nome → vínculo → acesso) — precisa vir
    //    ANTES de identificar usuário pelo telefone, pelo mesmo motivo acima ──
    const linkPending = await getPendingAction(from);
    if (linkPending?.type === "awaiting_wpp_link_info") {
      if (linkPending.step === "name") {
        const name = cap(messageText.trim().slice(0, 40)) || "Sem nome";
        await setPendingAction(from, { type: "awaiting_wpp_link_info", userId: linkPending.userId, step: "relation", name });
        await wppSend(from, `Prazer, ${name}! 👋\n\nQual seu vínculo com a conta? _(ex: esposa, marido, filho, sócio, tia...)_`);
        return;
      }
      if (linkPending.step === "relation") {
        const relation = cap(messageText.trim().slice(0, 30)) || "Outro";
        await setPendingAction(from, { type: "awaiting_wpp_link_info", userId: linkPending.userId, step: "access", name: linkPending.name, relation });
        await wppSend(from, `Certo. E qual modo você pode acessar?\n\n1️⃣ Só pessoal\n2️⃣ Só empresarial\n3️⃣ Os dois\n\nResponda o número ou a palavra.`);
        return;
      }
      if (linkPending.step === "access") {
        const t = messageText.trim().toLowerCase();
        const access: "personal" | "business" | "both" | null =
          /^1\b|pessoal/.test(t) ? "personal" :
          /^2\b|empresa/.test(t) ? "business" :
          /^3\b|ambos|os dois|tudo/.test(t) ? "both" : null;
        if (!access) {
          await wppSend(from, `❓ Não entendi. Responda *1* (só pessoal), *2* (só empresarial) ou *3* (os dois).`);
          return;
        }
        await clearPendingAction(from);
        const linkName = linkPending.name || "Sem nome";
        const linkRelation = linkPending.relation || "Outro";
        const linkResult = await linkPhone(linkPending.userId, from);
        if (linkResult === "already_linked_elsewhere") {
          await wppSend(from, "❌ Este número já está vinculado a outra conta. Desvincule-o antes de tentar novamente.");
          return;
        }
        await setPhoneName(linkPending.userId, from, linkName);
        await setPhoneRelation(linkPending.userId, from, linkRelation);
        await setPhoneAccess(linkPending.userId, from, access);
        const accessLabel = access === "personal" ? "modo pessoal" : access === "business" ? "modo empresarial" : "os dois modos";
        await wppSend(from, `✅ *WhatsApp vinculado com sucesso!*\n\n${linkName} (${linkRelation}) já pode usar o Zelo por aqui, com acesso a ${accessLabel}.`);
        return;
      }
    }

    // ── Identifica usuário pelo wppPhone cadastrado ──
    const user = await getUserByWppPhone(from);

    if (!user) {
      await wppSend(from, "Olá! Sou o Zelo, mas ainda não encontrei seu número na minha lista de clientes.\n\nSe você já tem conta, acesse *Configurações* no painel e clique em *Vincular WhatsApp* para gerar seu código.\n\nPara conhecer o Zelo: controlaai.app");
      return;
    }

    // ── Verifica acesso (trial vencido OU desativado pelo admin) ──
    if (!hasAccess(user)) {
      await wppSend(from, user.status === "inactive" ? replyAccountInactive() : replyTrialExpired());
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
    const nameCmdMatch = messageText.trim().match(/^(?:meu nome (?:é|e)|me chamo)\s+(.{2,40})$/i);
    if (nameCmdMatch) {
      const name = cap(nameCmdMatch[1].trim());
      await setPhoneName(user.id, from, name);
      await wppSend(from, replyWppNameSaved(name));
      return;
    }

    // ── Comando para (re)definir o vínculo de quem usa este número ──
    // Frase específica de propósito (igual "meu nome é X") — evita casar com
    // mensagens comuns que começam com "sou" por acaso.
    const relationCmdMatch = messageText.trim().match(/^meu v[íi]nculo (?:é|e)\s+(.{2,30})$/i);
    if (relationCmdMatch) {
      const relation = cap(relationCmdMatch[1].trim());
      await setPhoneRelation(user.id, from, relation);
      await wppSend(from, `Combinado, você é *${relation}* nessa conta. 👍`);
      return;
    }

    // ── Comando pra gerar o código de vinculação de outro número direto pelo
    //    WhatsApp — antes só dava pra gerar entrando no painel web, o que
    //    trava quem só usa o bot pelo celular. Mesma função que o botão
    //    "Vincular mais um número" do painel usa (generateWppVerifyCode). ──
    const linkCodeCmdMatch = /vincular.*n[uú]mero|n[uú]mero.*vincular|c[oó]digo de vincula[çc][ãa]o/i.test(messageText.trim());
    if (linkCodeCmdMatch) {
      const linkedCount = await countPhonesForUser(user.id);
      const max = getMaxWppPhones(user);
      if (linkedCount >= max) {
        await wppSend(from, `❌ Esta conta já atingiu o limite de ${max} número(s) vinculado(s).`);
        return;
      }
      const code = await generateWppVerifyCode(user.id);
      const botNumber = (await getConfig()).wppBotNumber;
      await wppSend(from, `📲 *Código de vinculação:* ${code}\n\nPeça para a pessoa salvar${botNumber ? ` o número *${botNumber}*` : " este número do Zelo"} e mandar esse código por aqui — o bot vai perguntar o nome dela, o vínculo e o modo (pessoal/empresa/os dois) que ela pode acessar.\n\n⏱ Válido por 10 minutos.`);
      return;
    }

    // ── Verifica ação pendente (ex: seleção de veículo) ──
    const pending = await getPendingAction(from);

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
            await wppSend(from, replyFileSaved(pending.suggestedName, suggestedFolder));
          } catch (e) {
            console.error("[drive] erro ao salvar comprovante:", e);
            await wppSend(from, "❌ Não consegui guardar o comprovante. Tente novamente.");
          }
        } else {
          await wppSend(from, "Combinado, não vou guardar esse comprovante. 👍");
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
            const { accountId, cardInvoiceId } = await resolveAccountFields(user.id, pending.mode, pending.accountHint, item.date);
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
      const choiceIdx = parseVehicleChoice(messageText, pending.vehicles);
      if (choiceIdx >= 0) {
        await clearPendingAction(from);
        const chosen = pending.vehicles[choiceIdx];
        const typeEmoji: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };
        const exp = await addVehicleExpense(chosen.id, user.id, { date: pending.expenseData.date, km: pending.expenseData.km, type: pending.expenseData.expenseType, amount: pending.expenseData.amount, description: pending.expenseData.description });
        if (exp) {
          const newExp = exp.expenses[exp.expenses.length - 1];
          const f = await addFinance({ userId: user.id, type: "expense", amount: pending.expenseData.amount, category: VEHICLE_FINANCE_CATEGORY[pending.expenseData.expenseType] || "Transporte", description: `${pending.expenseData.description} — ${chosen.brand} ${chosen.model}`, date: pending.expenseData.date, mode: pending.mode as "personal" | "business", source: "whatsapp", registeredBy: from });
          await setExpenseFinanceId(chosen.id, newExp.id, f.id);
          const total = getVehicleTotalExpenses(exp);
          await wppSend(from, `${typeEmoji[pending.expenseData.expenseType] || "📌"} *Registrado no ${chosen.brand} ${chosen.model}!*\n\n💰 ${formatCurrency(pending.expenseData.amount)} — ${pending.expenseData.description}\n📊 Total do veículo: ${formatCurrency(total)}`);
        }
        return;
      } else {
        // não é uma resposta de veículo — limpa pendência e processa normalmente
        await clearPendingAction(from);
      }
    }

    // ── Verifica seleção de funcionário pendente (pagamento recorrente) ──
    if (pending?.type === "employee_payment_select" && pending.userId === user.id) {
      const choiceIdx = choiceIndexByLabels(messageText, pending.employees, e => [e.name]);
      if (choiceIdx >= 0) {
        await clearPendingAction(from);
        const chosen = pending.employees[choiceIdx];
        const resumedAi: AIResult = {
          intent: "recurring_create",
          confidence: 1,
          recurring: { ...pending.recurringData, description: `Salário - ${chosen.name}`, employeePayment: false, employeeName: undefined },
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
          }
        } else if (pending.action === "complete") {
          const updated = await updateGoalStatus(chosen.id, user.id, "completed");
          if (updated) await wppSend(from, `🏆 *Meta concluída!*\n\n🎯 ${updated.title}\n\nParabéns! Você atingiu seu objetivo! 🎉`);
        } else if (pending.action === "cancel") {
          const updated = await updateGoalStatus(chosen.id, user.id, "cancelled");
          if (updated) await wppSend(from, `🗑️ Meta cancelada.\n\n🎯 ${updated.title}`);
        }
        return;
      } else {
        await clearPendingAction(from);
      }
    }

    // ── Verifica seleção de compromisso pendente (reagendar/cancelar/concluir/add_meet com múltiplos resultados) ──
    if (pending?.type === "appointment_selection" && pending.userId === user.id) {
      const apptChoiceIdx = parseAppointmentChoice(messageText, pending.appointments);
      if (apptChoiceIdx >= 0) {
        await clearPendingAction(from);
        const chosenAppt = pending.appointments[apptChoiceIdx];
        if (pending.action === "update") {
          const updated = await updateAppointment(chosenAppt.id, user.id, (pending.patch || {}) as Parameters<typeof updateAppointment>[2]);
          if (updated) await wppSend(from, replyAgendaUpdated(updated));
        } else if (pending.action === "delete") {
          await deleteAppointment(chosenAppt.id, user.id);
          await wppSend(from, replyAgendaDeleted(chosenAppt.title));
        } else if (pending.action === "done") {
          await updateAppointment(chosenAppt.id, user.id, { status: "done" });
          await wppSend(from, `✅ Marquei como realizado.\n\n📅 ${chosenAppt.title}`);
        } else if (pending.action === "add_meet") {
          const full = await getAppointmentById(chosenAppt.id, user.id);
          if (full) await performAddMeet(full, user.id, from);
        }
        return;
      } else {
        await clearPendingAction(from);
      }
    }

    // ── Seleção de lançamento financeiro (editar/excluir com múltiplos resultados) ──
    if (pending?.type === "finance_select" && pending.userId === user.id) {
      const hasPatch = !!(pending.patch && Object.keys(pending.patch).length > 0);

      // Já sabemos QUAL lançamento (etapa anterior escolheu 1) e só falta o que
      // mudar — interpreta a mensagem atual como o novo valor/categoria, não
      // como uma escolha de número.
      if (pending.action === "edit" && !hasPatch && pending.candidates.length === 1) {
        const patch = parseFinancePatchFromText(messageText);
        if (Object.keys(patch).length === 0) {
          await wppSend(from, `❓ Não entendi o que alterar. Ex: _"80 reais"_ ou _"categoria Lazer"_`);
          return;
        }
        await clearPendingAction(from);
        const chosen = pending.candidates[0];
        const updated = await updateFinance(chosen.id, user.id, patch as Parameters<typeof updateFinance>[2]);
        if (updated) {
          const bal = await getBalance(user.id, updated.mode as "personal" | "business", year, month);
          const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
          await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
        }
        return;
      }

      const choiceIdx = parseFinanceChoice(messageText, pending.candidates);
      if (choiceIdx >= 0) {
        const chosen = pending.candidates[choiceIdx];

        // Editar mas ainda não sabemos o que mudar → guarda só esse alvo e pergunta
        if (pending.action === "edit" && !hasPatch) {
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "edit",
            candidates: [chosen],
          });
          await wppSend(from, `🔍 Encontrei: *${chosen.description}* — ${formatCurrency(chosen.amount)} (${chosen.category}) · ${modeLabelFull(chosen.mode)}\n\nO que deseja alterar? Ex:\n• _"muda para 80 reais"_\n• _"muda categoria para Lazer"_`);
          return;
        }

        await clearPendingAction(from);
        if (pending.action === "edit" && hasPatch) {
          const updated = await updateFinance(chosen.id, user.id, pending.patch as Parameters<typeof updateFinance>[2]);
          if (updated) {
            const bal = await getBalance(user.id, updated.mode as "personal" | "business", year, month);
            const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
            await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
          }
        } else if (pending.action === "delete") {
          const delOk = await deleteFinance(chosen.id, user.id);
          if (delOk) {
            const delBal = await getBalance(user.id, chosen.mode as "personal" | "business", year, month);
            await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${chosen.description} — ${formatCurrency(chosen.amount)}\n📅 ${new Date(chosen.date + "T12:00:00").toLocaleDateString("pt-BR")}\n${modeLabelFull(chosen.mode)}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
          }
        }
        return;
      }
      // Resposta inválida: lista novamente
      const list = pending.candidates.map((c, i) =>
        `${i + 1}️⃣ ${formatCurrency(c.amount)} · ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
      ).join("\n");
      await wppSend(from, `❓ Não entendi. Responda com o número ou a data:\n\n${list}\n\nEx: *1* ou *04/07*`);
      return;
    }

    // ── Confirmação de Meet (sim/não) ──
    if (pending?.type === "meet_confirm" && pending.userId === user.id) {
      const lower = messageText.toLowerCase().trim();
      const yes = ["sim", "s", "yes", "y", "1", "quero", "pode", "ok", "confirmar"].some(w => lower.includes(w));
      const no = ["não", "nao", "n", "no", "0", "sem", "cancela"].some(w => lower.includes(w));
      if (yes || no) {
        await clearPendingAction(from);
        let meetLink: string | undefined;
        let calendarEventId: string | undefined;
        if (yes && await isConnected(user.id)) {
          try {
            const r = await createMeetEvent({
              userId: user.id, title: pending.title, description: pending.description,
              startAt: pending.startAt, endAt: pending.endAt, attendees: pending.attendees,
            });
            meetLink = r.meetLink;
            calendarEventId = r.calendarEventId;
          } catch (e) {
            console.error("[meet_confirm]", e);
            await wppSend(from, "⚠️ Não consegui gerar o link do Meet. Criando o compromisso sem link...");
          }
        } else if (yes && !await isConnected(user.id)) {
          await wppSend(from, "⚠️ Sua conta Google não está conectada. Criando o compromisso sem link Meet.");
        }
        const apt = await createAppointment({
          userId: user.id, title: pending.title, description: pending.description,
          startAt: pending.startAt, endAt: pending.endAt,
          allDay: false, repeat: "none", status: "scheduled", source: "whatsapp",
          meetLink, calendarEventId,
        });
        await wppSend(from, replyMeetCreated(apt));
        for (const a of pending.attendees.filter(a => a.phone)) {
          await wppSend(a.phone!, replyMeetInvite(apt, a.name));
        }
      } else {
        await wppSend(from, `Responda *Sim* para incluir o link do Google Meet ou *Não* para criar só o compromisso.`);
      }
      return;
    }

    // ── Resposta de ata de reunião ──
    if (pending?.type === "meet_ata" && pending.userId === user.id) {
      if (messageText) {
        await clearPendingAction(from);
        const ata = await generateMeetAta(messageText, pending.meetTitle, []);
        await updateAppointment(pending.meetId, user.id, { ataGenerated: true, ataContent: ata.summary });
        for (const taskTitle of ata.tasks) {
          await createTask({ userId: user.id, title: cap(taskTitle), priority: "medium", status: "pending", mode });
        }
        await wppSend(from, replyMeetAtaGenerated(pending.meetTitle, ata));
      } else {
        await wppSend(from, `Para gerar a ata, me envie um *áudio* ou *texto* com o resumo da reunião. ⏱ ${replyMeetAtaRequest(pending.meetTitle)}`);
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
          await wppSend(from, replyRecurringConfirmed(result.updated));
        }
      } else if (isNo) {
        await clearPendingAction(from);
        await wppSend(from, "Ok! Quando quiser marcar como pago, acesse *Recorrentes* no dashboard. 👍");
      } else {
        await wppSend(from, `Não entendi. Responda *sim* se ${pending.installmentNumber ? "a parcela foi paga" : "foi pago/recebido"} ou *não* para deixar pendente.`);
      }
      return;
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

    // ── Processa com IA ──
    const ai = await processMessage(messageText, { user });
    console.log(`[bot] ${user.name} | intent=${ai.intent} | confidence=${ai.confidence} | mode=${mode}`);

    // Confiança baixa — pede esclarecimento antes de agir
    // Edit/delete são isentos: têm segurança embutida (só age se encontrar o lançamento)
    const isEditIntent = ai.intent === "finance_edit" || ai.intent === "finance_delete";
    if (ai.confidence < 0.6 && ai.intent !== "unknown" && ai.intent !== "help" && !isEditIntent) {
      const details = ai.finance
        ? `💰 Valor: ${formatCurrency(ai.finance.amount)}\n🏷️ Categoria: ${ai.finance.category}\n📝 Descrição: ${ai.finance.description}`
        : ai.task
        ? `📌 Título: ${ai.task.title}`
        : ai.reminder
        ? `🔔 Mensagem: ${ai.reminder.message}`
        : "";
      await wppSend(from, replyLowConfidence(ai.intent, details, messageText));
      return;
    }

    switch (ai.intent) {

      case "finance_register": {
        // Suporte a múltiplos lançamentos de uma vez (campo "finances") ou único ("finance")
        const financeItems = (ai.finances && ai.finances.length > 0)
          ? ai.finances
          : (ai.finance ? [ai.finance] : []);
        if (!financeItems.length) { await wppSend(from, replyUnknown(messageText)); break; }

        const today = todayStrBR();

        if (financeItems.length === 1) {
          // Lançamento único
          const fd = financeItems[0];
          const financeMode = (fd.mode || "personal") as "personal" | "business";
          const financeDate = fd.date || today;
          const isPending = financeDate > today;
          const { accountId, cardInvoiceId } = await resolveAccountFields(user.id, financeMode, fd.accountHint, financeDate);
          const f = await addFinance({
            userId: user.id, type: fd.type, amount: fd.amount,
            category: cap(fd.category) || "Outros", description: cap(fd.description),
            date: financeDate, mode: financeMode, source: "whatsapp",
            status: isPending ? "pending" : "posted",
            registeredBy: from, accountId, cardInvoiceId,
          });
          const bal = await getBalance(user.id, financeMode, year, month);
          const modeSuffix = ` _(${financeMode === "business" ? "🏢 Empresa" : "👤 Pessoal"})_`;
          if (isPending) {
            const dtFormatted = new Date(financeDate + "T12:00:00").toLocaleDateString("pt-BR");
            const typeLabel = fd.type === "income" ? "Receita" : "Despesa";
            const typeEmoji = fd.type === "income" ? "💰" : "💸";
            await wppSend(from, `⏳ *${typeLabel} agendada!*${modeSuffix}\n\n${typeEmoji} ${f.description} — ${formatCurrency(f.amount)}\n🏷️ ${f.category}\n📅 Será contabilizada em *${dtFormatted}*\n\n_Lançamentos futuros não entram no saldo até a data chegar._`);
          } else {
            await wppSend(from, replyFinanceRegistered(f, bal.balance));
          }
        } else {
          // Múltiplos lançamentos — registra todos e exibe resumo
          const registered: Array<Awaited<ReturnType<typeof addFinance>> & { pending: boolean }> = [];
          for (const fd of financeItems) {
            const financeMode = (fd.mode || "personal") as "personal" | "business";
            const financeDate = fd.date || today;
            const isPending = financeDate > today;
            const { accountId, cardInvoiceId } = await resolveAccountFields(user.id, financeMode, fd.accountHint, financeDate);
            const f = await addFinance({
              userId: user.id, type: fd.type, amount: fd.amount,
              category: cap(fd.category) || "Outros", description: cap(fd.description),
              date: financeDate, mode: financeMode, source: "whatsapp",
              status: isPending ? "pending" : "posted",
              registeredBy: from, accountId, cardInvoiceId,
            });
            registered.push({ ...f, pending: isPending });
          }
          const primaryMode = (financeItems[0].mode || "personal") as "personal" | "business";
          const bal = await getBalance(user.id, primaryMode, year, month);
          const posted = registered.filter(f => !f.pending);
          const pending = registered.filter(f => f.pending);
          const totalIncome = posted.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
          const totalExpense = posted.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
          const modeLabel = primaryMode === "business" ? "🏢 Empresa" : "👤 Pessoal";
          let msg = `✅ *${registered.length} lançamentos registrados!*\n_(${modeLabel})_\n\n`;
          for (const f of posted) {
            const emoji = f.type === "income" ? "💰" : "💸";
            msg += `${emoji} ${f.description} — ${formatCurrency(f.amount)}\n`;
          }
          if (pending.length > 0) {
            msg += `\n⏳ *Agendados (data futura):*\n`;
            for (const f of pending) {
              const emoji = f.type === "income" ? "💰" : "💸";
              const dt = new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR");
              msg += `${emoji} ${f.description} — ${formatCurrency(f.amount)} _(${dt})_\n`;
            }
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

        const editPatch: Record<string, unknown> = {};
        if (ai.finance?.amount && ai.finance.amount > 0) editPatch.amount = ai.finance.amount;
        if (ai.finance?.category) editPatch.category = ai.finance.category;
        if (ai.finance?.date) editPatch.date = ai.finance.date;
        if (ai.newDescription) editPatch.description = ai.newDescription;

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
          }
          break;
        }

        // Achou exatamente 1 pela palavra-chave mas ainda não sabemos o que mudar
        if (keyword && editCandidates.length === 1) {
          const editTarget = editCandidates[0];
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "edit",
            candidates: [{ id: editTarget.id, description: editTarget.description, amount: editTarget.amount, date: editTarget.date, category: editTarget.category, mode: editTarget.mode }],
          });
          await wppSend(from, `🔍 Encontrei: *${editTarget.description}* — ${formatCurrency(editTarget.amount)} (${editTarget.category}) · ${modeLabelFull(editTarget.mode)}\n\nO que deseja alterar? Ex:\n• _"muda para 80 reais"_\n• _"muda categoria para Lazer"_`);
          break;
        }

        // Palavra-chave achou vários → deixa escolher entre eles
        if (editCandidates.length > 1) {
          const list = editCandidates.map((c, i) =>
            `${i + 1}️⃣ *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
          ).join("\n");
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "edit",
            candidates: editCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
            patch: editPatch,
          });
          await wppSend(from, `✏️ Encontrei *${editCandidates.length} lançamentos* com *"${keyword}"*:\n\n${list}\n\nQual deles deseja alterar? Responda com o número ou a data (ex: *1* ou *04/07*).`);
          break;
        }

        // Sem palavra-chave, ou palavra-chave não achou nada → lista os últimos
        // 5 dias de gastos/receitas pra escolher, em vez de um beco sem saída
        const recentCandidates = await getFinancesLastDays(user.id, null, 5);
        if (!recentCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento nos últimos 5 dias${keyword ? ` com *"${keyword}"*` : ""}.\n\nDigite *extrato* para ver os lançamentos.`);
          break;
        }
        const recentList = recentCandidates.map((c, i) =>
          `${i + 1}️⃣ ${c.type === "income" ? "💰" : "💸"} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
        ).join("\n");
        await setPendingAction(from, {
          type: "finance_select", userId: user.id,
          action: "edit",
          candidates: recentCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
          patch: editPatch,
        });
        await wppSend(from, `✏️ ${keyword ? `Não encontrei nada com *"${keyword}"*, mas aqui` : "Aqui"} estão os lançamentos dos últimos 5 dias:\n\n${recentList}\n\nQual deles deseja alterar? Responda com o número ou a data (ex: *1* ou *04/07*).`);
        break;
      }

      case "finance_delete": {
        const delKeyword = ai.keyword || ai.finance?.description || ai.finance?.category || "";
        console.log(`[bot] finance_delete keyword="${delKeyword}"`);

        const delCandidates = delKeyword ? await findFinanceByDescription(user.id, null, delKeyword) : [];
        console.log(`[bot] finance_delete encontrados por palavra-chave=${delCandidates.length}`);

        // Achou exatamente 1 pela palavra-chave → exclui direto (fluxo rápido)
        if (delKeyword && delCandidates.length === 1) {
          const delTarget = delCandidates[0];
          const delOk = await deleteFinance(delTarget.id, user.id);
          if (delOk) {
            const delBal = await getBalance(user.id, delTarget.mode as "personal" | "business", year, month);
            await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${delTarget.description} — ${formatCurrency(delTarget.amount)}\n📅 ${new Date(delTarget.date + "T12:00:00").toLocaleDateString("pt-BR")}\n${modeLabelFull(delTarget.mode)}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
          }
          break;
        }

        // Palavra-chave achou vários → deixa escolher entre eles
        if (delCandidates.length > 1) {
          const delList = delCandidates.map((c, i) =>
            `${i + 1}️⃣ *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
          ).join("\n");
          await setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "delete",
            candidates: delCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
          });
          await wppSend(from, `🗑️ Encontrei *${delCandidates.length} lançamentos* com *"${delKeyword}"*:\n\n${delList}\n\nQual deles deseja excluir? Responda com o número ou a data (ex: *1* ou *04/07*).`);
          break;
        }

        // Sem palavra-chave, ou palavra-chave não achou nada → lista os últimos
        // 5 dias de gastos/receitas pra escolher, em vez de um beco sem saída
        const recentCandidates = await getFinancesLastDays(user.id, null, 5);
        if (!recentCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento nos últimos 5 dias${delKeyword ? ` com *"${delKeyword}"*` : ""}.\n\nDigite *extrato* para ver os lançamentos.`);
          break;
        }
        const recentList = recentCandidates.map((c, i) =>
          `${i + 1}️⃣ ${c.type === "income" ? "💰" : "💸"} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
        ).join("\n");
        await setPendingAction(from, {
          type: "finance_select", userId: user.id,
          action: "delete",
          candidates: recentCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
        });
        await wppSend(from, `🗑️ ${delKeyword ? `Não encontrei nada com *"${delKeyword}"*, mas aqui` : "Aqui"} estão os lançamentos dos últimos 5 dias:\n\n${recentList}\n\nQual deles deseja excluir? Responda com o número ou a data (ex: *1* ou *04/07*).`);
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
        });
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
          const isIncome = ai.financeType === "income";
          const targetType = isIncome ? "income" : "expense";
          const typeLabel = isIncome ? "Receitas" : "Despesas";
          const typeEmoji = isIncome ? "💰" : "💸";
          const catEmoji = isIncome ? "🟢" : "🔴";

          const [dFrom, dTo] = ai.period?.from || ai.period?.to
            ? [ai.period.from, ai.period.to]
            : monthBounds(year, month);
          const txList = (await getTransactionsInRange(user.id, detailMode, dFrom, dTo)).filter(f =>
            f.type === targetType && !isNaN(f.amount) && f.amount > 0
          );
          const monthTitle = periodLabelFor(ai.period, now);
          const modeLabel = detailMode === "business" ? "Empresa" : "Pessoal";
          if (!txList.length) {
            await wppSend(from, `📋 Nenhuma ${typeLabel.toLowerCase()} registrada em *${monthTitle}* (${modeLabel}).`);
            break;
          }
          // Agrupa por categoria ordenado por maior valor
          const byCat: Record<string, { items: typeof txList; total: number }> = {};
          for (const f of txList) {
            if (!byCat[f.category]) byCat[f.category] = { items: [], total: 0 };
            byCat[f.category].items.push(f);
            byCat[f.category].total += f.amount;
          }
          const sortedCats = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total);
          const total = txList.reduce((s, f) => s + f.amount, 0);
          let detailMsg = `📋 *${typeLabel} — ${monthTitle}*\n_(${modeLabel})_\n\n`;
          for (const [cat, { items, total: catTotal }] of sortedCats) {
            detailMsg += `${catEmoji} *${cat}* — ${formatCurrency(catTotal)}\n`;
            for (const f of items) {
              const d = new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              detailMsg += `   • ${f.description} — ${formatCurrency(f.amount)} _(${d})_\n`;
            }
            detailMsg += "\n";
          }
          detailMsg += `━━━━━━━━━━━━\n${typeEmoji} *Total: ${formatCurrency(total)}*`;
          const finalMsg = detailMsg.trim();
          await wppSend(from, finalMsg.length > 4000 ? finalMsg.slice(0, 3950) + "\n\n_(lista truncada — veja o restante no dashboard)_" : finalMsg);
        } catch (detailErr) {
          console.error("[finance_detail]", detailErr);
          await wppSend(from, "❌ Não consegui gerar o extrato. Tente novamente.");
        }
        break;
      }

      case "finance_query":
      case "balance_query": {
        const [pFrom, pTo] = ai.period?.from || ai.period?.to
          ? [ai.period.from, ai.period.to]
          : monthBounds(year, month);
        const periodLabel = periodLabelFor(ai.period, now);

        if (ai.category) {
          const catMode = (ai.mode as "personal" | "business" | undefined) || mode;
          const catType: "income" | "expense" = ai.financeType === "income" ? "income" : "expense";
          const total = await getCategoryTotal(user.id, catMode, catType, ai.category, pFrom, pTo);
          const catModeLabel = catMode === "business" ? "Empresa" : "Pessoal";
          const verb = catType === "income" ? "recebeu" : "gastou";
          await wppSend(from, `${catType === "income" ? "💰" : "💸"} Você ${verb} *${formatCurrency(total)}* com *${ai.category}* em ${periodLabel} (${catModeLabel}).`);
          break;
        }

        // Comerciante/app específico (ex: "quanto gastei com ifood") — busca
        // na descrição, não na categoria, porque a descrição pode ter ficado
        // abreviada num extrato importado ("IFD" em vez de "iFood").
        if (ai.keyword) {
          const kwMode = (ai.mode as "personal" | "business" | undefined) || mode;
          const kwType: "income" | "expense" = ai.financeType === "income" ? "income" : "expense";
          const terms = expandMerchantAliases(ai.keyword);
          const total = await getKeywordTotal(user.id, kwMode, kwType, terms, pFrom, pTo);
          const kwModeLabel = kwMode === "business" ? "Empresa" : "Pessoal";
          const verb = kwType === "income" ? "recebeu" : "gastou";
          await wppSend(from, `${kwType === "income" ? "💰" : "💸"} Você ${verb} *${formatCurrency(total)}* com *${ai.keyword}* em ${periodLabel} (${kwModeLabel}).`);
          break;
        }

        if (ai.personName) {
          const personPhone = (await findPhoneByName(user.id, ai.personName)) ?? (await findPhoneByRelation(user.id, ai.personName));
          if (!personPhone) {
            await wppSend(from, replyPersonNotFound(ai.personName));
            break;
          }
          const personal = await getBalanceInRange(user.id, "personal", pFrom, pTo, personPhone);
          const business = await getBalanceInRange(user.id, "business", pFrom, pTo, personPhone);
          await wppSend(from, replyBalance(personal, business, ai.personName, periodLabel));
          break;
        }
        const personal = await getBalanceInRange(user.id, "personal", pFrom, pTo);
        const business = await getBalanceInRange(user.id, "business", pFrom, pTo);
        await wppSend(from, replyBalance(personal, business, undefined, periodLabel));
        break;
      }

      case "task_create": {
        if (!ai.task) { await wppSend(from, replyUnknown(messageText)); break; }
        const taskMode = ai.task.mode || mode;
        const task = await createTask({ userId: user.id, title: cap(ai.task.title), priority: ai.task.priority || "medium", dueDate: ai.task.dueDate, status: "pending", mode: taskMode });
        await wppSend(from, replyTaskCreated(task));
        break;
      }

      case "task_query": {
        const tasks = await getPendingTasks(user.id, mode);
        await wppSend(from, replyTaskList(tasks, mode));
        break;
      }

      case "task_update": {
        let taskToUpdate = null;
        if (ai.task?.taskNumber) taskToUpdate = await findTaskByNumber(user.id, ai.task.taskNumber, mode);
        else if (ai.task?.title) taskToUpdate = await findTaskByTitle(user.id, ai.task.title, mode);
        const numMatch = messageText.match(/(\d+)/);
        if (!taskToUpdate && numMatch) taskToUpdate = await findTaskByNumber(user.id, parseInt(numMatch[1]), mode);
        if (taskToUpdate) {
          const updated = await updateTaskStatus(taskToUpdate.id, user.id, ai.task?.newStatus || "completed");
          if (updated) await wppSend(from, replyTaskUpdated(updated));
        } else {
          await wppSend(from, "❓ Tarefa não encontrada. Digite *minhas tarefas* para ver a lista.");
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
          await wppSend(from, `🗑️ Tarefa excluída.\n\n📌 ${taskToDelete.title}`);
        } else {
          await wppSend(from, "❓ Tarefa não encontrada. Digite *minhas tarefas* para ver a lista.");
        }
        break;
      }

      case "reminder_set": {
        if (!ai.reminder?.message || !ai.reminder?.scheduledAt) { await wppSend(from, replyUnknown(messageText)); break; }
        // Converte horário SP (gerado pela IA) para UTC antes de salvar
        const scheduledUTC = spToUTC(ai.reminder.scheduledAt);

        let targetPhone = from;
        let recipientType: "self" | "customer" | "employee" | "other" = "self";
        let recipientName: string | undefined;

        const recipientQuery = ai.reminder.recipientName;
        if (recipientQuery) {
          // Assessor notifica por você: se o pedido citar outra pessoa, resolve
          // o telefone real dela (cliente → funcionário → número da família
          // já vinculado) antes de agendar — sem isso, todo lembrete ia sempre
          // pro número de quem mandou a mensagem.
          const customer = await findCustomerByName(user.id, recipientQuery);
          const employee = await findEmployeeByName(user.id, recipientQuery);
          const linkedPhone = await findPhoneByName(user.id, recipientQuery);

          if (customer?.phone) {
            targetPhone = customer.phone; recipientType = "customer"; recipientName = customer.name;
          } else if (employee?.phone) {
            targetPhone = employee.phone; recipientType = "employee"; recipientName = employee.name;
          } else if (linkedPhone) {
            targetPhone = linkedPhone; recipientType = "other"; recipientName = recipientQuery;
          } else {
            await wppSend(from, `❓ Não encontrei *${cap(recipientQuery)}* com telefone cadastrado. Cadastre o contato (cliente, funcionário ou número da família) antes de criar esse lembrete pra ele, ou peça de novo sem citar ninguém pra lembrar você mesmo.`);
            break;
          }
        }

        await createReminder({ userId: user.id, message: cap(ai.reminder.message), phone: targetPhone, scheduledAt: scheduledUTC, repeat: ai.reminder.repeat || "none", mode: ai.reminder.mode || mode, recipientType, recipientName });
        await wppSend(from, replyReminderSet(ai.reminder.message, scheduledUTC, ai.reminder.repeat || "none", recipientName));
        break;
      }

      case "reminder_list": {
        const reminders = await getRemindersByUser(user.id, mode);
        await wppSend(from, replyReminderList(reminders));
        break;
      }

      case "reminder_update": {
        const keyword = ai.keyword || "";
        const target = keyword ? await findReminderByKeyword(user.id, keyword, mode) : null;
        if (!target) { await wppSend(from, "❓ Não encontrei esse lembrete. Digite *meus lembretes* para ver a lista."); break; }
        const patch: Partial<Pick<Reminder, "message" | "scheduledAt" | "repeat">> = {};
        if (ai.reminder?.message) patch.message = cap(ai.reminder.message);
        if (ai.reminder?.scheduledAt) patch.scheduledAt = spToUTC(ai.reminder.scheduledAt);
        if (ai.reminder?.repeat) patch.repeat = ai.reminder.repeat;
        const updated = await updateReminder(target.id, user.id, patch);
        if (updated) await wppSend(from, replyReminderUpdated(updated));
        break;
      }

      case "reminder_delete": {
        const delKeyword = ai.keyword || "";
        const delTarget = delKeyword ? await findReminderByKeyword(user.id, delKeyword, mode) : null;
        if (!delTarget) { await wppSend(from, "❓ Não encontrei esse lembrete. Digite *meus lembretes* para ver a lista."); break; }
        if (await deleteReminder(delTarget.id, user.id)) await wppSend(from, replyReminderDeleted(delTarget.message));
        break;
      }

      case "goal_create": {
        const { reply: goalReply } = await beginSlotFill("goal_create", ai, { user, userId: user.id, phone: from, mode }, messageText);
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
          }
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
          await updateGoalStatus(matches[0].id, user.id, "completed");
          await wppSend(from, `🏆 *Meta concluída!*\n\n🎯 ${matches[0].title}\n\nParabéns! Você atingiu seu objetivo! 🎉`);
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
          await updateGoalStatus(cancelMatches[0].id, user.id, "cancelled");
          await wppSend(from, `🗑️ Meta cancelada.\n\n🎯 ${cancelMatches[0].title}`);
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

      case "vehicle_expense": {
        const vAmount = ai.vehicle?.amount || ai.finance?.amount || 0;
        const vType = ai.vehicle?.expenseType || "other";
        const vDesc = cap(ai.vehicle?.description || ai.finance?.description || vType);

        if (!vAmount || vAmount <= 0) {
          await wppSend(from, `❓ Não consegui identificar o valor do gasto.\n\nTente assim:\n_"Gastei 50 reais de combustível"_\n_"Paguei 300 de manutenção no carro"_`);
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
          await wppSend(from, `${replyFinanceRegistered(f, bal)}\n\n💡 _Dica: Cadastre seu veículo no dashboard → Veículos para controlar gastos separadamente!_`);
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
            await wppSend(from, `${typeEmoji[vType]} *Registrado no ${targetVehicle.brand} ${targetVehicle.model}!*\n\n💰 ${formatCurrency(vAmount)} — ${vDesc}\n📊 Total do veículo: ${formatCurrency(total)}`);
          }
          break;
        }

        // Múltiplos veículos → pergunta qual
        const expenseData = { amount: vAmount, expenseType: vType, description: vDesc, km: vKm, date: vDate };
        const vehicleList = allVehicles.map(v => ({ id: v.id, brand: v.brand, model: v.model, year: v.year }));
        await setPendingAction(from, { type: "vehicle_selection", userId: user.id, mode: vehicleMode, expenseData, vehicles: vehicleList });

        let msg = `🚗 Você tem ${allVehicles.length} veículos cadastrados. Em qual registrar *${formatCurrency(vAmount)}* de ${vDesc}?\n\n`;
        allVehicles.forEach((v, i) => { msg += `*${i + 1}.* ${v.brand} ${v.model} (${v.year})${v.plate ? ` — ${v.plate}` : ""}\n`; });
        msg += `\nResponda com o número ou nome do veículo. ⏱ _Válido por 5 min._`;
        await wppSend(from, msg);
        break;
      }

      case "vehicle_query": {
        const vehicles = await getVehiclesByUser(user.id, mode);
        if (!vehicles.length) {
          await wppSend(from, "🚗 Sem veículos cadastrados. Adicione em Veículos no dashboard.");
        } else {
          let msg = `🚗 *Seus veículos:*\n\n`;
          vehicles.forEach(v => {
            const total = getVehicleTotalExpenses(v);
            msg += `• *${v.brand} ${v.model}* (${v.year})\n  Placa: ${v.plate || "—"} | Km: ${v.currentKm.toLocaleString()}\n  Total gastos: ${formatCurrency(total)}\n\n`;
          });
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "grocery_list_add": {
        const g = ai.grocery;
        if (g?.template) {
          const added = await addFromTemplate(user.id, g.template);
          await wppSend(from, replyGroceryListAdded(added, g.template));
        } else if (g?.items?.length) {
          for (const i of g.items) await addToShoppingList(user.id, cap(i.productName), i.category ?? "Outros", i.quantity ? String(i.quantity) : "1");
          await wppSend(from, replyGroceryListAdded(g.items.length));
        } else {
          await wppSend(from, replyGroceryListAdded(0));
        }
        break;
      }

      case "grocery_list_show": {
        const list = await getShoppingList(user.id);
        await wppSend(from, replyGroceryList(list));
        break;
      }

      case "grocery_list_check": {
        const names = ai.grocery?.itemNames ?? [];
        if (!names.length) { await wppSend(from, "❓ Qual item deseja marcar como comprado?"); break; }
        const pendingItems = (await getShoppingList(user.id)).filter(i => !i.checked);
        const checked: string[] = [];
        const notFound: string[] = [];
        for (const name of names) {
          const lower = name.toLowerCase();
          const found = pendingItems.find(i => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
          if (found && await toggleShoppingItem(found.id, user.id)) checked.push(found.name);
          else notFound.push(name);
        }
        await wppSend(from, replyGroceryItemChecked(checked, notFound));
        break;
      }

      case "grocery_spend_query": {
        const spend = await getSpendByStore(user.id);
        const totalSpent = spend.reduce((s, x) => s + x.total, 0);
        await wppSend(from, replyGrocerySpend(spend, totalSpent));
        break;
      }

      case "grocery_purchase": {
        const { reply: groceryReply } = await beginSlotFill("grocery_purchase", ai, { user, userId: user.id, phone: from, mode }, messageText);
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
          await wppSend(from, `🛒 *Lista sugerida com base no que você mais compra:*\n\n${suggested.map(i => `• ${cap(i.productName)}`).join("\n")}\n\nJá adicionei na sua lista de compras!`);
        } else {
          const fallbackKeys = keys.length ? keys : ["mercearia", "hortifruti"];
          let total = 0;
          for (const key of fallbackKeys) total += await addFromTemplate(user.id, key);
          await wppSend(from, total > 0
            ? `🛒 Ainda não tenho histórico seu de compras — montei uma lista básica (${total} itens) pra começar. Vai ficando mais personalizada conforme você registra suas compras!`
            : `❓ Não reconheci essas categorias. Tente: mercearia, carnes, hortifruti, laticínios, padaria, bebidas, higiene ou limpeza.`);
        }
        break;
      }

      case "grocery_price_compare": {
        const productName = ai.grocery?.productName;
        if (!productName) { await wppSend(from, `❓ Qual produto você quer comparar? Ex: _"quanto pago no detergente"_`); break; }
        const cmp = await getPriceComparison(user.id, productName);
        if (!cmp.length) {
          await wppSend(from, `❓ Não achei *"${productName}"* no seu histórico em mais de um mercado ainda.`);
        } else {
          const item = cmp[0];
          let msg = `💰 *${cap(item.productName)}* — preço por mercado:\n\n`;
          item.prices.forEach((p, i) => { msg += `${i === 0 ? "🟢" : "⚪"} ${p.storeName} — ${formatCurrency(p.price)}\n`; });
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "grocery_store_ranking": {
        const { ranking, method } = await getStorePriceRanking(user.id);
        if (!ranking.length) {
          await wppSend(from, "❓ Ainda não tenho compras suficientes pra comparar mercados.");
        } else {
          let msg = `🏆 *Ranking de mercados${method === "avg_ticket" ? " (por ticket médio — poucos itens em comum ainda pra comparar preço)" : ""}:*\n\n`;
          ranking.forEach((r, i) => {
            msg += method === "relative_price"
              ? `${i + 1}. ${r.storeName} — ${Math.round(r.score * 100)}%${i === 0 ? " 🏅 mais barato" : ""}\n`
              : `${i + 1}. ${r.storeName} — ${formatCurrency(r.score)}/visita\n`;
          });
          await wppSend(from, msg.trim());
        }
        break;
      }

      case "grocery_history_query": {
        const categoryFilter = ai.grocery?.category as GroceryCategory | undefined;
        const [defFrom, defTo] = monthBounds(year, month);
        const histFrom = ai.grocery?.period?.from || defFrom;
        const histTo = ai.grocery?.period?.to || defTo;
        const histPurchases = await getPurchasesInRange(user.id, histFrom, histTo, categoryFilter);

        if (!histPurchases.length) {
          await wppSend(from, categoryFilter
            ? `❓ Não achei compras de *${categoryFilter}* nesse período.`
            : `❓ Nenhuma compra de mercado registrada nesse período.`);
          break;
        }

        const byStore = new Map<string, { total: number; items: typeof histPurchases[0]["items"] }>();
        for (const p of histPurchases) {
          const cur = byStore.get(p.storeName) ?? { total: 0, items: [] };
          cur.total += p.total;
          cur.items.push(...p.items);
          byStore.set(p.storeName, cur);
        }
        const stores = Array.from(byStore.entries()).sort((a, b) => b[1].total - a[1].total);
        const grandTotal = stores.reduce((s, [, v]) => s + v.total, 0);

        let msg = `📋 *Suas compras${categoryFilter ? ` de ${categoryFilter}` : ""} — ${periodLabelFor(ai.grocery?.period, now)}:*\n\n`;
        for (const [storeName, v] of stores) {
          msg += `🏪 *${storeName}* — ${formatCurrency(v.total)}\n`;
          v.items.forEach(i => { msg += `   • ${i.productName} — ${formatCurrency(i.price)} × ${i.quantity}\n`; });
          msg += "\n";
        }
        msg += `💰 *Total geral: ${formatCurrency(grandTotal)}*`;
        if (stores.length > 1) msg += `\n🏆 Mercado que mais comprou: ${stores[0][0]}`;
        await wppSend(from, msg.trim());
        break;
      }

      case "employee_create": {
        const { reply: employeeReply } = await beginSlotFill("employee_create", ai, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, employeeReply);
        break;
      }

      case "employee_list": {
        const employees = await getEmployeesByUser(user.id, "active");
        const totalPayroll = await getTotalPayroll(user.id);
        await wppSend(from, replyEmployeeList(employees, totalPayroll));
        break;
      }

      case "employee_update": {
        const empKeyword = ai.keyword || ai.employee?.name || "";
        const empTarget = empKeyword ? await findEmployeeByName(user.id, empKeyword) : null;
        if (!empTarget) { await wppSend(from, "❓ Não encontrei esse funcionário. Digite *meus funcionários* para ver a lista."); break; }
        const empPatch: Partial<Employee> = {};
        if (ai.employee?.role) empPatch.role = cap(ai.employee.role);
        if (ai.employee?.salary && ai.employee.salary > 0) empPatch.salary = ai.employee.salary;
        if (ai.employee?.phone) empPatch.phone = ai.employee.phone;
        if (ai.employee?.email) empPatch.email = ai.employee.email;
        if (Object.keys(empPatch).length === 0) { await wppSend(from, "❓ O que deseja alterar? Ex: _\"muda o salário da Ana para 2200\"_"); break; }
        const empUpdated = await updateEmployee(empTarget.id, user.id, empPatch);
        if (empUpdated) await wppSend(from, replyEmployeeUpdated(empUpdated));
        break;
      }

      case "employee_deactivate": {
        const deactKeyword = ai.keyword || ai.employee?.name || "";
        const deactTarget = deactKeyword ? await findEmployeeByName(user.id, deactKeyword) : null;
        if (!deactTarget) { await wppSend(from, "❓ Não encontrei esse funcionário. Digite *meus funcionários* para ver a lista."); break; }
        const deactivated = await updateEmployee(deactTarget.id, user.id, { status: "inactive" });
        if (deactivated) await wppSend(from, replyEmployeeDeactivated(deactivated));
        break;
      }

      case "customer_create": {
        const { reply: customerReply } = await beginSlotFill("customer_create", ai, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, customerReply);
        break;
      }

      case "customer_list": {
        const customers = await getCustomersByUser(user.id, "active");
        await wppSend(from, replyCustomerList(customers));
        break;
      }

      case "customer_query": {
        const custQueryKeyword = ai.keyword || ai.customer?.name || "";
        const custMatches = custQueryKeyword ? await findCustomersByName(user.id, custQueryKeyword) : [];
        await wppSend(from, replyCustomerInfo(custMatches, custQueryKeyword));
        break;
      }

      case "customer_update": {
        const custKeyword = ai.keyword || ai.customer?.name || "";
        const custTarget = custKeyword ? await findCustomerByName(user.id, custKeyword) : null;
        if (!custTarget) { await wppSend(from, "❓ Não encontrei esse cliente. Digite *meus clientes* para ver a lista."); break; }
        const custPatch: Partial<Customer> = {};
        if (ai.customer?.phone) custPatch.phone = ai.customer.phone;
        if (ai.customer?.email) custPatch.email = ai.customer.email;
        if (ai.customer?.company) custPatch.company = ai.customer.company;
        if (ai.customer?.address) custPatch.address = ai.customer.address;
        if (ai.customer?.notes) custPatch.notes = ai.customer.notes;
        if (Object.keys(custPatch).length === 0) { await wppSend(from, "❓ O que deseja alterar? Ex: _\"muda o telefone do Pedro para 11988887777\"_"); break; }
        const custUpdated = await updateCustomer(custTarget.id, user.id, custPatch);
        if (custUpdated) await wppSend(from, replyCustomerUpdated(custUpdated));
        break;
      }

      case "customer_deactivate": {
        const custDeactKeyword = ai.keyword || ai.customer?.name || "";
        const custDeactTarget = custDeactKeyword ? await findCustomerByName(user.id, custDeactKeyword) : null;
        if (!custDeactTarget) { await wppSend(from, "❓ Não encontrei esse cliente. Digite *meus clientes* para ver a lista."); break; }
        const custDeactivated = await updateCustomer(custDeactTarget.id, user.id, { status: "inactive" });
        if (custDeactivated) await wppSend(from, replyCustomerDeactivated(custDeactivated));
        break;
      }

      case "recurring_create": {
        if (!ai.recurring) { await wppSend(from, replyUnknown(messageText)); break; }

        // Pagamento de funcionário: precisa saber QUAL antes de criar o
        // recorrente, pra não ficar com descrição genérica "Funcionário".
        if (ai.recurring.employeePayment) {
          const activeEmployees = await getEmployeesByUser(user.id, "active");
          if (activeEmployees.length === 0) {
            await wppSend(from, `👥 Você ainda não tem funcionários cadastrados.\n\nPara registrar esse pagamento, primeiro cadastre o funcionário — me diga o nome, cargo e salário. Ex:\n_"cadastra a Ana como vendedora, salário 2000"_`);
            break;
          }
          let targetEmployee = ai.recurring.employeeName ? await findEmployeeByName(user.id, ai.recurring.employeeName) : null;
          if (!targetEmployee && activeEmployees.length === 1) targetEmployee = activeEmployees[0];

          if (!targetEmployee) {
            await setPendingAction(from, {
              type: "employee_payment_select", userId: user.id, mode,
              recurringData: ai.recurring, originalText: messageText,
              employees: activeEmployees.map(e => ({ id: e.id, name: e.name, role: e.role })),
            });
            let msg = `👥 Para qual funcionário é esse pagamento?\n\n`;
            activeEmployees.forEach((e, i) => { msg += `*${i + 1}.* ${e.name} — ${e.role}\n`; });
            msg += `\nResponda com o número ou nome. ⏱ _Válido por 5 min._`;
            await wppSend(from, msg);
            break;
          }

          ai.recurring = { ...ai.recurring, description: `Salário - ${targetEmployee.name}`, employeePayment: false, employeeName: undefined };
        }

        const { reply } = await beginSlotFill("recurring_create", ai, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, reply);
        break;
      }

      case "recurring_query": {
        const recs = await getRecurringByUser(user.id, mode, "active");
        await wppSend(from, replyRecurringList(recs));
        break;
      }

      case "recurring_cancel": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, "❓ Qual recorrente ou parcela deseja cancelar?"); break; }
        const found = await findRecurringByDescription(user.id, keyword);
        if (!found) { await wppSend(from, `❓ Não encontrei recorrente com *"${keyword}"*.\n\nDigite *minhas parcelas* para ver a lista.`); break; }
        await cancelRecurring(found.id, user.id);
        await wppSend(from, `✅ *${found.description}* cancelado(a)!\n\nSe quiser reativar, acesse *Recorrentes* no dashboard.`);
        break;
      }

      case "recurring_edit": {
        const editKw = ai.keyword || ai.recurring?.description || "";
        if (!editKw) { await wppSend(from, "❓ Qual recorrente ou parcela deseja editar?"); break; }
        const editFound = await findRecurringByDescription(user.id, editKw);
        if (!editFound) { await wppSend(from, `❓ Não encontrei recorrente com *"${editKw}"*.\n\nDigite *minhas parcelas* para ver a lista.`); break; }
        const patch: Parameters<typeof updateRecurring>[2] = {};
        if (ai.recurring?.amount) patch.amount = ai.recurring.amount;
        if (ai.recurring?.description) patch.description = cap(ai.recurring.description);
        if (ai.recurring?.category) patch.category = cap(ai.recurring.category);
        if (ai.recurring?.dayOfMonth) patch.dayOfMonth = ai.recurring.dayOfMonth;
        if (ai.recurring?.repeatUnit) patch.repeatUnit = ai.recurring.repeatUnit;
        if (ai.recurring?.totalInstallments) patch.totalInstallments = ai.recurring.totalInstallments;
        if (Object.keys(patch).length === 0) { await wppSend(from, "❓ O que deseja alterar? Ex: _\"muda o netflix para 65 reais\"_ ou _\"a academia é só até dezembro, 5 meses\"_"); break; }
        const editUpdated = await updateRecurring(editFound.id, user.id, patch);
        if (editUpdated) {
          await wppSend(from, `✏️ *${editUpdated.description}* atualizado!\n\n💰 Novo valor: ${formatCurrency(editUpdated.amount)}`);
        }
        break;
      }

      case "drive_search": {
        const driveQuery = ai.keyword || messageText;
        const allFiles = await getFiles(user.id);
        if (!allFiles.length) {
          await wppSend(from, replyDriveFileList(0));
          break;
        }
        const fileId = await findDriveFileByAI(driveQuery, allFiles.map(f => ({
          id: f.id, originalName: f.originalName, description: f.description, aiKeywords: f.aiKeywords,
        })));
        if (!fileId) {
          await wppSend(from, replyFileNotFound(driveQuery));
          break;
        }
        const foundFile = await getFileById(fileId, user.id);
        if (!foundFile) { await wppSend(from, replyFileNotFound(driveQuery)); break; }
        const filePath = getFilePath(foundFile);
        if (!existsSync(filePath)) { await wppSend(from, replyFileNotFound(driveQuery)); break; }
        await wppSend(from, replyFileFound(foundFile.originalName));
        const fileBuffer = readFileSync(filePath);
        await wppSendFile(from, fileBuffer, foundFile.originalName, foundFile.mimeType);
        break;
      }

      case "drive_rename": {
        const newName = ai.keyword || "";
        if (!newName) { await wppSend(from, "❓ Qual o novo nome para o arquivo?"); break; }
        const recentFile = await getRecentFile(user.id);
        if (!recentFile) { await wppSend(from, "❓ Não encontrei nenhum arquivo recente no Drive."); break; }
        // Gera um nome de arquivo "limpo" a partir da descrição (sem caracteres especiais)
        const ext = recentFile.originalName.includes(".") ? recentFile.originalName.slice(recentFile.originalName.lastIndexOf(".")) : "";
        const cleanName = newName.toLowerCase().replace(/[^a-z0-9\s\-_]/g, "").replace(/\s+/g, "_").slice(0, 60) + ext;
        await updateFile(recentFile.id, user.id, { originalName: cleanName, description: newName });
        await wppSend(from, `✅ *Arquivo renomeado!*\n\n📄 ${cleanName}\n💬 Descrição: ${newName}\n\nJá está atualizado no *📁 Drive*. Para encontrar depois: _"ache ${newName}"_`);
        break;
      }

      case "agenda_create": {
        const { reply: agendaReply } = await beginSlotFill("agenda_create", ai, { user, userId: user.id, phone: from, mode }, messageText);
        await wppSend(from, agendaReply);
        break;
      }

      case "agenda_list": {
        const apts = await getUpcomingAppointments(user.id, 14);
        await wppSend(from, replyAgendaList(apts));
        break;
      }

      case "agenda_update": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, "❓ Qual compromisso deseja alterar?"); break; }
        const d2 = ai.agendaData ?? {};
        const patch: Parameters<typeof updateAppointment>[2] = {};
        if (d2.startDate) patch.startAt = spToUTC(`${d2.startDate}T${d2.startTime || "00:00"}:00`);
        if (d2.endDate) patch.endAt = spToUTC(`${d2.endDate}T${d2.endTime || "00:00"}:00`);
        if (d2.title) patch.title = cap(d2.title);
        if (d2.location) patch.location = d2.location;
        if (d2.description) patch.description = d2.description;

        const matches = await findAppointmentsByKeyword(user.id, keyword);
        if (matches.length === 0) {
          await wppSend(from, `❓ Não encontrei nenhum compromisso com *"${keyword}"*.\n\nDigite *meus compromissos* para ver a lista.`);
        } else if (matches.length === 1) {
          const updated = await updateAppointment(matches[0].id, user.id, patch);
          if (updated) await wppSend(from, replyAgendaUpdated(updated));
        } else {
          await askWhichAppointment(from, user.id, matches, "update", `reagendar/alterar`, patch);
        }
        break;
      }

      case "agenda_delete": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, "❓ Qual compromisso deseja cancelar?"); break; }
        const matches = await findAppointmentsByKeyword(user.id, keyword);
        if (matches.length === 0) {
          await wppSend(from, `❓ Não encontrei nenhum compromisso com *"${keyword}"*.\n\nDigite *meus compromissos* para ver a lista.`);
        } else if (matches.length === 1) {
          await deleteAppointment(matches[0].id, user.id);
          await wppSend(from, replyAgendaDeleted(matches[0].title));
        } else {
          await askWhichAppointment(from, user.id, matches, "delete", "cancelar");
        }
        break;
      }

      case "agenda_done": {
        const doneKeyword = ai.keyword || "";
        if (!doneKeyword) { await wppSend(from, "❓ Qual compromisso deseja marcar como feito?"); break; }
        const matches = await findAppointmentsByKeyword(user.id, doneKeyword);
        if (matches.length === 0) {
          await wppSend(from, `❓ Não encontrei nenhum compromisso com *"${doneKeyword}"*.\n\nDigite *meus compromissos* para ver a lista.`);
        } else if (matches.length === 1) {
          await updateAppointment(matches[0].id, user.id, { status: "done" });
          await wppSend(from, `✅ Marquei como realizado.\n\n📅 ${matches[0].title}`);
        } else {
          await askWhichAppointment(from, user.id, matches, "done", "marcar como feito");
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
          await wppSend(from, `❓ Não encontrei o compromisso${addMeetKeyword ? ` com *"${addMeetKeyword}"*` : ""}.\n\nDigite *meus compromissos* para ver a lista.`);
        } else if (addMeetMatches.length === 1) {
          await performAddMeet(addMeetMatches[0], user.id, from);
        } else {
          await askWhichAppointment(from, user.id, addMeetMatches, "add_meet", "adicionar o Meet");
        }
        break;
      }

      case "meet_create": {
        const d = ai.meetData;
        if (!d?.startDate || !d?.startTime) {
          await wppSend(from, `🗓️ Me diga a data e horário da reunião!\n\nEx: _"reunião amanhã às 14h"_\nEx: _"meet hoje às 16h com João (11 99999-9999)"_`);
          break;
        }
        const meetStartAt = spToUTC(`${d.startDate}T${d.startTime}:00`);
        const durationMs = (d.duration || 60) * 60_000;
        const meetEndAt = d.endDate
          ? spToUTC(`${d.endDate}T${d.endTime || "00:00"}:00`)
          : new Date(new Date(meetStartAt).getTime() + durationMs).toISOString();
        const meetTitle = cap(d.title || "Reunião");
        const meetAttendees = d.attendees || [];
        // Pergunta se quer link do Google Meet
        const { formatDateTimeBR } = await import("@/lib/date-br");
        const timeStr = formatDateTimeBR(meetStartAt);
        await setPendingAction(from, {
          type: "meet_confirm",
          userId: user.id,
          title: meetTitle,
          description: d.description,
          startAt: meetStartAt,
          endAt: meetEndAt,
          attendees: meetAttendees,
          mode,
        });
        await wppSend(from, `📅 *${meetTitle}*\n🕒 ${timeStr}\n${meetAttendees.length > 0 ? `👥 ${meetAttendees.map(a => a.name).join(", ")}\n` : ""}\nDeseja incluir link do *Google Meet*?\n\nResponda *Sim* ou *Não*`);
        break;
      }

      case "mode_switch": {
        if (phoneAccess !== "both") {
          const accessLabel = phoneAccess === "personal" ? "pessoal" : "empresarial";
          await wppSend(from, `❌ Você só tem acesso ao modo *${accessLabel}* nessa conta.`);
          break;
        }
        const newMode = ai.mode || (mode === "personal" ? "business" : "personal");
        await updateUser(user.id, { activeMode: newMode });
        await wppSend(from, replyModeSwitch(newMode));
        break;
      }

      case "how_to": {
        if (ai.response) {
          await wppSend(from, ai.response);
        } else {
          await wppSend(from, replyHelp());
        }
        break;
      }

      case "help": {
        await wppSend(from, replyHelp());
        break;
      }

      default: {
        const lower = messageText.toLowerCase();
        if (lower.includes("ajuda") || lower === "?") {
          await wppSend(from, replyHelp());
        } else if (lower.includes("saldo") || lower.includes("resumo")) {
          const personal = await getBalance(user.id, "personal", year, month);
          const business = await getBalance(user.id, "business", year, month);
          await wppSend(from, replyBalance(personal, business));
        } else if (lower.includes("extrato") || lower.includes("últimos") || lower.includes("ultimos")) {
          const recents = await getRecentTransactions(user.id, mode, 10);
          if (!recents.length) {
            await wppSend(from, "📋 Nenhum lançamento encontrado ainda.");
          } else {
            let msg = `📋 *Últimos lançamentos (${mode === "business" ? "Empresa" : "Pessoal"}):*\n\n`;
            recents.forEach((f, i) => {
              const emoji = f.type === "income" ? "💰" : "💸";
              msg += `${i + 1}. ${emoji} ${f.description} — ${formatCurrency(f.amount)}\n   📅 ${new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${f.category}\n\n`;
            });
            await wppSend(from, msg.trim());
          }
        } else {
          await wppSend(from, replyUnknown(messageText));
        }
      }
    }

    return;
  } catch (e) {
    console.error("[message-handler]", e);
    if (from) {
      try { await wppSend(from, "❌ Ocorreu um erro interno. Tente novamente em instantes."); } catch { /* ignora */ }
    }
    return;
  }
}
