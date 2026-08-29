import { NextRequest, NextResponse } from "next/server";
import { getDueReminders, markReminderSent, markReminderFailed } from "@/lib/reminders";
import { sendReminderTemplate } from "@/lib/whatsapp";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { getUserById } from "@/lib/users";

// Sem CRON_SECRET configurado, o endpoint fica bloqueado — nada de segredo
// padrão previsível, e o POST (que ficava sem checagem nenhuma) agora exige
// o mesmo secret que o GET.
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("x-cron-secret");
  return secret === cronSecret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return runCron();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return runCron();
}

async function runCron() {
  // Mesma trava do tick em-processo (src/instrumentation.ts) — evita que
  // esse endpoint e o tick disparem o mesmo lembrete duas vezes se
  // rodarem no mesmo instante.
  const lockToken = await acquireCronLock();
  if (!lockToken) {
    return NextResponse.json({ ok: true, fired: 0, results: [], skipped: "outra execução já em andamento" });
  }
  try {
    const due = await getDueReminders();
    console.log(`[cron/reminders] ${due.length} lembrete(s) a disparar`);
    const results = [];
    for (const r of due) {
      console.log(`[cron/reminders] Enviando id=${r.id}`);
      let ok: boolean;
      if (r.recipientType !== "self") {
        const owner = await getUserById(r.userId);
        const remetente = owner?.name || "alguém";
        ok = await sendReminderTemplate(r.phone, "lembrete_assessor", `🔔 Lembrete de ${remetente}: ${r.message} — Zelo Assessor`, { remetente, lembrete: r.message });
      } else if (r.mode === "business") {
        const owner = await getUserById(r.userId);
        const nome = owner?.name || "cliente";
        const texto = `🔔 Zelo — Lembrete empresarial configurado\n\nSua empresa precisa: ${r.message}\n\nLembrete empresarial agendado no Zelo.`;
        ok = await sendReminderTemplate(r.phone, "lbt_empresarial", texto, { nome, lembrete: r.message });
      } else {
        const owner = await getUserById(r.userId);
        const nome = owner?.name || "cliente";
        const texto = `🔔 Zelo — Lembrete que você configurou\n\nVocê precisa: ${r.message}\n\nLembrete pessoal agendado por você no Zelo.`;
        ok = await sendReminderTemplate(r.phone, "lbt_pessoal", texto, { nome, lembrete: r.message });
      }
      console.log(`[cron/reminders] ${ok ? "OK ✓" : "FALHOU ✗"} — id=${r.id}`);
      if (ok) await markReminderSent(r.id, r.repeat);
      else await markReminderFailed(r.id);
      results.push({ id: r.id, sent: ok });
    }
    return NextResponse.json({ ok: true, fired: results.length, results, now: new Date().toISOString() });
  } catch (e) {
    console.error("[cron/reminders] Erro:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    await releaseCronLock(lockToken);
  }
}
