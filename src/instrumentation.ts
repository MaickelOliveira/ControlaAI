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
    const { acquireCronLock, releaseCronLock } = await import("./lib/cron-lock");
    const lockToken = await acquireCronLock();
    if (!lockToken) return; // outra instância/tick já está processando agora

    try {
      // ── Auto-posta lançamentos pendentes cuja data chegou ──
      try {
        const financesModule = await import("./lib/finances").catch(() => null);
        const dateBrModule = await import("./lib/date-br").catch(() => null);
        if (financesModule && dateBrModule) {
          const posted = await financesModule.autoPostPendingFinances(dateBrModule.todayStrBR());
          if (posted.length > 0) console.log(`[cron] ${posted.length} lançamento(s) pendente(s) postados`);
        }
      } catch (e) {
        console.error("[cron] Erro ao postar pendentes:", e);
      }

      // ── Fecha faturas de cartão de crédito cujo ciclo já passou do period_end ──
      try {
        const accountsModule = await import("./lib/accounts").catch(() => null);
        if (accountsModule) {
          const closed = await accountsModule.closeDueInvoices();
          if (closed.length > 0) console.log(`[cron] ${closed.length} fatura(s) de cartão fechada(s)`);
        }
      } catch (e) {
        console.error("[cron] Erro ao fechar faturas:", e);
      }

      const remindersModule = await import("./lib/reminders").catch(() => null);
      const wppModule = await import("./lib/whatsapp").catch(() => null);
      const usersModuleForReminders = await import("./lib/users").catch(() => null);
      if (!remindersModule || !wppModule) return;

      const { getDueReminders, markReminderSent, markReminderFailed } = remindersModule;
      const { sendText, sendReminderTemplate } = wppModule;
      const due = await getDueReminders();
      if (due.length > 0) console.log(`[cron] ${due.length} lembrete(s) a disparar`);
      for (const r of due) {
        try {
          // Lembrete pra outra pessoa (cliente/funcionário/outro número) usa o
          // template "lembrete_assessor" — deixa claro pro destinatário quem
          // pediu, já que ele pode nunca ter falado com o bot antes. Lembrete
          // "pra mim mesmo" continua no template original.
          let ok: boolean;
          if (r.recipientType !== "self" && usersModuleForReminders) {
            const owner = await usersModuleForReminders.getUserById(r.userId);
            const remetente = owner?.name || "alguém";
            const texto = `🔔 Lembrete de ${remetente}: ${r.message} — Zelo Assessor`;
            ok = await sendReminderTemplate(r.phone, "lembrete_assessor", texto, { remetente, lembrete: r.message });
          } else if (r.mode === "business") {
            const texto = `🔔 Zelo — Lembrete empresarial configurado\n\nSua empresa precisa: ${r.message}\n\nLembrete empresarial agendado no Zelo.`;
            ok = await sendReminderTemplate(r.phone, "lembrete_empresarial", texto, { lembrete: r.message });
          } else {
            const texto = `🔔 Zelo — Lembrete que você configurou\n\nVocê precisa: ${r.message}\n\nLembrete pessoal agendado por você no Zelo.`;
            ok = await sendReminderTemplate(r.phone, "lembrete_pessoal", texto, { lembrete: r.message });
          }
          console.log(`[cron] ${ok ? "✓" : "✗"} id=${r.id}`);
          if (ok) await markReminderSent(r.id, r.repeat);
          else await markReminderFailed(r.id);
        } catch (e) {
          console.error("[cron] Erro ao enviar lembrete:", e);
          await markReminderFailed(r.id);
        }
      }

      // ── Notificações de recorrentes/parcelas às 20h SP ──
      const hourSP = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
      if (hourSP === 20) {
        try {
          const recurringModule = await import("./lib/recurring").catch(() => null);
          const usersModule = await import("./lib/users").catch(() => null);
          const phoneLinksModule = await import("./lib/wpp-phone-links").catch(() => null);
          const pendingModule = await import("./lib/pending-actions").catch(() => null);
          const repliesModule = await import("./lib/bot-replies").catch(() => null);
          const financesModule = await import("./lib/finances").catch(() => null);
          if (!recurringModule || !usersModule || !phoneLinksModule || !pendingModule || !repliesModule || !financesModule) return;

          const { getRecurringDueToday, markNotified } = recurringModule;
          const { getUserById } = usersModule;
          const { getPhonesForUser } = phoneLinksModule;
          const { setPendingAction } = pendingModule;
          const { buildRecurringNotification } = repliesModule;
          const { formatCurrency } = financesModule;

          const dueToday = await getRecurringDueToday();
          if (dueToday.length > 0) console.log(`[cron] ${dueToday.length} recorrente(s) a notificar`);

          for (const rec of dueToday) {
            try {
              const user = await getUserById(rec.userId);
              if (!user) continue;
              const phones = (await getPhonesForUser(user.id)).map(link => link.phone);
              const msg = buildRecurringNotification(rec);
              const dueDateStr = new Date(rec.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
              const params = { descricao: rec.description, valor: formatCurrency(rec.amount), data: dueDateStr };
              for (const phone of phones) {
                const ok = await sendReminderTemplate(phone, "cobranca_recorrente", msg, params);
                if (ok) {
                  await markNotified(rec.id);
                  await setPendingAction(phone, {
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
        const phoneLinksModule = await import("./lib/wpp-phone-links").catch(() => null);
        const pendingModule = await import("./lib/pending-actions").catch(() => null);
        const repliesModule = await import("./lib/bot-replies").catch(() => null);
        if (agendaModule && usersModule && phoneLinksModule && pendingModule && repliesModule) {
          const { getAppointmentsWithEndedMeet, updateAppointment } = agendaModule;
          const { getUserById } = usersModule;
          const { getPhonesForUser } = phoneLinksModule;
          const { setPendingAction } = pendingModule;
          const { replyMeetAtaRequest } = repliesModule;
          const ended = await getAppointmentsWithEndedMeet();
          for (const apt of ended) {
            try {
              const aptUser = await getUserById(apt.userId);
              if (!aptUser) continue;
              const phones = (await getPhonesForUser(aptUser.id)).map(link => link.phone);
              for (const phone of phones) {
                const ok = await sendText(phone, replyMeetAtaRequest(apt.title));
                if (ok) {
                  await updateAppointment(apt.id, apt.userId, { ataNotifiedAt: new Date().toISOString() });
                  await setPendingAction(phone, {
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

      // ── Lembrete de compromissos que começam em até 2h ──
      try {
        const agendaModule = await import("./lib/agenda").catch(() => null);
        const usersModule = await import("./lib/users").catch(() => null);
        const phoneLinksModule = await import("./lib/wpp-phone-links").catch(() => null);
        const repliesModule = await import("./lib/bot-replies").catch(() => null);
        const dateBrModule = await import("./lib/date-br").catch(() => null);
        if (agendaModule && usersModule && phoneLinksModule && repliesModule && dateBrModule) {
          const { getAppointmentsNeedingReminder, updateAppointment } = agendaModule;
          const { getUserById } = usersModule;
          const { getPhonesForUser } = phoneLinksModule;
          const { replyAppointmentReminder } = repliesModule;
          const { formatTimeBR } = dateBrModule;
          const dueSoon = await getAppointmentsNeedingReminder();
          if (dueSoon.length > 0) console.log(`[cron] ${dueSoon.length} compromisso(s) a lembrar`);
          for (const apt of dueSoon) {
            try {
              const aptUser = await getUserById(apt.userId);
              if (!aptUser) continue;
              const phones = (await getPhonesForUser(aptUser.id)).map(link => link.phone);
              const msg = replyAppointmentReminder(apt);
              const params = { compromisso: apt.title, horario: formatTimeBR(apt.startAt) };
              let sentToAny = false;
              for (const phone of phones) {
                const ok = await sendReminderTemplate(phone, "lembrete_compromisso", msg, params);
                if (ok) sentToAny = true;
              }
              if (sentToAny) await updateAppointment(apt.id, apt.userId, { reminderSentAt: new Date().toISOString() });
            } catch (e) {
              console.error("[cron] Erro ao enviar lembrete de compromisso:", e);
            }
          }
        }
      } catch (e) {
        console.error("[cron] Erro no bloco de lembrete de compromissos:", e);
      }
    } catch (e) {
      console.error("[cron] Erro no tick:", e);
    } finally {
      await releaseCronLock(lockToken);
    }
  };

  setTimeout(() => {
    tick();
    setInterval(tick, 60_000);
  }, 15_000);
}
