export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  // Captura qualquer erro não tratado para evitar crash do processo
  process.on("uncaughtException", (err) => {
    console.error("[process] uncaughtException:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandledRejection:", reason);
  });

  console.log("[instrumentation] Iniciando cron de lembretes...");

  const tick = async () => {
    try {
      const remindersModule = await import("./lib/reminders").catch(() => null);
      const wppModule = await import("./lib/wppconnect").catch(() => null);
      if (!remindersModule || !wppModule) return;

      const { getDueReminders, markReminderSent } = remindersModule;
      const { sendText } = wppModule;
      const due = getDueReminders();
      if (due.length > 0) console.log(`[cron] ${due.length} lembrete(s) a disparar`);
      for (const r of due) {
        try {
          const ok = await sendText(r.phone, `🔔 *Lembrete:* ${r.message}`);
          console.log(`[cron] ${ok ? "✓" : "✗"} id=${r.id}`);
          if (ok) markReminderSent(r.id, r.repeat);
        } catch (e) {
          console.error("[cron] Erro ao enviar lembrete:", e);
        }
      }
    } catch (e) {
      console.error("[cron] Erro no tick:", e);
    }
  };

  setTimeout(() => {
    tick();
    setInterval(tick, 60_000);
  }, 15_000);
}
