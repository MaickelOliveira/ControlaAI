import { NextResponse } from "next/server";
import { getDueReminders, markReminderSent } from "@/lib/reminders";
import { sendText } from "@/lib/wppconnect";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const due = getDueReminders();
    let sent = 0;

    for (const r of due) {
      const ok = await sendText(r.phone, `🔔 *Lembrete:* ${r.message}`);
      if (ok) {
        markReminderSent(r.id, r.repeat);
        sent++;
      }
    }

    return NextResponse.json({ processed: due.length, sent });
  } catch (e) {
    console.error("[cron/reminders]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
