import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, isTrialExpired, getUserByWppCode } from "@/lib/users";
import { processMessage, transcribeAudio } from "@/lib/ai-processor";
import { addFinance, getBalance, formatCurrency, findFinanceByDescription, deleteFinance, updateFinance, getRecentTransactions } from "@/lib/finances";
import { createTask, getPendingTasks, updateTaskStatus, findTaskByNumber, findTaskByTitle } from "@/lib/tasks";
import { createReminder } from "@/lib/reminders";
import { createGoal, getActiveGoals, updateGoalAmount, updateGoalStatus, findGoalByTitle, getGoalProgress } from "@/lib/goals";
import { getVehiclesByUser, addVehicleExpense, findVehicleByName, getVehicleTotalExpenses } from "@/lib/vehicles";
import { setPendingAction, getPendingAction, clearPendingAction, parseVehicleChoice } from "@/lib/pending-actions";
import { sendText as wppSend } from "@/lib/wppconnect";
import { nowBR, spToUTC } from "@/lib/date-br";
import {
  replyFinanceRegistered, replyBalance, replyTaskCreated, replyTaskList,
  replyTaskUpdated, replyReminderSet, replyModeSwitch, replyHelp,
  replyTrialExpired, replyUnknown, replyLowConfidence,
} from "@/lib/bot-replies";

