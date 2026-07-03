import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, isTrialExpired, getUserByWppCode } from "@/lib/users";
import { processMessage, transcribeAudio } from "@/lib/ai-processor";
import { addFinance, getBalance, formatCurrency, findFinanceByDescription, deleteFinance, updateFinance, getRecentTransactions } from "@/lib/finances";
import { createTask, getPendingTasks, updateTaskStatus, findTaskByNumber, findTaskByTitle } from "@/lib/tasks";
import { createReminder } from "@/lib/reminders";
import { createGoal, getActiveGoals, updateGoalAmount, updateGoalStatus, findGoalByTitle, getGoalProgress } from "@/lib/goals";
import { getVehiclesByUser, addVehicleExpense, findVehicleByName, getVehicleTotalExpenses } from "@/lib/vehicles";
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
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const event = (body.event as string ?? "").toLowerCase();
    if (event !== "onmessage" && event !== "message" && event !== "onanymessage") {
      return NextResponse.json({ ok: true });
    }

    const rawFrom = body.from ?? body.data?.from ?? "";
    const from = (rawFrom as string).replace("@c.us", "").replace(/\D/g, "");
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

    // ── Processa com IA ──
    const ai = await processMessage(messageText);
    console.log(`[bot] ${user.name} | intent=${ai.intent} | confidence=${ai.confidence} | mode=${mode}`);

    // Confiança baixa — pede esclarecimento antes de agir
    if (ai.confidence < 0.6 && ai.intent !== "unknown" && ai.intent !== "help") {
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
        if (!ai.finance) break;
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
        if (!ai.finance) break;
        // Busca em TODOS os modos (null) para não perder lançamentos de outro modo
        const keyword = ai.keyword || ai.finance.description || ai.finance.category || "";
        console.log(`[bot] finance_edit keyword="${keyword}"`);
        const candidates = keyword
          ? findFinanceByDescription(user.id, null, keyword)
          : getRecentTransactions(user.id, mode, 1);
        if (!candidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento com *"${keyword}"*.\n\nDigite *extrato* para ver os últimos lançamentos e use o nome exato da descrição.`);
          break;
        }
        const target = candidates[0];
        const patch: Record<string, unknown> = {};
        if (ai.finance.amount && ai.finance.amount > 0) patch.amount = ai.finance.amount;
        if (ai.finance.category) patch.category = ai.finance.category;
        if (ai.finance.date) patch.date = ai.finance.date;
        const updated = updateFinance(target.id, user.id, patch as Parameters<typeof updateFinance>[2]);
        if (updated) {
          const bal = getBalance(user.id, updated.mode as "personal" | "business", year, month);
          const modeLabel = updated.mode === "business" ? "🏢 Empresa" : "👤 Pessoal";
          await wppSend(from, `✏️ *Lançamento atualizado!*\n\n📝 ${updated.description}\n💰 ${formatCurrency(updated.amount)}\n🏷️ ${updated.category}\n${modeLabel}\n\n📊 Saldo: ${formatCurrency(bal.balance)}`);
        }
        break;
      }

      case "finance_delete": {
        const keyword = ai.keyword || ai.finance?.description || ai.finance?.category || "";
        const candidates = keyword
          ? findFinanceByDescription(user.id, null, keyword)
          : getRecentTransactions(user.id, mode, 1);
        if (!candidates.length) {
          await wppSend(from, `❓ Não encontrei nenhum lançamento com "${keyword}".\n\nDigite *extrato* para ver os últimos lançamentos.`);
          break;
        }
        const target = candidates[0];
        const ok = deleteFinance(target.id, user.id);
        if (ok) {
          const bal = getBalance(user.id, mode, year, month);
          await wppSend(from, `🗑️ *Lançamento excluído!*\n\n❌ ${target.description} — ${formatCurrency(target.amount)}\n\n📊 Saldo atualizado: ${formatCurrency(bal.balance)}`);
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
        if (!ai.task) break;
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
        if (!ai.reminder) break;
        // Converte horário SP (gerado pela IA) para UTC antes de salvar
        const scheduledUTC = spToUTC(ai.reminder.scheduledAt);
        createReminder({ userId: user.id, message: ai.reminder.message, phone: from, scheduledAt: scheduledUTC, repeat: ai.reminder.repeat || "none" });
        await wppSend(from, replyReminderSet(ai.reminder.message, scheduledUTC, ai.reminder.repeat));
        break;
      }

      case "goal_create": {
        if (!ai.goal) break;
        const goal = createGoal({ userId: user.id, title: ai.goal.title, targetAmount: ai.goal.targetAmount, currentAmount: 0, deadline: ai.goal.deadline, category: ai.goal.category || "Geral", mode, status: "active" });
        const pct = getGoalProgress(goal);
        await wppSend(from, `✅ *Meta criada!*\n\n🎯 ${goal.title}\n💰 Alvo: ${formatCurrency(goal.targetAmount)}\n📊 Progresso: ${pct}%${goal.deadline ? `\n📅 Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}`);
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
        if (!ai.vehicle) break;
        const vehicles = getVehiclesByUser(user.id, mode);
        let vehicle = ai.vehicle.name ? findVehicleByName(user.id, ai.vehicle.name, mode) : vehicles[0];
        if (!vehicle && vehicles.length === 0) {
          await wppSend(from, `🚗 Você não tem veículos cadastrados.\n\nAcesse o dashboard em *Veículos* para adicionar um.`);
          break;
        }
        if (!vehicle) vehicle = vehicles[0];
        const exp = addVehicleExpense(vehicle.id, user.id, {
          date: now.toISOString().slice(0, 10),
          km: ai.vehicle.km,
          type: ai.vehicle.expenseType || "other",
          amount: ai.vehicle.amount || 0,
          description: ai.vehicle.description || ai.vehicle.expenseType || "despesa",
        });
        if (exp) {
          const total = getVehicleTotalExpenses(exp);
          const typeEmoji: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };
          await wppSend(from, `${typeEmoji[ai.vehicle.expenseType || "other"] || "📌"} *Despesa registrada no ${vehicle.brand} ${vehicle.model}!*\n\n💰 ${formatCurrency(ai.vehicle.amount || 0)} — ${ai.vehicle.description || ai.vehicle.expenseType}\n📊 Total do veículo: ${formatCurrency(total)}`);
        }
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
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "ControlaAI Bot" });
}
