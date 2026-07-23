import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, isTrialExpired, getUserByWppCode, addWppPhone, getWppPhones, setWppPhoneName, getWppPhoneByName } from "@/lib/users";
import { processMessage, transcribeAudio, generateAnalysisResponse, categorizeDriveFile, findDriveFileByAI, extractFinanceFromDocument } from "@/lib/ai-processor";
import { saveFile, getFiles, getFolders, getFolderByName, getFilePath, getFileById, updateFile, getRecentFile } from "@/lib/drive";
import { readFileSync, existsSync } from "fs";
import { addFinance, getBalance, getByCategory, formatCurrency, findFinanceByDescription, deleteFinance, updateFinance, getRecentTransactions, getMonthlyTransactions, getFinancesLastDays } from "@/lib/finances";
import { createTask, getPendingTasks, updateTaskStatus, findTaskByNumber, findTaskByTitle } from "@/lib/tasks";
import { createReminder } from "@/lib/reminders";
import { createGoal, getActiveGoals, updateGoalAmount, updateGoalStatus, findGoalByTitle, getGoalProgress } from "@/lib/goals";
import { getVehiclesByUser, addVehicleExpense, findVehicleByName, getVehicleTotalExpenses, setExpenseFinanceId } from "@/lib/vehicles";
import { setPendingAction, getPendingAction, clearPendingAction, parseVehicleChoice, parseGoalChoice, parseFinanceChoice, parseFinancePatchFromText, parseYesNo } from "@/lib/pending-actions";
import { createRecurring, getRecurringByUser, confirmRecurring, cancelRecurring, updateRecurring, findRecurringByDescription } from "@/lib/recurring";
import { createAppointment, getUpcomingAppointments, updateAppointment, deleteAppointment, findAppointmentByKeyword } from "@/lib/agenda";
import { createMeet } from "@/lib/meets";
import { createMeetEvent } from "@/lib/google-meet";
import { isConnected } from "@/lib/google-oauth";
import { generateMeetAta } from "@/lib/ai-processor";
import { sendText as wppSend, sendFile as wppSendFile } from "@/lib/wppconnect";
import { nowBR, spToUTC, todayStrBR } from "@/lib/date-br";
import {
  replyFinanceRegistered, replyBalance, replyTaskCreated, replyTaskList,
  replyTaskUpdated, replyReminderSet, replyModeSwitch, replyHelp,
  replyTrialExpired, replyUnknown, replyLowConfidence,
  replyRecurringConfirmed, replyRecurringCreated, replyRecurringList,
  replyFileSaved, replyFileFound, replyFileNotFound, replyDriveFileList,
  replyAgendaCreated, replyAgendaList, replyAgendaUpdated, replyAgendaDeleted,
  replyMeetCreated, replyMeetInvite, replyMeetAtaRequest, replyMeetAtaGenerated,
  replyPersonNotFound, replyAskWppName, replyWppNameSaved,
} from "@/lib/bot-replies";

function phoneMatches(stored: string, incoming: string): boolean {
  const s = stored.replace(/\D/g, "");
  const i = incoming.replace(/\D/g, "");
  if (!s || !i) return false;
  if (s === i) return true;
  if (i.length >= 9 && s.length >= 9 && (i.endsWith(s.slice(-9)) || s.endsWith(i.slice(-9)))) return true;
  if (i.length >= 11 && s.length >= 11 && (i.endsWith(s.slice(-11)) || s.endsWith(i.slice(-11)))) return true;
  return false;
}

