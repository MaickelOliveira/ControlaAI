import { NextRequest, NextResponse } from "next/server";
import { getUserByPhone, createUserByPhone, updateUser, isTrialExpired } from "@/lib/users";
import { processMessage, transcribeAudio } from "@/lib/ai-processor";
import { addFinance, getBalance, formatCurrency } from "@/lib/finances";
import { createTask, getPendingTasks, updateTaskStatus, findTaskByNumber, findTaskByTitle } from "@/lib/tasks";
import { createReminder } from "@/lib/reminders";
import { sendText } from "@/lib/wppconnect";
import {
  replyFinanceRegistered, replyBalance, replyTaskCreated, replyTaskList,
  replyTaskUpdated, replyReminderSet, replyModeSwitch, replyHelp,
  replyOnboardingWelcome, replyOnboardingPlan, replyOnboardingDone,
  replyTrialExpired, replyUnknown,
} from "@/lib/bot-replies";

// Estado de onboarding em memória (para MVP)
const onboardingState = new Map<string, { step: "name" | "plan"; name?: string }>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const event = (body.event as string ?? "").toLowerCase();

    // Filtro: só processa mensagens recebidas (não enviadas pelo bot)
    if (event !== "onmessage" && event !== "message" && event !== "onanymessage") {
      return NextResponse.json({ ok: true });
    }

    const from = (body.from as string ?? "").replace("@c.us", "").replace(/\D/g, "");
    const fromMe = body.fromMe as boolean;
    if (!from || fromMe) return NextResponse.json({ ok: true });

    // Extrai conteúdo da mensagem
    let messageText = (body.body as string ?? body.content as string ?? "").trim();

    // Transcreve áudio se necessário
    if ((!messageText || messageText === "") && body.type === "audio") {
      try {
        const audioUrl = body.mediaUrl || body.url;
        if (audioUrl) {
          const audioRes = await fetch(audioUrl);
          const buf = Buffer.from(await audioRes.arrayBuffer());
          const transcript = await transcribeAudio(buf, body.mimetype || "audio/ogg");
          if (transcript) {
            messageText = transcript;
            console.log(`[bot] Transcrição: "${transcript}"`);
          }
        }
      } catch (e) {
        console.error("[bot] Erro transcrição áudio:", e);
      }
    }

    if (!messageText) return NextResponse.json({ ok: true });

    console.log(`[bot] Mensagem de ${from}: "${messageText}"`);

    // ── Onboarding: verifica se usuário existe ──
    const existingState = onboardingState.get(from);
    let user = getUserByPhone(from);

    if (!user && !existingState) {
      // Novo usuário — inicia onboarding
      onboardingState.set(from, { step: "name" });
      await sendText(from, replyOnboardingWelcome());
      return NextResponse.json({ ok: true });
    }

    if (!user && existingState) {
      if (existingState.step === "name") {
        const name = messageText.trim();
        onboardingState.set(from, { step: "plan", name });
        await sendText(from, replyOnboardingPlan(name));
        return NextResponse.json({ ok: true });
      }

      if (existingState.step === "plan") {
        const plan = messageText.trim() === "2" ? "business" : "personal";
        const name = existingState.name ?? "Usuário";
        user = createUserByPhone(from, name, plan);
        onboardingState.delete(from);
        await sendText(from, replyOnboardingDone(name, plan));
        return NextResponse.json({ ok: true });
      }
    }

    if (!user) return NextResponse.json({ ok: true });

    // ── Verifica trial ──
    if (isTrialExpired(user)) {
      await sendText(from, replyTrialExpired());
      return NextResponse.json({ ok: true });
    }

    const mode = user.activeMode;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // ── Processa mensagem com IA ──
    const ai = await processMessage(messageText);
    console.log(`[bot] Intenção detectada: ${ai.intent} (${ai.confidence})`);

    switch (ai.intent) {

      case "finance_register": {
        if (!ai.finance) break;
        const f = addFinance({
          userId: user.id,
          type: ai.finance.type,
          amount: ai.finance.amount,
          category: ai.finance.category,
          description: ai.finance.description,
          date: ai.finance.date || now.toISOString().slice(0, 10),
          mode,
          source: "whatsapp",
        });
        const bal = getBalance(user.id, mode, year, month);
        await sendText(from, replyFinanceRegistered(f, bal.balance));
        break;
      }

      case "finance_query":
      case "balance_query": {
        const personal = getBalance(user.id, "personal", year, month);
        const business = getBalance(user.id, "business", year, month);
        const hasBusiness = (await import("@/lib/finances")).getFinancesByUser(user.id, "business").length > 0;
        await sendText(from, replyBalance(personal, hasBusiness ? business : undefined));
        break;
      }

      case "task_create": {
        if (!ai.task) break;
        const task = createTask({
          userId: user.id,
          title: ai.task.title,
          priority: ai.task.priority || "medium",
          dueDate: ai.task.dueDate,
          status: "pending",
          mode,
        });
        await sendText(from, replyTaskCreated(task));
        break;
      }

      case "task_query": {
        const tasks = getPendingTasks(user.id, mode);
        await sendText(from, replyTaskList(tasks, mode));
        break;
      }

      case "task_update": {
        let taskToUpdate = null;
        if (ai.task?.taskNumber) {
          taskToUpdate = findTaskByNumber(user.id, ai.task.taskNumber, mode);
        } else if (ai.task?.title) {
          taskToUpdate = findTaskByTitle(user.id, ai.task.title, mode);
        }
        // Também tenta "concluir 1", "feito 2" diretamente
        const numMatch = messageText.match(/(\d+)/);
        if (!taskToUpdate && numMatch) {
          taskToUpdate = findTaskByNumber(user.id, parseInt(numMatch[1]), mode);
        }
        if (taskToUpdate) {
          const newStatus = ai.task?.newStatus || "completed";
          const updated = updateTaskStatus(taskToUpdate.id, user.id, newStatus);
          if (updated) await sendText(from, replyTaskUpdated(updated));
        } else {
          await sendText(from, "❓ Não encontrei essa tarefa. Digite *minhas tarefas* para ver a lista.");
        }
        break;
      }

      case "reminder_set": {
        if (!ai.reminder) break;
        createReminder({
          userId: user.id,
          message: ai.reminder.message,
          phone: from,
          scheduledAt: ai.reminder.scheduledAt,
          repeat: ai.reminder.repeat || "none",
        });
        await sendText(from, replyReminderSet(ai.reminder.message, ai.reminder.scheduledAt, ai.reminder.repeat));
        break;
      }

      case "mode_switch": {
        const newMode = ai.mode || (mode === "personal" ? "business" : "personal");
        updateUser(user.id, { activeMode: newMode });
        await sendText(from, replyModeSwitch(newMode));
        break;
      }

      case "help": {
        await sendText(from, replyHelp());
        break;
      }

      default: {
        // Tenta comandos básicos por texto mesmo sem IA
        const lower = messageText.toLowerCase();
        if (lower.includes("ajuda") || lower === "?") {
          await sendText(from, replyHelp());
        } else if (lower.includes("saldo")) {
          const personal = getBalance(user.id, "personal", year, month);
          const business = getBalance(user.id, "business", year, month);
          await sendText(from, replyBalance(personal, business));
        } else {
          await sendText(from, replyUnknown());
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook] Erro geral:", e);
    return NextResponse.json({ ok: true });
  }
}

// Verificação do webhook (GET para WPPConnect configurar)
export async function GET() {
  return NextResponse.json({ status: "ok", service: "ControlaAI Bot" });
}
