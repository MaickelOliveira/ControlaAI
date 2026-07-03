import { NextRequest, NextResponse } from "next/server";
import { getDueReminders, markReminderSent } from "@/lib/reminders";
import { sendText } from "@/lib/wppconnect";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || "controlaai-cron";
  if (secret !== cronSecret) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return runCron();
}

export async function POST() {
  return runCron();
}

async function runCron() {
  try {
    const due = getDueReminders();
    console.log(`[cron/reminders] ${due.length} lembrete(s) a disparar`);
    const results = [];
    for (const r of due) {
      console.log(`[cron/reminders] Enviando para ${r.phone}: "${r.message}"`);
      const ok = await sendText(r.phone, `🔔 *Lembrete:* ${r.message}`);
      console.log(`[cron/reminders] ${ok ? "OK ✓" : "FALHOU ✗"} — id=${r.id}`);
      if (ok) markReminderSent(r.id, r.repeat);
      results.push({ id: r.id, message: r.message, sent: ok });
    }
    return NextResponse.json({ ok: true, fired: results.length, results, now: new Date().toISOString() });
  } catch (e) {
    console.error("[cron/reminders] Erro:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
