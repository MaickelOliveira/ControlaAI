import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, isTrialExpired } from "@/lib/users";
import { processMessage, transcribeAudio } from "@/lib/ai-processor";
import { addFinance, getBalance, formatCurrency } from "@/lib/finances";
import { createTask, getPendingTasks, updateTaskStatus, findTaskByNumber, findTaskByTitle } from "@/lib/tasks";
import { createReminder } from "@/lib/reminders";
import { createGoal, getActiveGoals, updateGoalAmount, updateGoalStatus, findGoalByTitle, getGoalProgress } from "@/lib/goals";
import { getVehiclesByUser, addVehicleExpense, findVehicleByName, getVehicleTotalExpenses } from "@/lib/vehicles";
import { sendText as wppSend } from "@/lib/wppconnect";
import {
  replyFinanceRegistered, replyBalance, replyTaskCreated, replyTaskList,
  replyTaskUpdated, replyReminderSet, replyModeSwitch, replyHelp,
  replyTrialExpired, replyUnknown,
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
    console.log(`[webhook] event=${event} from=${from} fromMe=${fromMe} body=${JSON.stringify(body).slice(0, 300)}`);
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

    // ── Identifica usuário pelo wppPhone cadastrado ──
    const allUsers = getUsers();
    console.log(`[webhook] buscando from=${from} | users=${allUsers.length} | phones=${allUsers.map(u => (u as Record<string,unknown>).wppPhone).join(",")}`);
    const user = getUserByWppPhone(from);

    if (!user) {
      // Número não cadastrado — rejeita
      await wppSend(from, "⛔ *Ops!* Seu número não está cadastrado em nossa plataforma.\n\nSe você é cliente, acesse o dashboard e cadastre seu número em *Configurações*.\n\nPara contratar: controlaai.app 🚀");
      return NextResponse.json({ ok: true });
    }

    // ── Verifica trial ──
    if (isTrialExpired(user)) {
      await wppSend(from, replyTrialExpired());
      return NextResponse.json({ ok: true });
    }

    const mode = user.activeMode;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // ── Processa com IA ──
    const ai = await processMessage(messageText);
    console.log(`[bot] ${user.name} | intent=${ai.intent} | mode=${mode}`);

    switch (ai.intent) {

      case "finance_register": {
        if (!ai.finance) break;
        const f = addFinance({
          userId: user.id, type: ai.finance.type, amount: ai.finance.amount,
          category: ai.finance.category, description: ai.finance.description,
          date: ai.finance.date || now.toISOString().slice(0, 10), mode, source: "whatsapp",
        });
        const bal = getBalance(user.id, mode, year, month);
        await wppSend(from, replyFinanceRegistered(f, bal.balance));
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
        createReminder({ userId: user.id, message: ai.reminder.message, phone: from, scheduledAt: ai.reminder.scheduledAt, repeat: ai.reminder.repeat || "none" });
        await wppSend(from, replyReminderSet(ai.reminder.message, ai.reminder.scheduledAt, ai.reminder.repeat));
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
        const amount = ai.finance?.amount || 0;
        const title = ai.goal?.title || messageText;
        const goal = findGoalByTitle(user.id, title, mode);
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
        if (lower.includes("ajuda") || lower === "?") await wppSend(from, replyHelp());
        else if (lower.includes("saldo") || lower.includes("resumo")) {
          const personal = getBalance(user.id, "personal", year, month);
          const business = getBalance(user.id, "business", year, month);
          await wppSend(from, replyBalance(personal, business));
        } else {
          await wppSend(from, replyUnknown());
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
