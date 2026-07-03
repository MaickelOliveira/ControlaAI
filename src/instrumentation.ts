export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  console.log("[cron] Iniciando cron de lembretes (verifica a cada 60s)...");

  const tick = async () => {
    try {
      const { getDueReminders, markReminderSent } = await import("./lib/reminders");
      const { sendText } = await import("./lib/wppconnect");
      const due = getDueReminders();

      if (due.length > 0) {
        console.log(`[cron] ${due.length} lembrete(s) a disparar`);
      }

      for (const r of due) {
        console.log(`[cron] Enviando para ${r.phone}: "${r.message}"`);
        const ok = await sendText(r.phone, `🔔 *Lembrete:* ${r.message}`);
        console.log(`[cron] Envio ${ok ? "OK" : "FALHOU"} — id=${r.id} repeat=${r.repeat}`);
        if (ok) markReminderSent(r.id, r.repeat);
      }
    } catch (e) {
      console.error("[cron] Erro:", e);
    }
  };

  // Aguarda 10s para o servidor inicializar antes do primeiro tick
  setTimeout(() => {
    tick();
    setInterval(tick, 60_000);
  }, 10_000);
}
