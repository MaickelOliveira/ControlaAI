export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const {companyNoticeDescription,companyAppointmentPhones}=await import("./lib/company-notices");
  let runJob:<T>(callback:()=>Promise<T>)=>Promise<T>=callback=>callback();
  if(process.env.MULTI_COMPANY_ENABLED==="true"){
    const [{configureCompanyDatabaseScope},{resolveCompanyContext,runWithTrustedCompanyJob}]=await Promise.all([import("./lib/supabase"),import("./lib/company-context")]);
    configureCompanyDatabaseScope(resolveCompanyContext);
    runJob=runWithTrustedCompanyJob;
  }
  const {startGoogleEventWorker}=await import("./lib/google-event-worker");
  startGoogleEventWorker();
  if(process.env.OPEN_FINANCE_ENABLED==="true"&&process.env.OPEN_FINANCE_PREVIEW_ONLY!=="true"){
    const {startOpenFinanceWorker}=await import("./lib/open-finance-worker");
    await runJob(async()=>startOpenFinanceWorker());
  }

  // Avisos ao cliente continuam verificados em TODO tick de um minuto.
  // Somente manutencoes internas baseadas em data (sem horario exato) sao
  // espacadas: rodar essas duas varreduras vazias a cada minuto gerava mais
  // de 2.800 requisicoes REST por dia sem melhorar a pontualidade dos avisos.
  const MAINTENANCE_EVERY_TICKS = 15;
  let acquiredTickCount = 0;

  // Captura qualquer erro não tratado para evitar crash do processo
  process.on("uncaughtException", () => {
    console.error("[process] uncaughtException:");
  });
  process.on("unhandledRejection", () => {
    console.error("[process] unhandledRejection:");
  });

  console.log("[instrumentation] Iniciando cron de lembretes...");

  const tick = async () => {
    const { acquireCronLock, releaseCronLock } = await import("./lib/cron-lock");
    const lockToken = await acquireCronLock();
    if (!lockToken) return; // outra instância/tick já está processando agora
    const runDateMaintenance = acquiredTickCount % MAINTENANCE_EVERY_TICKS === 0;
    acquiredTickCount += 1;

    try {
      if(process.env.OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED==="true"){
        try { const {runCreditPixQuestions}=await import("./lib/credit-pix-whatsapp");await runCreditPixQuestions(); }
        catch { console.error("[cron] Conferência bancária adiada"); }
      }
      // ── Auto-posta lançamentos pendentes cuja data chegou ──
      if (runDateMaintenance) {
        try {
          const financesModule = await import("./lib/finances").catch(() => null);
          const dateBrModule = await import("./lib/date-br").catch(() => null);
          if (financesModule && dateBrModule) {
            const posted = await financesModule.autoPostPendingFinances(dateBrModule.todayStrBR());
            if (posted.length > 0) console.log(`[cron] ${posted.length} lançamento(s) pendente(s) postados`);
          }
        } catch  {
          console.error("[cron] Erro ao postar pendentes:");
        }
      }

      // ── Fecha faturas de cartão de crédito cujo ciclo já passou do period_end ──
      if (runDateMaintenance) {
        try {
          const accountsModule = await import("./lib/accounts").catch(() => null);
          if (accountsModule) {
            const closed = await accountsModule.closeDueInvoices();
            if (closed.length > 0) console.log(`[cron] ${closed.length} fatura(s) de cartão fechada(s)`);
          }
        } catch  {
          console.error("[cron] Erro ao fechar faturas:");
        }
      }

      const remindersModule = await import("./lib/reminders").catch(() => null);
      const wppModule = await import("./lib/whatsapp").catch(() => null);
      const usersModuleForReminders = await import("./lib/users").catch(() => null);
      if (!remindersModule || !wppModule) return;

      const { getDueReminders, markReminderSent, markReminderFailed, markReminderSkippedForInactiveUser } = remindersModule;
      const { sendReminderTemplate, buildReminderTemplateDispatch } = wppModule;
      const due = await getDueReminders();
      if (due.length > 0) console.log(`[cron] ${due.length} lembrete(s) a disparar`);
      for (const r of due) {
        try {
          // Lembrete pra outra pessoa (cliente/funcionário/outro número) usa o
          // template "lembrete_assessor" — deixa claro pro destinatário quem
          // pediu, já que ele pode nunca ter falado com o bot antes. Lembrete
          // "pra mim mesmo" continua no template original.
          const owner = usersModuleForReminders ? await usersModuleForReminders.getUserById(r.userId) : null;
          if (!owner || !usersModuleForReminders?.hasAccess(owner)) {
            await markReminderSkippedForInactiveUser(r.id, r.repeat);
            console.log(`[cron] ignorado — conta sem acesso ativo — id=${r.id}`);
            continue;
          }
          const locale = owner.locale;
          const message=await companyNoticeDescription(r.userId,r.companyId,r.message);if(message===null)continue;
          const dispatch = buildReminderTemplateDispatch({
            message,
            recipientType: r.recipientType,
            mode: r.mode,
            ownerName: owner.name,
            locale,
          });
          const ok = await sendReminderTemplate(
            r.phone,
            dispatch.templateName,
            dispatch.renderedText,
            dispatch.params,
            locale,
          );
          console.log(`[cron] ${ok ? "✓" : "✗"} id=${r.id}`);
          if (ok) await markReminderSent(r.id, r.repeat);
          else await markReminderFailed(r.id);
        } catch  {
          console.error("[cron] Erro ao enviar lembrete:");
          await markReminderFailed(r.id);
        }
      }

      // ── Notificações de recorrentes/parcelas às 9h SP ──
      const hourSP = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
      if (hourSP === 9) {
        try { const {runBankDueNotices}=await import("./lib/open-finance-notices");await runBankDueNotices(); }
        catch { console.error("[cron] Avisos bancários temporariamente indisponíveis"); }
        try {
          const recurringModule = await import("./lib/recurring").catch(() => null);
          const usersModule = await import("./lib/users").catch(() => null);
          const phoneLinksModule = await import("./lib/wpp-phone-links").catch(() => null);
          const pendingModule = await import("./lib/pending-actions").catch(() => null);
          const repliesModule = await import("./lib/bot-replies").catch(() => null);
          const financesModule = await import("./lib/finances").catch(() => null);
          if (!recurringModule || !usersModule || !phoneLinksModule || !pendingModule || !repliesModule || !financesModule) return;

          const { getRecurringDueToday, getRecurringById, markNotified } = recurringModule;
          const { getUserById } = usersModule;
          const { getPhonesForUser } = phoneLinksModule;
          const { setPendingAction } = pendingModule;
          const { buildRecurringNotification } = repliesModule;
          const { formatCurrency } = financesModule;

          const dueToday = await getRecurringDueToday();
          if (dueToday.length > 0) console.log(`[cron] ${dueToday.length} recorrente(s) a notificar`);

          for (const queuedRec of dueToday) {
            try {
              // A cliente pode confirmar pelo WhatsApp enquanto o cron está
              // percorrendo a fila. Revalida antes do envio para não usar um
              // registro que acabou de avançar para o próximo vencimento.
              const rec = await getRecurringById(queuedRec.id, queuedRec.userId);
              if (!rec
                || rec.status !== "active"
                || rec.nextDueDate !== queuedRec.nextDueDate
                || rec.paidInstallments !== queuedRec.paidInstallments) continue;
              const user = await getUserById(rec.userId);
              if (!user || !usersModule.hasAccess(user)) continue;
              const phones = (await getPhonesForUser(user.id)).filter(link=>link.access===rec.mode||link.access==="both").map(link=>link.phone);
              const description=await companyNoticeDescription(rec.userId,rec.companyId,rec.description);if(description===null)continue;
              const msg = buildRecurringNotification({...rec,description}, user.locale);
              const dueDateStr = new Date(rec.nextDueDate + "T12:00:00").toLocaleDateString("pt-BR");
              const params = { descricao: description, valor: formatCurrency(rec.amount), data: dueDateStr };
              for (const phone of phones) {
                const freshUser=await getUserById(rec.userId);
                const access=await phoneLinksModule.getPhoneAccess(rec.userId,phone);
                if(!freshUser||!usersModule.hasAccess(freshUser)||(access!==rec.mode&&access!=="both"))continue;
                const ok = await sendReminderTemplate(phone, "cbr_recorrente", msg, params, freshUser.locale,{privateFinancial:true});
                if (ok) {
                  await markNotified(rec.id);
                  await setPendingAction(phone, {
                    type: "recurring_confirmation",
                    userId: rec.userId,
                    recurringId: rec.id,
                    companyId: rec.companyId,
                    dueDate: rec.nextDueDate,
                    description: rec.description,
                    amount: rec.amount,
                    installmentNumber: rec.recurrenceType === "installment" ? rec.paidInstallments + 1 : undefined,
                    totalInstallments: rec.totalInstallments,
                  });
                }
              }
            } catch  {
              console.error("[cron] Erro ao notificar recorrente:");
            }
          }
        } catch  {
          console.error("[cron] Erro no bloco de recorrentes:");
        }
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
              if (!aptUser || !usersModule.hasAccess(aptUser)) continue;
              const phones = companyAppointmentPhones(apt,await getPhonesForUser(aptUser.id));
              const title = await companyNoticeDescription(apt.userId,apt.companyId,apt.title);if(title===null)continue;
              const msg = replyAppointmentReminder({...apt,title}, "2 horas", aptUser.locale);
              const params = { compromisso: title, horario: formatTimeBR(apt.startAt) };
              let sentToAny = false;
              for (const phone of phones) {
                const ok = await sendReminderTemplate(phone, "lembrete_compromisso", msg, params, aptUser.locale);
                if (ok) sentToAny = true;
              }
              if (sentToAny) await updateAppointment(apt.id, apt.userId, { reminderSentAt: new Date().toISOString() });
            } catch  {
              console.error("[cron] Erro ao enviar lembrete de compromisso:");
            }
          }
        }
      } catch  {
        console.error("[cron] Erro no bloco de lembrete de compromissos:");
      }

      // ── Lembrete de compromissos que começam em até 15min — independente
      // do de 2h acima (coluna própria: reminder_15min_sent_at), então os
      // dois disparam separadamente pro mesmo compromisso. Usa um template
      // WABA dedicado ("lembrete_compromisso15") em vez de reaproveitar
      // "lembrete_compromisso" — o texto de um template aprovado pela Meta é
      // fixo, então usar o mesmo template continuaria dizendo "daqui a 2
      // horas" mesmo faltando só 15min. ──
      try {
        const agendaModule = await import("./lib/agenda").catch(() => null);
        const usersModule = await import("./lib/users").catch(() => null);
        const phoneLinksModule = await import("./lib/wpp-phone-links").catch(() => null);
        const repliesModule = await import("./lib/bot-replies").catch(() => null);
        const dateBrModule = await import("./lib/date-br").catch(() => null);
        if (agendaModule && usersModule && phoneLinksModule && repliesModule && dateBrModule) {
          const { getAppointmentsNeeding15MinReminder, updateAppointment } = agendaModule;
          const { getUserById } = usersModule;
          const { getPhonesForUser } = phoneLinksModule;
          const { replyAppointmentReminder } = repliesModule;
          const { formatTimeBR } = dateBrModule;
          const dueSoon15 = await getAppointmentsNeeding15MinReminder();
          if (dueSoon15.length > 0) console.log(`[cron] ${dueSoon15.length} compromisso(s) a lembrar (15min)`);
          for (const apt of dueSoon15) {
            try {
              const aptUser = await getUserById(apt.userId);
              if (!aptUser || !usersModule.hasAccess(aptUser)) continue;
              const phones = companyAppointmentPhones(apt,await getPhonesForUser(aptUser.id));
              const title = await companyNoticeDescription(apt.userId,apt.companyId,apt.title);if(title===null)continue;
              const msg = replyAppointmentReminder({...apt,title}, "15 minutos", aptUser.locale);
              const params = { compromisso: title, horario: formatTimeBR(apt.startAt) };
              let sentToAny = false;
              for (const phone of phones) {
                const ok = await sendReminderTemplate(phone, "lembrete_compromisso15", msg, params, aptUser.locale);
                if (ok) sentToAny = true;
              }
              if (sentToAny) await updateAppointment(apt.id, apt.userId, { reminder15MinSentAt: new Date().toISOString() });
            } catch  {
              console.error("[cron] Erro ao enviar lembrete de compromisso (15min):");
            }
          }
        }
      } catch  {
        console.error("[cron] Erro no bloco de lembrete de compromissos (15min):");
      }
    } catch  {
      console.error("[cron] Erro no tick:");
    } finally {
      await releaseCronLock(lockToken);
    }
  };

  setTimeout(() => {
    void runJob(tick);
    setInterval(()=>void runJob(tick), 60_000);
  }, 15_000);
}
