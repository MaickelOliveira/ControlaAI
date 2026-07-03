export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  // Cron de lembretes — verifica a cada 60s
  setTimeout(() => {
    const tick = async () => {
      try {
        const { getDueReminders, markReminderSent } = await import("./lib/reminders");
        const { sendText } = await import("./lib/wppconnect");
        const due = getDueReminders();
        for (const r of due) {
          const ok = await sendText(r.phone, `🔔 *Lembrete:* ${r.message}`);
          if (ok) markReminderSent(r.id, r.repeat);
        }
        if (due.length > 0) {
          console.log(`[cron] ${due.length} lembrete(s) disparado(s)`);
        }
      } catch (e) {
        console.error("[cron] Erro lembretes:", e);
      }
    };
    tick();
    setInterval(tick, 60_000);
  }, 5000);
}