function getUserByWppPhone(phone: string) {
  return getUsers().find(u => getWppPhones(u).some(p => phoneMatches(p, phone))) ?? null;
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Label do modo (pessoal/empresa) pra deixar claro em listas e confirmações
// de qual lançamento se trata, já que descrição/categoria podem repetir entre modos.
function modeLabelFull(m: string): string {
  return m === "business" ? "🏢 Empresa" : "👤 Pessoal";
}

export async function POST(req: NextRequest) {
  let _from = ""; // acessível no catch para enviar mensagem de erro
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const event = (body.event as string ?? "").toLowerCase();
    if (event !== "onmessage" && event !== "message" && event !== "onanymessage") {
      return NextResponse.json({ ok: true });
    }

    const rawFrom = body.from ?? body.data?.from ?? "";
    const from = (rawFrom as string).replace("@c.us", "").replace(/\D/g, "");
    _from = from;
    const fromMe = body.fromMe ?? body.data?.fromMe ?? false;
    const bodyText = body.body ?? body.data?.body ?? body.content ?? body.data?.content ?? "";
    console.log(`[webhook] event=${event} from=${from} fromMe=${fromMe}`);
    console.log(`[webhook] keys=${Object.keys(body).join(",")}`);
    console.log(`[webhook] full=${JSON.stringify(body)}`);
    if (!from || fromMe) return NextResponse.json({ ok: true });

    // Classificação do tipo de mensagem
    const isFileType = ["document", "image", "video"].includes(body.type);
    // "ptt" = push-to-talk (nota de voz WhatsApp), "audio" = arquivo de áudio
    const isAudio = ["audio", "ptt"].includes(body.type);
    const mediaUrl = body.mediaUrl || body.url;
    const bodyStr = typeof body.body === "string" ? body.body : "";
    // Para áudio/ptt o WPPConnect sempre coloca o base64 em body.body (independente de mediaUrl)
    const bodyIsBase64Audio = isAudio && bodyStr.length > 200 && /^[A-Za-z0-9+/]/.test(bodyStr);
    // Para arquivos, base64 só quando não tem URL
    const bodyIsBase64File = isFileType && !mediaUrl && bodyStr.length > 200 && /^[A-Za-z0-9+/]/.test(bodyStr);
    const bodyIsBase64 = bodyIsBase64Audio || bodyIsBase64File;

    // Áudio/arquivo nunca usa body.body como texto
    let messageText = (isFileType || isAudio) ? "" : (bodyText as string ?? "").trim();

    // ── Transcreve áudio/voz ──
    if (isAudio) {
      let transcribed = false;
      // Gemini exige mime limpo — strip "; codecs=opus" etc.
      const rawMime = (body.mimetype as string | undefined) || "audio/ogg";
      const mime = rawMime.split(";")[0].trim() || "audio/ogg";
      try {
        // Tenta base64 primeiro (body.body é sempre preenchido pelo WPPConnect)
        if (bodyIsBase64Audio) {
          const buf = Buffer.from(bodyStr, "base64");
          const transcript = await transcribeAudio(buf, mime);
          if (transcript) { messageText = transcript; transcribed = true; }
        }
        // Fallback: tenta URL (pode precisar de auth, mas vale tentar)
        if (!transcribed && mediaUrl) {
          const audioRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(20_000) });
          if (audioRes.ok) {
            const buf = Buffer.from(await audioRes.arrayBuffer());
            const transcript = await transcribeAudio(buf, mime);
            if (transcript) { messageText = transcript; transcribed = true; }
          }
        }
      } catch { /* ignora */ }
      if (!transcribed) {
        await wppSend(from, "🎤 Não consegui entender o áudio. Pode digitar sua mensagem?");
        return NextResponse.json({ ok: true });
      }
    }

    // ── Detecta arquivo/documento enviado via WhatsApp ──
    const isFileMessage = isFileType && (mediaUrl || bodyIsBase64File) && !fromMe;

    if (isFileMessage) {
      // Identifica usuário antes de processar o arquivo
      const fileUser = getUserByWppPhone(from);
      if (fileUser && !isTrialExpired(fileUser)) {
        const defaultExt = body.mimetype?.includes("pdf") ? ".pdf" : body.mimetype?.includes("image") ? ".jpg" : "";
        const mimeType = body.mimetype || "application/octet-stream";
        // caption: prioriza body.caption (legenda enviada junto ao arquivo), depois bodyStr se não for base64
        const captionField = typeof body.caption === "string" && body.caption ? body.caption : undefined;
        const caption = captionField || (!bodyIsBase64File && bodyStr && bodyStr !== body.filename ? bodyStr : undefined);

        // Extrai um nome explícito da legenda (ex: "salva como etac", "guarda como contrato assinado")
        const nameFromCaption = caption?.match(/(?:salva|salvar|guarda|guardar|arquiva|arquivar|nomeia|nomear|chama|chame)\s+(?:isso\s+|ele\s+|esse\s+arquivo\s+)?(?:de|como)\s+(.+)/i)?.[1]?.trim();
        const originalName = nameFromCaption ? `${nameFromCaption}${defaultExt}` : (body.filename || `arquivo_${Date.now()}${defaultExt}`);

        let buffer: Buffer;
        try {
          if (mediaUrl) {
            const mediaRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) });
            if (!mediaRes.ok) throw new Error(`HTTP ${mediaRes.status}`);
            buffer = Buffer.from(await mediaRes.arrayBuffer());
          } else {
            buffer = Buffer.from(bodyStr, "base64");
          }
        } catch (e) {
          console.error("[drive] erro ao obter arquivo:", e);
          await wppSend(from, "❌ Não consegui processar o arquivo. Tente novamente.");
          return NextResponse.json({ ok: true });
        }

        // Verifica se o usuário pediu explicitamente para guardar no Drive
        const SAVE_KEYWORDS = ["guarda", "salva", "arquiva", "armazena", "salvar", "guardar", "arquivar", "arquivo", "pasta", "drive"];
        const hasSaveIntent = !!caption && SAVE_KEYWORDS.some(k => caption.toLowerCase().includes(k));

        if (!hasSaveIntent) {
          // Tenta extrair dados financeiros do documento/foto via Gemini Vision
          try {
            const financeData = await extractFinanceFromDocument(buffer, mimeType, caption);
            if (financeData) {
              const fNow = nowBR();
              const fYear = fNow.getFullYear();
              const fMonth = fNow.getMonth() + 1;
              const fMode = financeData.mode || fileUser.activeMode;
              const f = addFinance({
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
              const bal = getBalance(fileUser.id, fMode, fYear, fMonth);
              const typeLabel = financeData.type === "income" ? "Receita" : "Despesa";
              const typeEmoji = financeData.type === "income" ? "💰" : "💸";

              const receiptExt = mimeType.includes("pdf") ? ".pdf" : ".jpg";
              const suggestedName = `${f.category} - ${f.description} - ${f.date}${receiptExt}`.slice(0, 80);
              setPendingAction(from, {
                type: "receipt_save",
                userId: fileUser.id,
                fileBase64: buffer.toString("base64"),
                mimeType,
                suggestedName,
                financeId: f.id,
              });

              await wppSend(from, `${typeEmoji} *${typeLabel} registrada!*\n\n📝 ${f.description}\n💰 ${formatCurrency(f.amount)}\n🏷️ ${f.category}\n📅 ${new Date(f.date + "T12:00:00").toLocaleDateString("pt-BR")}\n\n📊 Saldo: ${formatCurrency(bal.balance)}\n\n_💾 Quer guardar esse comprovante no Drive? (sim/não)_`);
              return NextResponse.json({ ok: true });
            }
          } catch (e) {
            console.error("[webhook] erro ao extrair finanças do documento:", e);
          }
        }

        // Sem dados financeiros ou com pedido de salvar → salva no Drive
        try {
          const folders = getFolders(fileUser.id);
          const folderNames = folders.filter(f => f.parentId === null).map(f => f.name);
          const { folder: suggestedFolder, keywords } = await categorizeDriveFile(originalName, folderNames.length ? folderNames : ["Documentos","Comprovantes","Contratos","Fotos","Outros"]);
          const targetFolder = getFolderByName(fileUser.id, suggestedFolder);
          const savedFile = saveFile({
            userId: fileUser.id,
            folderId: targetFolder?.id ?? null,
            originalName,
            mimeType,
            size: buffer.length,
            description: caption,
            aiKeywords: keywords,
            source: "whatsapp",
            buffer,
          });
          console.log(`[drive] arquivo salvo: ${savedFile.id} | ${originalName} | pasta=${suggestedFolder}`);
          await wppSend(from, replyFileSaved(originalName, suggestedFolder));
          // Só repassa à IA se a legenda tem conteúdo além do comando de salvar
          if (caption && !hasSaveIntent) messageText = caption;
        } catch (e) {
          console.error("[drive] erro ao salvar arquivo:", e);
          await wppSend(from, "❌ Não consegui salvar o arquivo. Tente novamente.");
        }
      }
      // Se não há legenda/caption para processar, encerra aqui
      if (!messageText) return NextResponse.json({ ok: true });
    }

    if (!messageText) return NextResponse.json({ ok: true });

    // ── Verifica se é um código de vinculação (4 dígitos) ──
    const codeMatch = messageText.trim().match(/^(\d{4})$/);
    if (codeMatch) {
      const codeUser = getUserByWppCode(codeMatch[1]);
      if (codeUser) {
        addWppPhone(codeUser.id, from);
        updateUser(codeUser.id, { wppVerifyCode: undefined, wppVerifyExpires: undefined });
        await wppSend(from, `✅ *WhatsApp vinculado com sucesso!*`);
        setPendingAction(from, { type: "awaiting_wpp_name", userId: codeUser.id });
        await wppSend(from, replyAskWppName());
        return NextResponse.json({ ok: true });
      }
    }

    // ── Identifica usuário pelo wppPhone cadastrado ──
    const allUsers = getUsers();
    console.log(`[webhook] buscando from=${from} | users=${allUsers.length} | phones=${allUsers.map(u => (u as Record<string,unknown>).wppPhone).join(",")}`);
    const user = getUserByWppPhone(from);

    if (!user) {
      await wppSend(from, "⛔ *Ops!* Seu número não está cadastrado em nossa plataforma.\n\nSe você é cliente, acesse o dashboard em *Configurações* e clique em *Vincular WhatsApp* para gerar seu código.\n\nPara contratar: controlaai.app 🚀");
      return NextResponse.json({ ok: true });
    }

    // ── Verifica trial ──
    if (isTrialExpired(user)) {
      await wppSend(from, replyTrialExpired());
      return NextResponse.json({ ok: true });
    }

    const mode = user.activeMode;
    const now = nowBR(); // horário de Brasília/São Paulo
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // ── Comando para (re)definir o nome de quem usa este número ──
    const nameCmdMatch = messageText.trim().match(/^(?:meu nome (?:é|e)|me chamo)\s+(.{2,40})$/i);
    if (nameCmdMatch) {
      const name = cap(nameCmdMatch[1].trim());
      setWppPhoneName(user.id, from, name);
      await wppSend(from, replyWppNameSaved(name));
      return NextResponse.json({ ok: true });
    }

    // ── Verifica ação pendente (ex: seleção de veículo) ──
    const pending = getPendingAction(from);

    // ── Aguardando o nome de quem está usando este número ──
    if (pending?.type === "awaiting_wpp_name" && pending.userId === user.id) {
      clearPendingAction(from);
      const name = messageText.trim().slice(0, 40);
      if (name) {
        setWppPhoneName(user.id, from, cap(name));
        await wppSend(from, replyWppNameSaved(cap(name)));
      } else {
        await wppSend(from, replyWppNameSaved(user.name));
      }
      return NextResponse.json({ ok: true });
    }

    // ── Aguardando confirmação de guardar comprovante (foto/documento) no Drive ──
    if (pending?.type === "receipt_save" && pending.userId === user.id) {
      const answer = parseYesNo(messageText);
      if (answer !== null) {
        clearPendingAction(from);
        if (answer) {
          try {
            const buffer = Buffer.from(pending.fileBase64, "base64");
            const folders = getFolders(user.id);
            const folderNames = folders.filter(f => f.parentId === null).map(f => f.name);
            const { folder: suggestedFolder, keywords } = await categorizeDriveFile(pending.suggestedName, folderNames.length ? folderNames : ["Documentos","Comprovantes","Contratos","Fotos","Outros"]);
            const targetFolder = getFolderByName(user.id, suggestedFolder);
            const savedFile = saveFile({
              userId: user.id,
              folderId: targetFolder?.id ?? null,
              originalName: pending.suggestedName,
              mimeType: pending.mimeType,
              size: buffer.length,
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
        return NextResponse.json({ ok: true });
      }
      // resposta não reconhecida como sim/não — deixa expirar e processa normalmente
    }

    if (pending?.type === "vehicle_selection" && pending.userId === user.id) {
      const choiceIdx = parseVehicleChoice(messageText, pending.vehicles);
      if (choiceIdx >= 0) {
        clearPendingAction(from);
        const chosen = pending.vehicles[choiceIdx];
        const typeEmoji: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };
        const exp = addVehicleExpense(chosen.id, user.id, { date: pending.expenseData.date, km: pending.expenseData.km, type: pending.expenseData.expenseType, amount: pending.expenseData.amount, description: pending.expenseData.description });
        if (exp) {
          const vCatMap: Record<string, string> = { fuel: "Transporte", maintenance: "Manutenção", insurance: "Seguros", tax: "Impostos", other: "Transporte" };
          const newExp = exp.expenses[exp.expenses.length - 1];
          const f = addFinance({ userId: user.id, type: "expense", amount: pending.expenseData.amount, category: vCatMap[pending.expenseData.expenseType] || "Transporte", description: `${pending.expenseData.description} — ${chosen.brand} ${chosen.model}`, date: pending.expenseData.date, mode: pending.mode as "personal" | "business", source: "whatsapp", registeredBy: from });
          setExpenseFinanceId(chosen.id, newExp.id, f.id);
          const total = getVehicleTotalExpenses(exp);
          await wppSend(from, `${typeEmoji[pending.expenseData.expenseType] || "📌"} *Registrado no ${chosen.brand} ${chosen.model}!*\n\n💰 ${formatCurrency(pending.expenseData.amount)} — ${pending.expenseData.description}\n📊 Total do veículo: ${formatCurrency(total)}`);
        }
        return NextResponse.json({ ok: true });
      } else {
        // não é uma resposta de veículo — limpa pendência e processa normalmente
        clearPendingAction(from);
      }
    }

    // ── Verifica seleção de meta pendente ──
    if (pending?.type === "goal_selection" && pending.userId === user.id) {
      const choiceIdx = parseGoalChoice(messageText, pending.goals);
      if (choiceIdx >= 0) {
        clearPendingAction(from);
        const chosen = pending.goals[choiceIdx];
        const updated = updateGoalAmount(chosen.id, user.id, pending.amount);
        if (updated) {
          const p = getGoalProgress(updated);
          const emoji = p >= 100 ? "🎉" : p >= 75 ? "🚀" : "📈";
          await wppSend(from, `${emoji} *${formatCurrency(pending.amount)} adicionado!*\n\n🎯 ${updated.title}\n📊 ${formatCurrency(updated.currentAmount)} / ${formatCurrency(updated.targetAmount)} (${p}%)${updated.status === "completed" ? "\n\n🏆 *Meta concluída! Parabéns!*" : ""}`);
        }
        return NextResponse.json({ ok: true });
      } else {
        clearPendingAction(from);
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
          return NextResponse.json({ ok: true });
        }
        clearPendingAction(from);
        const chosen = pending.candidates[0];
        const updated = updateFinance(chosen.id, user.id, patch as Parameters<typeof updateFinance>[2]);
        if (updated) {
          const bal = getBalance(user.id, updated.mode as "personal" | "business", year, month);
          const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
          await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
        }
        return NextResponse.json({ ok: true });
      }

      const choiceIdx = parseFinanceChoice(messageText, pending.candidates);
      if (choiceIdx >= 0) {
        const chosen = pending.candidates[choiceIdx];

        // Editar mas ainda não sabemos o que mudar → guarda só esse alvo e pergunta
        if (pending.action === "edit" && !hasPatch) {
          setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "edit",
            candidates: [chosen],
          });
          await wppSend(from, `🔍 Encontrei: *${chosen.description}* — ${formatCurrency(chosen.amount)} (${chosen.category}) · ${modeLabelFull(chosen.mode)}\n\nO que deseja alterar? Ex:\n• _"muda para 80 reais"_\n• _"muda categoria para Lazer"_`);
          return NextResponse.json({ ok: true });
        }

        clearPendingAction(from);
        if (pending.action === "edit" && hasPatch) {
          const updated = updateFinance(chosen.id, user.id, pending.patch as Parameters<typeof updateFinance>[2]);
          if (updated) {
            const bal = getBalance(user.id, updated.mode as "personal" | "business", year, month);
            const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
            await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
          }
        } else if (pending.action === "delete") {
          const delOk = deleteFinance(chosen.id, user.id);
          if (delOk) {
            const delBal = getBalance(user.id, chosen.mode as "personal" | "business", year, month);
            await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${chosen.description} — ${formatCurrency(chosen.amount)}\n📅 ${new Date(chosen.date + "T12:00:00").toLocaleDateString("pt-BR")}\n${modeLabelFull(chosen.mode)}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
          }
        }
        return NextResponse.json({ ok: true });
      }
      // Resposta inválida: lista novamente
      const list = pending.candidates.map((c, i) =>
        `${i + 1}️⃣ ${formatCurrency(c.amount)} · ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
      ).join("\n");
      await wppSend(from, `❓ Não entendi. Responda com o número ou a data:\n\n${list}\n\nEx: *1* ou *04/07*`);
      return NextResponse.json({ ok: true });
    }

    // ── Confirmação de Meet (sim/não) ──
    if (pending?.type === "meet_confirm" && pending.userId === user.id) {
      const lower = messageText.toLowerCase().trim();
      const yes = ["sim", "s", "yes", "y", "1", "quero", "pode", "ok", "confirmar"].some(w => lower.includes(w));
      const no = ["não", "nao", "n", "no", "0", "sem", "cancela"].some(w => lower.includes(w));
      if (yes || no) {
        clearPendingAction(from);
        let meetLink: string | undefined;
        let calendarEventId: string | undefined;
        if (yes && isConnected(user.id)) {
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
        } else if (yes && !isConnected(user.id)) {
          await wppSend(from, "⚠️ Sua conta Google não está conectada. Criando o compromisso sem link Meet.");
        }
        const apt = createAppointment({
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
      return NextResponse.json({ ok: true });
    }

    // ── Resposta de ata de reunião ──
    if (pending?.type === "meet_ata" && pending.userId === user.id) {
      if (messageText) {
        clearPendingAction(from);
        const ata = await generateMeetAta(messageText, pending.meetTitle, []);
        updateAppointment(pending.meetId, user.id, { ataGenerated: true, ataContent: ata.summary });
        for (const taskTitle of ata.tasks) {
          createTask({ userId: user.id, title: cap(taskTitle), priority: "medium", status: "pending", mode });
        }
        await wppSend(from, replyMeetAtaGenerated(pending.meetTitle, ata));
      } else {
        await wppSend(from, `Para gerar a ata, me envie um *áudio* ou *texto* com o resumo da reunião. ⏱ ${replyMeetAtaRequest(pending.meetTitle)}`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Confirmação de recorrente/parcela (resposta ao lembrete das 20h) ──
    if (pending?.type === "recurring_confirmation" && pending.userId === user.id) {
      const lower = messageText.toLowerCase().trim();
      const isYes = /^(sim|s|foi|paguei|recebi|yes|pago|recebido|ok)\b/.test(lower);
      const isNo  = /^(n(ão|ao)?|ainda não|ainda nao|não paguei|nao paguei|nao|não)\b/.test(lower);
      if (isYes) {
        clearPendingAction(from);
        const result = confirmRecurring(pending.recurringId, user.id);
        if (result) {
          await wppSend(from, replyRecurringConfirmed(result.updated, result.finance));
        }
      } else if (isNo) {
        clearPendingAction(from);
        await wppSend(from, "Ok! Quando quiser marcar como pago, acesse *Recorrentes* no dashboard. 👍");
      } else {
        await wppSend(from, `Não entendi. Responda *sim* se ${pending.installmentNumber ? "a parcela foi paga" : "foi pago/recebido"} ou *não* para deixar pendente.`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Processa com IA ──
    const ai = await processMessage(messageText);
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
      return NextResponse.json({ ok: true });
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
          const f = addFinance({
            userId: user.id, type: fd.type, amount: fd.amount,
            category: cap(fd.category), description: cap(fd.description),
            date: financeDate, mode: financeMode, source: "whatsapp",
            status: isPending ? "pending" : "posted",
            registeredBy: from,
          });
          const bal = getBalance(user.id, financeMode, year, month);
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
          const registered: Array<ReturnType<typeof addFinance> & { pending: boolean }> = [];
          for (const fd of financeItems) {
            const financeMode = (fd.mode || "personal") as "personal" | "business";
            const financeDate = fd.date || today;
            const isPending = financeDate > today;
            const f = addFinance({
              userId: user.id, type: fd.type, amount: fd.amount,
              category: cap(fd.category), description: cap(fd.description),
              date: financeDate, mode: financeMode, source: "whatsapp",
              status: isPending ? "pending" : "posted",
              registeredBy: from,
            });
            registered.push({ ...f, pending: isPending });
          }
          const primaryMode = (financeItems[0].mode || "personal") as "personal" | "business";
          const bal = getBalance(user.id, primaryMode, year, month);
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
        console.log(`[bot] finance_edit keyword="${keyword}" finance=${JSON.stringify(ai.finance)}`);

        const editPatch: Record<string, unknown> = {};
        if (ai.finance?.amount && ai.finance.amount > 0) editPatch.amount = ai.finance.amount;
        if (ai.finance?.category) editPatch.category = ai.finance.category;
        if (ai.finance?.date) editPatch.date = ai.finance.date;

        // Busca em TODOS os modos (null) para não perder lançamentos de outro modo
        let editCandidates = keyword ? findFinanceByDescription(user.id, null, keyword) : [];
        // Fallback: tenta buscar sem acentos e sem espaços extras
        if (keyword && !editCandidates.length) {
          const normalizedKeyword = keyword.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
          editCandidates = findFinanceByDescription(user.id, null, normalizedKeyword);
        }
        console.log(`[bot] finance_edit encontrados por palavra-chave=${editCandidates.length}`);

        // Achou exatamente 1 pela palavra-chave e já sabemos o que mudar → aplica direto
        if (keyword && editCandidates.length === 1 && Object.keys(editPatch).length > 0) {
          const editTarget = editCandidates[0];
          const updated = updateFinance(editTarget.id, user.id, editPatch as Parameters<typeof updateFinance>[2]);
          if (updated) {
            const bal = getBalance(user.id, updated.mode as "personal" | "business", year, month);
            const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
            await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
          }
          break;
        }

        // Achou exatamente 1 pela palavra-chave mas ainda não sabemos o que mudar
        if (keyword && editCandidates.length === 1) {
          const editTarget = editCandidates[0];
          setPendingAction(from, {
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
          setPendingAction(from, {
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
        const recentCandidates = getFinancesLastDays(user.id, null, 5);
        if (!recentCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento nos últimos 5 dias${keyword ? ` com *"${keyword}"*` : ""}.\n\nDigite *extrato* para ver os lançamentos.`);
          break;
        }
        const recentList = recentCandidates.map((c, i) =>
          `${i + 1}️⃣ ${c.type === "income" ? "💰" : "💸"} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
        ).join("\n");
        setPendingAction(from, {
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
        console.log(`[bot] finance_delete keyword="${delKeyword}" finance=${JSON.stringify(ai.finance)}`);

        const delCandidates = delKeyword ? findFinanceByDescription(user.id, null, delKeyword) : [];
        console.log(`[bot] finance_delete encontrados por palavra-chave=${delCandidates.length}`);

        // Achou exatamente 1 pela palavra-chave → exclui direto (fluxo rápido)
        if (delKeyword && delCandidates.length === 1) {
          const delTarget = delCandidates[0];
          const delOk = deleteFinance(delTarget.id, user.id);
          if (delOk) {
            const delBal = getBalance(user.id, delTarget.mode as "personal" | "business", year, month);
            await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${delTarget.description} — ${formatCurrency(delTarget.amount)}\n📅 ${new Date(delTarget.date + "T12:00:00").toLocaleDateString("pt-BR")}\n${modeLabelFull(delTarget.mode)}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
          }
          break;
        }

        // Palavra-chave achou vários → deixa escolher entre eles
        if (delCandidates.length > 1) {
          const delList = delCandidates.map((c, i) =>
            `${i + 1}️⃣ *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
          ).join("\n");
          setPendingAction(from, {
            type: "finance_select", userId: user.id,
            action: "delete",
            candidates: delCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
          });
          await wppSend(from, `🗑️ Encontrei *${delCandidates.length} lançamentos* com *"${delKeyword}"*:\n\n${delList}\n\nQual deles deseja excluir? Responda com o número ou a data (ex: *1* ou *04/07*).`);
          break;
        }

        // Sem palavra-chave, ou palavra-chave não achou nada → lista os últimos
        // 5 dias de gastos/receitas pra escolher, em vez de um beco sem saída
        const recentCandidates = getFinancesLastDays(user.id, null, 5);
        if (!recentCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento nos últimos 5 dias${delKeyword ? ` com *"${delKeyword}"*` : ""}.\n\nDigite *extrato* para ver os lançamentos.`);
          break;
        }
        const recentList = recentCandidates.map((c, i) =>
          `${i + 1}️⃣ ${c.type === "income" ? "💰" : "💸"} *${c.description}* — ${formatCurrency(c.amount)} · 📅 ${new Date(c.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${modeLabelFull(c.mode)}`
        ).join("\n");
        setPendingAction(from, {
          type: "finance_select", userId: user.id,
          action: "delete",
          candidates: recentCandidates.map(c => ({ id: c.id, description: c.description, amount: c.amount, date: c.date, category: c.category, mode: c.mode })),
        });
        await wppSend(from, `🗑️ ${delKeyword ? `Não encontrei nada com *"${delKeyword}"*, mas aqui` : "Aqui"} estão os lançamentos dos últimos 5 dias:\n\n${recentList}\n\nQual deles deseja excluir? Responda com o número ou a data (ex: *1* ou *04/07*).`);
        break;
      }

      case "finance_analysis": {
        const expCats = getByCategory(user.id, mode, "expense", year, month);
        const incCats = getByCategory(user.id, mode, "income", year, month);
        const analysisBal = getBalance(user.id, mode, year, month);
        const topExpenses = Object.entries(expCats)
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 6);
        const topIncomes = Object.entries(incCats)
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 4);
        const monthLabel = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        const analysisReply = await generateAnalysisResponse(messageText, {
          mode, balance: analysisBal, topExpenses, topIncomes, month: monthLabel,
        });
        await wppSend(from, analysisReply);
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

          const txList = getMonthlyTransactions(user.id, detailMode, year, month).filter(f =>
            f.type === targetType && !isNaN(f.amount) && f.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.date ?? "")
          );
          const monthName = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
          const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);
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
        if (ai.personName) {
          const personPhone = getWppPhoneByName(user, ai.personName);
          if (!personPhone) {
            await wppSend(from, replyPersonNotFound(ai.personName));
            break;
          }
          const personal = getBalance(user.id, "personal", year, month, personPhone);
          const business = getBalance(user.id, "business", year, month, personPhone);
          await wppSend(from, replyBalance(personal, business, ai.personName));
          break;
        }
        const personal = getBalance(user.id, "personal", year, month);
        const business = getBalance(user.id, "business", year, month);
        await wppSend(from, replyBalance(personal, business));
        break;
      }

      case "task_create": {
        if (!ai.task) { await wppSend(from, replyUnknown(messageText)); break; }
        const task = createTask({ userId: user.id, title: cap(ai.task.title), priority: ai.task.priority || "medium", dueDate: ai.task.dueDate, status: "pending", mode });
        await wppSend(from, replyTaskCreated(task));
        break;
      }

      case "task_query": {
        const tasks = getPendingTasks(user.id, mode);
        await wppSend(from, replyTaskList(tasks, mode));
        break;
      }

      case "task_update": {
        let taskToUpdate = null;
        if (ai.task?.taskNumber) taskToUpdate = findTaskByNumber(user.id, ai.task.taskNumber, mode);
        else if (ai.task?.title) taskToUpdate = findTaskByTitle(user.id, ai.task.title, mode);
        const numMatch = messageText.match(/(\d+)/);
        if (!taskToUpdate && numMatch) taskToUpdate = findTaskByNumber(user.id, parseInt(numMatch[1]), mode);
        if (taskToUpdate) {
          const updated = updateTaskStatus(taskToUpdate.id, user.id, ai.task?.newStatus || "completed");
          if (updated) await wppSend(from, replyTaskUpdated(updated));
        } else {
          await wppSend(from, "❓ Tarefa não encontrada. Digite *minhas tarefas* para ver a lista.");
        }
        break;
      }

      case "reminder_set": {
        if (!ai.reminder) { await wppSend(from, replyUnknown(messageText)); break; }
        // Converte horário SP (gerado pela IA) para UTC antes de salvar
        const scheduledUTC = spToUTC(ai.reminder.scheduledAt);
        createReminder({ userId: user.id, message: cap(ai.reminder.message), phone: from, scheduledAt: scheduledUTC, repeat: ai.reminder.repeat || "none" });
        await wppSend(from, replyReminderSet(ai.reminder.message, scheduledUTC, ai.reminder.repeat));
        break;
      }

      case "goal_create": {
        if (!ai.goal?.targetAmount) {
          await wppSend(from, `🎯 Para criar uma meta, me diga o nome e o valor!\n\nExemplo:\n_"Quero guardar R$3.000 para viagem até dezembro"_\n_"Meta: juntar 500 reais de emergência"_`);
          break;
        }
        const goalTitle = cap((ai.goal.title || "").trim() || messageText.slice(0, 60));
        const goalCurrentAmount = Number(ai.goal.currentAmount) || 0;
        const goal = createGoal({ userId: user.id, title: goalTitle, targetAmount: ai.goal.targetAmount, currentAmount: goalCurrentAmount, deadline: ai.goal.deadline, category: ai.goal.category || "Geral", mode, status: "active" });
        const pct = getGoalProgress(goal);
        const currentLine = goalCurrentAmount > 0 ? `\n💵 Já guardado: ${formatCurrency(goalCurrentAmount)}` : "";
        await wppSend(from, `✅ *Meta criada com sucesso!*\n\n🎯 *${goal.title}*\n💰 Alvo: ${formatCurrency(goal.targetAmount)}${currentLine}\n📁 Categoria: ${goal.category}${goal.deadline ? `\n📅 Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}\n📊 Progresso: ${pct}%\n\nAcompanhe no dashboard → Metas 🚀`);
        break;
      }

      case "goal_add": {
        const addAmt = (ai.goal?.targetAmount ?? (ai.goal as unknown as Record<string,number>)?.amount) || ai.finance?.amount || 0;
        const addTitle = (ai.goal?.title || "").trim();
        const activeGoals = getActiveGoals(user.id, mode);

        if (!addAmt || addAmt <= 0) {
          await wppSend(from, `💰 Qual valor quer adicionar à meta?\n\nExemplo: _"adicionar 200 na meta viagem"_`);
          break;
        }

        // Tenta encontrar pelo título
        let addGoal = addTitle ? findGoalByTitle(user.id, addTitle, mode) : null;

        // Título não bateu — só pega direto se tiver 1 meta
        if (!addGoal && activeGoals.length === 1) {
          addGoal = activeGoals[0];
        }

        if (addGoal) {
          const updated = updateGoalAmount(addGoal.id, user.id, addAmt);
          if (updated) {
            const p = getGoalProgress(updated);
            const emoji = p >= 100 ? "🎉" : p >= 75 ? "🚀" : "📈";
            await wppSend(from, `${emoji} *${formatCurrency(addAmt)} adicionado!*\n\n🎯 ${updated.title}\n📊 ${formatCurrency(updated.currentAmount)} / ${formatCurrency(updated.targetAmount)} (${p}%)${updated.status === "completed" ? "\n\n🏆 *Meta concluída! Parabéns!*" : ""}`);
          }
        } else if (activeGoals.length === 0) {
          await wppSend(from, "❓ Você não tem metas ativas. Crie uma primeiro!\n\nEx: _\"Meta: guardar 3000 para viagem\"_");
        } else {
          // Múltiplas metas — pergunta qual
          const goalList = activeGoals.map(g => ({ id: g.id, title: g.title, currentAmount: g.currentAmount, targetAmount: g.targetAmount }));
          setPendingAction(from, { type: "goal_selection", userId: user.id, mode, amount: addAmt, goals: goalList });
          let msg = `🎯 Você tem ${activeGoals.length} metas ativas. Em qual deseja adicionar *${formatCurrency(addAmt)}*?\n\n`;
          activeGoals.forEach((g, i) => {
            const p = getGoalProgress(g);
            msg += `*${i + 1}.* ${g.title} (${p}%)\n`;
          });
          msg += `\nResponda com o número ou nome da meta. ⏱ _Válido por 5 min._`;
          await wppSend(from, msg);
        }
        break;
      }

      case "goal_query": {
        const goals = getActiveGoals(user.id, mode);
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
        const goal = findGoalByTitle(user.id, titleStr, mode);
        if (goal) {
          updateGoalStatus(goal.id, user.id, "completed");
          await wppSend(from, `🏆 *Meta concluída!*\n\n🎯 ${goal.title}\n\nParabéns! Você atingiu seu objetivo! 🎉`);
        } else {
          await wppSend(from, "❓ Meta não encontrada.");
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

        const allVehicles = getVehiclesByUser(user.id, mode);

        // Sem veículos → registra como despesa financeira
        if (allVehicles.length === 0) {
          const f = addFinance({ userId: user.id, type: "expense", amount: vAmount, category: "Transporte", description: vDesc, date: vDate, mode, source: "whatsapp", registeredBy: from });
          const bal = getBalance(user.id, mode, year, month).balance;
          await wppSend(from, `${replyFinanceRegistered(f, bal)}\n\n💡 _Dica: Cadastre seu veículo no dashboard → Veículos para controlar gastos separadamente!_`);
          break;
        }

        // Identifica veículo pelo nome mencionado na mensagem
        let targetVehicle = ai.vehicle?.name
          ? findVehicleByName(user.id, ai.vehicle.name, mode)
          : null;

        // Um único veículo → registra direto
        if (!targetVehicle && allVehicles.length === 1) {
          targetVehicle = allVehicles[0];
        }

        if (targetVehicle) {
          const exp = addVehicleExpense(targetVehicle.id, user.id, { date: vDate, km: vKm, type: vType, amount: vAmount, description: vDesc });
          if (exp) {
            const vCatMap: Record<string, string> = { fuel: "Transporte", maintenance: "Manutenção", insurance: "Seguros", tax: "Impostos", other: "Transporte" };
            const newExp = exp.expenses[exp.expenses.length - 1];
            const f = addFinance({ userId: user.id, type: "expense", amount: vAmount, category: vCatMap[vType] || "Transporte", description: `${vDesc} — ${targetVehicle.brand} ${targetVehicle.model}`, date: vDate, mode, source: "whatsapp", registeredBy: from });
            setExpenseFinanceId(targetVehicle.id, newExp.id, f.id);
            const total = getVehicleTotalExpenses(exp);
            await wppSend(from, `${typeEmoji[vType]} *Registrado no ${targetVehicle.brand} ${targetVehicle.model}!*\n\n💰 ${formatCurrency(vAmount)} — ${vDesc}\n📊 Total do veículo: ${formatCurrency(total)}`);
          }
          break;
        }

        // Múltiplos veículos → pergunta qual
        const expenseData = { amount: vAmount, expenseType: vType, description: vDesc, km: vKm, date: vDate };
        const vehicleList = allVehicles.map(v => ({ id: v.id, brand: v.brand, model: v.model, year: v.year }));
        setPendingAction(from, { type: "vehicle_selection", userId: user.id, mode, expenseData, vehicles: vehicleList });

        let msg = `🚗 Você tem ${allVehicles.length} veículos cadastrados. Em qual registrar *${formatCurrency(vAmount)}* de ${vDesc}?\n\n`;
        allVehicles.forEach((v, i) => { msg += `*${i + 1}.* ${v.brand} ${v.model} (${v.year})${v.plate ? ` — ${v.plate}` : ""}\n`; });
        msg += `\nResponda com o número ou nome do veículo. ⏱ _Válido por 5 min._`;
        await wppSend(from, msg);
        break;
      }

      case "vehicle_query": {
        const vehicles = getVehiclesByUser(user.id, mode);
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

      case "recurring_create": {
        if (!ai.recurring) { await wppSend(from, replyUnknown(messageText)); break; }
        const r = ai.recurring;
        const rec = createRecurring({
          userId: user.id,
          type: r.type,
          amount: r.amount,
          totalAmount: r.totalAmount,
          category: cap(r.category || (r.type === "income" ? "Outros" : "Outros")),
          description: cap(r.description),
          mode: (r.mode as "personal" | "business") || mode,
          recurrenceType: r.recurrenceType,
          totalInstallments: r.totalInstallments,
          repeatUnit: r.repeatUnit || "monthly",
          dayOfMonth: r.dayOfMonth,
          startDate: r.startDate || todayStrBR(),
          source: "whatsapp",
        });
        await wppSend(from, replyRecurringCreated(rec));
        break;
      }

      case "recurring_query": {
        const recs = getRecurringByUser(user.id, mode, "active");
        await wppSend(from, replyRecurringList(recs));
        break;
      }

      case "recurring_cancel": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, "❓ Qual recorrente ou parcela deseja cancelar?"); break; }
        const found = findRecurringByDescription(user.id, keyword);
        if (!found) { await wppSend(from, `❓ Não encontrei recorrente com *"${keyword}"*.\n\nDigite *minhas parcelas* para ver a lista.`); break; }
        cancelRecurring(found.id, user.id);
        await wppSend(from, `✅ *${found.description}* cancelado(a)!\n\nSe quiser reativar, acesse *Recorrentes* no dashboard.`);
        break;
      }

      case "recurring_edit": {
        const editKw = ai.keyword || ai.recurring?.description || "";
        if (!editKw) { await wppSend(from, "❓ Qual recorrente ou parcela deseja editar?"); break; }
        const editFound = findRecurringByDescription(user.id, editKw);
        if (!editFound) { await wppSend(from, `❓ Não encontrei recorrente com *"${editKw}"*.\n\nDigite *minhas parcelas* para ver a lista.`); break; }
        const patch: Parameters<typeof updateRecurring>[2] = {};
        if (ai.recurring?.amount) patch.amount = ai.recurring.amount;
        if (ai.recurring?.description) patch.description = cap(ai.recurring.description);
        if (ai.recurring?.category) patch.category = cap(ai.recurring.category);
        if (ai.recurring?.dayOfMonth) patch.dayOfMonth = ai.recurring.dayOfMonth;
        if (ai.recurring?.repeatUnit) patch.repeatUnit = ai.recurring.repeatUnit;
        if (Object.keys(patch).length === 0) { await wppSend(from, "❓ O que deseja alterar? Ex: _\"muda o netflix para 65 reais\"_"); break; }
        const editUpdated = updateRecurring(editFound.id, user.id, patch);
        if (editUpdated) {
          await wppSend(from, `✏️ *${editUpdated.description}* atualizado!\n\n💰 Novo valor: ${formatCurrency(editUpdated.amount)}`);
        }
        break;
      }

      case "drive_search": {
        const driveQuery = ai.keyword || messageText;
        const allFiles = getFiles(user.id);
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
        const foundFile = getFileById(fileId, user.id);
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
        const recentFile = getRecentFile(user.id);
        if (!recentFile) { await wppSend(from, "❓ Não encontrei nenhum arquivo recente no Drive."); break; }
        // Gera um nome de arquivo "limpo" a partir da descrição (sem caracteres especiais)
        const ext = recentFile.originalName.includes(".") ? recentFile.originalName.slice(recentFile.originalName.lastIndexOf(".")) : "";
        const cleanName = newName.toLowerCase().replace(/[^a-z0-9\s\-_]/g, "").replace(/\s+/g, "_").slice(0, 60) + ext;
        updateFile(recentFile.id, user.id, { originalName: cleanName, description: newName });
        await wppSend(from, `✅ *Arquivo renomeado!*\n\n📄 ${cleanName}\n💬 Descrição: ${newName}\n\nJá está atualizado no *📁 Drive*. Para encontrar depois: _"ache ${newName}"_`);
        break;
      }

      case "agenda_create": {
        const d = ai.agendaData;
        if (!d?.title || !d?.startDate) {
          await wppSend(from, `🗓️ Para agendar, me diga o título e a data/hora!\n\nEx: _"Agendar reunião amanhã às 14h"_\nEx: _"Consulta médica sexta às 10h no Pronto Socorro"_`);
          break;
        }
        const startSP = `${d.startDate}T${d.startTime || "00:00"}:00`;
        const startAt = spToUTC(startSP);
        const endAt = d.endDate ? spToUTC(`${d.endDate}T${d.endTime || "00:00"}:00`) : undefined;
        const apt = createAppointment({
          userId: user.id,
          title: cap(d.title),
          description: d.description,
          location: d.location,
          startAt,
          endAt,
          allDay: d.allDay ?? false,
          repeat: d.repeat ?? "none",
          status: "scheduled",
          source: "whatsapp",
        });
        await wppSend(from, replyAgendaCreated(apt));
        break;
      }

      case "agenda_list": {
        const apts = getUpcomingAppointments(user.id, 14);
        await wppSend(from, replyAgendaList(apts));
        break;
      }

      case "agenda_update": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, "❓ Qual compromisso deseja alterar?"); break; }
        const found = findAppointmentByKeyword(user.id, keyword);
        if (!found) {
          await wppSend(from, `❓ Não encontrei nenhum compromisso com *"${keyword}"*.\n\nDigite *meus compromissos* para ver a lista.`);
          break;
        }
        const d2 = ai.agendaData ?? {};
        const patch: Parameters<typeof updateAppointment>[2] = {};
        if (d2.startDate) patch.startAt = spToUTC(`${d2.startDate}T${d2.startTime || "00:00"}:00`);
        if (d2.endDate) patch.endAt = spToUTC(`${d2.endDate}T${d2.endTime || "00:00"}:00`);
        if (d2.title) patch.title = cap(d2.title);
        if (d2.location) patch.location = d2.location;
        if (d2.description) patch.description = d2.description;
        const updated = updateAppointment(found.id, user.id, patch);
        if (updated) await wppSend(from, replyAgendaUpdated(updated));
        break;
      }

      case "agenda_delete": {
        const keyword = ai.keyword || "";
        if (!keyword) { await wppSend(from, "❓ Qual compromisso deseja cancelar?"); break; }
        const found = findAppointmentByKeyword(user.id, keyword);
        if (!found) {
          await wppSend(from, `❓ Não encontrei nenhum compromisso com *"${keyword}"*.\n\nDigite *meus compromissos* para ver a lista.`);
          break;
        }
        deleteAppointment(found.id, user.id);
        await wppSend(from, replyAgendaDeleted(found.title));
        break;
      }

      case "agenda_add_meet": {
        // Adiciona Google Meet a compromisso existente sem alterar data/hora
        const addMeetKeyword = ai.keyword || "";
        const addMeetFound = addMeetKeyword
          ? findAppointmentByKeyword(user.id, addMeetKeyword)
          : getUpcomingAppointments(user.id, 1)[0] || null;
        if (!addMeetFound) {
          await wppSend(from, `❓ Não encontrei o compromisso${addMeetKeyword ? ` com *"${addMeetKeyword}"*` : ""}.\n\nDigite *meus compromissos* para ver a lista.`);
          break;
        }
        if (addMeetFound.meetLink) {
          await wppSend(from, `ℹ️ *${addMeetFound.title}* já tem um link do Meet:\n🔗 ${addMeetFound.meetLink}`);
          break;
        }
        if (!addMeetFound.endAt) {
          await wppSend(from, `⚠️ O compromisso *${addMeetFound.title}* não tem horário de fim definido. Edite-o pela agenda para adicionar a hora de término e tente novamente.`);
          break;
        }
        if (!isConnected(user.id)) {
          await wppSend(from, `🔗 Sua conta Google não está conectada.\n\nAcesse *Configurações → Integrações* para conectar e criar links do Meet.`);
          break;
        }
        await wppSend(from, `⏳ Criando link do Google Meet para *${addMeetFound.title}*...`);
        try {
          const meetResult = await createMeetEvent({
            userId: user.id, title: addMeetFound.title, description: addMeetFound.description,
            startAt: addMeetFound.startAt, endAt: addMeetFound.endAt, attendees: [],
          });
          updateAppointment(addMeetFound.id, user.id, { meetLink: meetResult.meetLink, calendarEventId: meetResult.calendarEventId });
          const { formatDateTimeBR } = await import("@/lib/date-br");
          await wppSend(from, `✅ *Meet adicionado!*\n\n📅 *${addMeetFound.title}*\n🕒 ${formatDateTimeBR(addMeetFound.startAt)}\n🔗 ${meetResult.meetLink}`);
        } catch (e) {
          console.error("[agenda_add_meet]", e);
          await wppSend(from, `❌ Não consegui criar o Google Meet. Verifique se sua conta Google ainda está conectada em Configurações.`);
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
        setPendingAction(from, {
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
        const newMode = ai.mode || (mode === "personal" ? "business" : "personal");
        updateUser(user.id, { activeMode: newMode });
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
          const personal = getBalance(user.id, "personal", year, month);
          const business = getBalance(user.id, "business", year, month);
          await wppSend(from, replyBalance(personal, business));
        } else if (lower.includes("extrato") || lower.includes("últimos") || lower.includes("ultimos")) {
          const recents = getRecentTransactions(user.id, mode, 10);
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook]", e);
    if (_from) {
      try { await wppSend(_from, "❌ Ocorreu um erro interno. Tente novamente em instantes."); } catch { /* ignora */ }
    }
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "ControlaAI Bot" });
}
