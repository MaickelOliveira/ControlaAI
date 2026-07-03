export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  console.log("[instrumentation] Iniciando cron de lembretes...");

  const tick = async () => {
    try {
      const { getDueReminders, markReminderSent } = await import("./lib/reminders");
      const { sendText } = await import("./lib/wppconnect");
      const due = getDueReminders();
      if (due.length > 0) console.log(`[cron] ${due.length} lembrete(s) a disparar`);
      for (const r of due) {
        console.log(`[cron] Enviando para ${r.phone}: "${r.message}" (scheduledAt=${r.scheduledAt})`);
        const ok = await sendText(r.phone, `🔔 *Lembrete:* ${r.message}`);
        console.log(`[cron] ${ok ? "✓ OK" : "✗ FALHOU"} id=${r.id}`);
        if (ok) markReminderSent(r.id, r.repeat);
      }
    } catch (e) {
      console.error("[cron] Erro:", e);
    }
  };

  setTimeout(() => {
    console.log("[instrumentation] Primeiro tick do cron...");
    tick();
    setInterval(tick, 60_000);
  }, 10_000);
}