function getUserByWppPhone(phone: string) {
  const cleaned = phone.replace(/\D/g, "");
  return getUsers().find(u => {
    const wp = ((u as Record<string, unknown>).wppPhone as string | undefined)?.replace(/\D/g, "");
    if (!wp) return false;
    // Correspondência exata
    if (wp === cleaned) return true;
    // Sufixo de 9 dígitos (nono dígito BR)
    if (cleaned.length >= 9 && wp.length >= 9 && (
      cleaned.endsWith(wp.slice(-9)) || wp.endsWith(cleaned.slice(-9))
    )) return true;
    // Sufixo de 11 dígitos (DD+número sem país)
    if (cleaned.length >= 11 && wp.length >= 11 && (
      cleaned.endsWith(wp.slice(-11)) || wp.endsWith(cleaned.slice(-11))
    )) return true;
    return false;
  }) ?? null;
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

    let messageText = (bodyText as string ?? "").trim();

    // Transcreve áudio
    if (!messageText && body.type === "audio") {
      try {
        const audioUrl = body.mediaUrl || body.url;
        if (audioUrl) {
          const audioRes = await fetch(audioUrl);
          const buf = Buffer.from(await audioRes.arrayBuffer());
          const transcript = await transcribeAudio(buf, body.mimetype || "audio/ogg");
          if (transcript) messageText = transcript;
        }
      } catch { /* ignora */ }
    }

    if (!messageText) return NextResponse.json({ ok: true });

    // ── Verifica se é um código de vinculação (4 dígitos) ──
    const codeMatch = messageText.trim().match(/^(\d{4})$/);
    if (codeMatch) {
      const codeUser = getUserByWppCode(codeMatch[1]);
      if (codeUser) {
        updateUser(codeUser.id, { wppPhone: from, wppVerifyCode: undefined, wppVerifyExpires: undefined });
        await wppSend(from, `✅ *WhatsApp vinculado com sucesso!*\n\nOlá, ${codeUser.name}! Agora você pode usar o bot normalmente.\n\nDigite *ajuda* para ver os comandos disponíveis.`);
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

    // ── Verifica ação pendente (ex: seleção de veículo) ──
    const pending = getPendingAction(from);
    if (pending?.type === "vehicle_selection" && pending.userId === user.id) {
      const choiceIdx = parseVehicleChoice(messageText, pending.vehicles);
      if (choiceIdx >= 0) {
        clearPendingAction(from);
        const chosen = pending.vehicles[choiceIdx];
        const typeEmoji: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };
        const exp = addVehicleExpense(chosen.id, user.id, { date: pending.expenseData.date, km: pending.expenseData.km, type: pending.expenseData.expenseType, amount: pending.expenseData.amount, description: pending.expenseData.description });
        if (exp) {
          const total = getVehicleTotalExpenses(exp);
          await wppSend(from, `${typeEmoji[pending.expenseData.expenseType] || "📌"} *Registrado no ${chosen.brand} ${chosen.model}!*\n\n💰 ${formatCurrency(pending.expenseData.amount)} — ${pending.expenseData.description}\n📊 Total do veículo: ${formatCurrency(total)}`);
        }
        return NextResponse.json({ ok: true });
      } else {
        // não é uma resposta de veículo — limpa pendência e processa normalmente
        clearPendingAction(from);
      }
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
        if (!ai.finance) { await wppSend(from, replyUnknown(messageText)); break; }
        // Usa o modo detectado pelo AI (empresa/pessoal) ou o modo ativo do usuário
        const financeMode = ai.finance.mode || mode;
        const f = addFinance({
          userId: user.id, type: ai.finance.type, amount: ai.finance.amount,
          category: ai.finance.category, description: ai.finance.description,
          date: ai.finance.date || now.toISOString().slice(0, 10), mode: financeMode, source: "whatsapp",
        });
        const bal = getBalance(user.id, financeMode, year, month);
        const modeLabel = financeMode !== mode ? ` _(${financeMode === "business" ? "🏢 Empresa" : "👤 Pessoal"})_` : "";
        await wppSend(from, replyFinanceRegistered(f, bal.balance) + modeLabel);
        break;
      }

      case "finance_edit": {
        const keyword = ai.keyword || ai.finance?.description || ai.finance?.category || "";
        console.log(`[bot] finance_edit keyword="${keyword}" finance=${JSON.stringify(ai.finance)}`);
        if (!keyword) {
          await wppSend(from, `✏️ Para editar, diga qual lançamento e o novo valor.\n\nEx: _"corrija o gasto do ifood para 80 reais"_\nOu: _"muda a categoria do mercado para Alimentação"_\n\nDigite *extrato* para ver os lançamentos recentes.`);
          break;
        }
        // Busca em TODOS os modos (null) para não perder lançamentos de outro modo
        const editCandidates = findFinanceByDescription(user.id, null, keyword);
        console.log(`[bot] finance_edit encontrados=${editCandidates.length}`);
        if (!editCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento com *"${keyword}"*.\n\nDigite *extrato* para ver os lançamentos e use o nome exato.`);
          break;
        }
        const editTarget = editCandidates[0];
        const patch: Record<string, unknown> = {};
        if (ai.finance?.amount && ai.finance.amount > 0) patch.amount = ai.finance.amount;
        if (ai.finance?.category) patch.category = ai.finance.category;
        if (ai.finance?.date) patch.date = ai.finance.date;
        if (Object.keys(patch).length === 0) {
          // Encontrou o lançamento mas não há novos valores para aplicar
          await wppSend(from, `🔍 Encontrei: *${editTarget.description}* — ${formatCurrency(editTarget.amount)} (${editTarget.category})\n\nO que deseja alterar? Ex:\n• _"muda para 80 reais"_\n• _"muda categoria para Lazer"_`);
          break;
        }
        const updated = updateFinance(editTarget.id, user.id, patch as Parameters<typeof updateFinance>[2]);
        if (updated) {
          const bal = getBalance(user.id, updated.mode as "personal" | "business", year, month);
          const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
          await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
        }
        break;
      }

      case "finance_delete": {
        const delKeyword = ai.keyword || ai.finance?.description || ai.finance?.category || "";
        console.log(`[bot] finance_delete keyword="${delKeyword}" finance=${JSON.stringify(ai.finance)}`);
        if (!delKeyword) {
          await wppSend(from, `🗑️ Para excluir, diga qual lançamento apagar.\n\nEx: _"apaga o gasto do ifood"_\nEx: _"remove o lançamento do mercado"_\n\nDigite *extrato* para ver os lançamentos recentes.`);
          break;
        }
        const delCandidates = findFinanceByDescription(user.id, null, delKeyword);
        console.log(`[bot] finance_delete encontrados=${delCandidates.length}`);
        if (!delCandidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento com *"${delKeyword}"*.\n\nDigite *extrato* para ver os lançamentos.`);
          break;
        }
        const delTarget = delCandidates[0];
        const delOk = deleteFinance(delTarget.id, user.id);
        if (delOk) {
          const delBal = getBalance(user.id, delTarget.mode as "personal" | "business", year, month);
          await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${delTarget.description} — ${formatCurrency(delTarget.amount)}\n📅 ${new Date(delTarget.date + "T12:00:00").toLocaleDateString("pt-BR")}\n\n📊 Saldo: ${formatCurrency(delBal.balance)}`);
        }
        break;
      }

      case "finance_query":
      case "balance_query": {
        const personal = getBalance(user.id, "personal", year, month);
        const business = getBalance(user.id, "business", year, month);
        await wppSend(from, replyBalance(personal, business));
        break;
      }

      case "task_create": {
        if (!ai.task) { await wppSend(from, replyUnknown(messageText)); break; }
        const task = createTask({ userId: user.id, title: ai.task.title, priority: ai.task.priority || "medium", dueDate: ai.task.dueDate, status: "pending", mode });
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
        createReminder({ userId: user.id, message: ai.reminder.message, phone: from, scheduledAt: scheduledUTC, repeat: ai.reminder.repeat || "none" });
        await wppSend(from, replyReminderSet(ai.reminder.message, scheduledUTC, ai.reminder.repeat));
        break;
      }

      case "goal_create": {
        if (!ai.goal?.targetAmount) {
          await wppSend(from, `🎯 Para criar uma meta, me diga o nome e o valor!\n\nExemplo:\n_"Quero guardar R$3.000 para viagem até dezembro"_\n_"Meta: juntar 500 reais de emergência"_`);
          break;
        }
        const goalTitle = (ai.goal.title || "").trim() || messageText.slice(0, 60);
        const goalCurrentAmount = Number(ai.goal.currentAmount) || 0;
        const goal = createGoal({ userId: user.id, title: goalTitle, targetAmount: ai.goal.targetAmount, currentAmount: goalCurrentAmount, deadline: ai.goal.deadline, category: ai.goal.category || "Geral", mode, status: "active" });
        const pct = getGoalProgress(goal);
        const currentLine = goalCurrentAmount > 0 ? `\n💵 Já guardado: ${formatCurrency(goalCurrentAmount)}` : "";
        await wppSend(from, `✅ *Meta criada com sucesso!*\n\n🎯 *${goal.title}*\n💰 Alvo: ${formatCurrency(goal.targetAmount)}${currentLine}\n📁 Categoria: ${goal.category}${goal.deadline ? `\n📅 Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}\n📊 Progresso: ${pct}%\n\nAcompanhe no dashboard → Metas 🚀`);
        break;
      }

      case "goal_add": {
        const amount = (ai.goal?.targetAmount ?? (ai.goal as unknown as Record<string,number>)?.amount) || ai.finance?.amount || 0;
        const title = ai.goal?.title || "";
        const goal = findGoalByTitle(user.id, title, mode) ?? (getActiveGoals(user.id, mode)[0] ?? null);
        if (goal && amount > 0) {
          const updated = updateGoalAmount(goal.id, user.id, amount);
          if (updated) {
            const pct = getGoalProgress(updated);
            const emoji = pct >= 100 ? "🎉" : pct >= 75 ? "🚀" : "📈";
            await wppSend(from, `${emoji} *${formatCurrency(amount)} adicionado!*\n\n🎯 ${updated.title}\n📊 ${formatCurrency(updated.currentAmount)} / ${formatCurrency(updated.targetAmount)} (${pct}%)${updated.status === "completed" ? "\n\n🏆 *Meta concluída! Parabéns!*" : ""}`);
          }
        } else {
          await wppSend(from, "❓ Meta não encontrada. Digite *minhas metas* para ver a lista.");
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
        const vAmount = ai.vehicle?.amount || 0;
        const vType = ai.vehicle?.expenseType || "other";
        const vDesc = ai.vehicle?.description || vType;
        const vKm = ai.vehicle?.km;
        const vDate = now.toISOString().slice(0, 10);
        const typeEmoji: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };

        const allVehicles = getVehiclesByUser(user.id, mode);

        // Sem veículos → registra como despesa financeira
        if (allVehicles.length === 0) {
          const f = addFinance({ userId: user.id, type: "expense", amount: vAmount, category: "Transporte", description: vDesc, date: vDate, mode, source: "whatsapp" });
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
