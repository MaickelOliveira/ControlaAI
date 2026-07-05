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

      // ── Notificações de recorrentes/parcelas às 20h SP ──
      const hourSP = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
      if (hourSP === 20) {
        try {
          const recurringModule = await import("./lib/recurring").catch(() => null);
          const usersModule = await import("./lib/users").catch(() => null);
          const pendingModule = await import("./lib/pending-actions").catch(() => null);
          const repliesModule = await import("./lib/bot-replies").catch(() => null);
          if (!recurringModule || !usersModule || !pendingModule || !repliesModule) return;

          const { getRecurringDueToday, markNotified } = recurringModule;
          const { getUserById, getWppPhones } = usersModule;
          const { setPendingAction } = pendingModule;
          const { buildRecurringNotification } = repliesModule;

          const dueToday = getRecurringDueToday();
          if (dueToday.length > 0) console.log(`[cron] ${dueToday.length} recorrente(s) a notificar`);

          for (const rec of dueToday) {
            try {
              const user = getUserById(rec.userId);
              if (!user) continue;
              const phones = getWppPhones(user);
              const msg = buildRecurringNotification(rec);
              for (const phone of phones) {
                const ok = await sendText(phone, msg);
                if (ok) {
                  markNotified(rec.id);
                  setPendingAction(phone, {
                    type: "recurring_confirmation",
                    userId: rec.userId,
                    recurringId: rec.id,
                    description: rec.description,
                    amount: rec.amount,
                    installmentNumber: rec.recurrenceType === "installment" ? rec.paidInstallments + 1 : undefined,
                    totalInstallments: rec.totalInstallments,
                  });
                }
              }
            } catch (e) {
              console.error("[cron] Erro ao notificar recorrente:", e);
            }
          }
        } catch (e) {
          console.error("[cron] Erro no bloco de recorrentes:", e);
        }
      }
      // ── Verificar reuniões (na Agenda) encerradas que precisam de ata ──
      try {
        const agendaModule = await import("./lib/agenda").catch(() => null);
        const usersModule = await import("./lib/users").catch(() => null);
        const pendingModule = await import("./lib/pending-actions").catch(() => null);
        const repliesModule = await import("./lib/bot-replies").catch(() => null);
        if (agendaModule && usersModule && pendingModule && repliesModule) {
          const { getAppointmentsWithEndedMeet, updateAppointment } = agendaModule;
          const { getUserById, getWppPhones } = usersModule;
          const { setPendingAction } = pendingModule;
          const { replyMeetAtaRequest } = repliesModule;
          const ended = getAppointmentsWithEndedMeet();
          for (const apt of ended) {
            try {
              const aptUser = getUserById(apt.userId);
              if (!aptUser) continue;
              const phones = getWppPhones(aptUser);
              for (const phone of phones) {
                const ok = await sendText(phone, replyMeetAtaRequest(apt.title));
                if (ok) {
                  updateAppointment(apt.id, apt.userId, { ataNotifiedAt: new Date().toISOString() });
                  setPendingAction(phone, {
                    type: "meet_ata",
                    userId: apt.userId,
                    meetId: apt.id,
                    meetTitle: apt.title,
                  });
                }
              }
            } catch (e) {
              console.error("[cron] Erro ao notificar ata:", e);
            }
          }
        }
      } catch (e) {
        console.error("[cron] Erro no bloco de meets:", e);
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
