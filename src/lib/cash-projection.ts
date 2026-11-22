import type {Finance, FinanceMode} from "./finances";
import type {RecurringTransaction} from "./recurring";
import {recurrenceName, scheduledDates, similarBenefit} from "./recurring-calendar";

type Period = {from: string; to: string};

export function cashProjection(records: readonly Finance[], schedules: readonly RecurringTransaction[], mode: FinanceMode, period: Period, today: string) {
  const windowStart = period.from < today ? period.from : today;
  let opening = 0, openingEvidence = false, received = 0, spent = 0, income = 0, expense = 0, undated = 0;
  const represented = new Set<string>();
  const incomeLines = new Map<string, number>();
  const possibleRepeats = new Set<string>();
  const datesSeen = new Set<string>();
  let hasEarlierPending = false;

  function add(type: Finance["type"], amount: number, date: string, expected: boolean, label: string) {
    const cents = Math.round(amount * 100);
    if (!Number.isFinite(cents)) throw Error("PROJECTION_AMOUNT_INVALID");
    if (date < period.from) {
      opening += type === "income" ? cents : -cents;
      if (!expected) openingEvidence = true;
    } else if (expected) {
      if (type === "income") {
        income += cents;
        incomeLines.set(label, (incomeLines.get(label) ?? 0) + cents);
      } else expense += cents;
    } else if (type === "income") received += cents;
    else spent += cents;
  }

  for (const row of records) {
    if (row.mode !== mode || row.date > period.to) continue;
    const pending = row.status === "pending";
    if (pending && row.autoPost === false) { undated++; continue; }
    if (pending && row.date < windowStart) { hasEarlierPending = true; continue; }
    if (row.recurringId) represented.add(row.recurringId + "|" + row.date);
    add(row.type, row.amount, row.date, pending || row.date > today, row.description);
  }
  for (const row of schedules) {
    if (row.mode !== mode || row.status !== "active") continue;
    if (row.nextDueDate < windowStart) hasEarlierPending = true;
    for (const date of scheduledDates(row, windowStart, period.to)) {
      if (represented.has(row.id + "|" + date)) continue;
      const key = [similarBenefit(row.description,row.description) ? "benefício alimentação/refeição" : recurrenceName(row.description), row.type, Math.round(row.amount * 100), date].join("|");
      if (datesSeen.has(key)) possibleRepeats.add(row.description);
      datesSeen.add(key);
      add(row.type, row.amount, date, true, row.description);
    }
  }
  return {opening, openingEvidence, received, spent, income, expense, undated, incomeLines, possibleRepeats, hasEarlierPending,
    result: received + income - spent - expense, closing: opening + received + income - spent - expense};
}

export function projectionReply(p: ReturnType<typeof cashProjection>, mode: FinanceMode, period: Period, locale?: string) {
  const es = locale === "es";
  const money = (cents: number) => (cents/100).toLocaleString(es ? "es-419" : "pt-BR", {style:"currency",currency:"BRL"});
  const date = (s: string) => s.split("-").reverse().join("/");
  const space = mode === "business" ? "Empresa" : es ? "Personal" : "Pessoal";
  const lines = [
    `*${es ? "Proyección de saldo" : "Projeção de saldo"} · ${space}*\n${date(period.from)} a ${date(period.to)}`,
    `${es ? "Saldo inicial según los registros" : "Saldo inicial pelos registros"}: ${money(p.opening)}`,
    `${es ? "Ingresos recibidos" : "Receitas recebidas"}: ${money(p.received)}`,
    `${es ? "Ingresos previstos" : "Receitas previstas"}: ${money(p.income)}`,
    ...Array.from(p.incomeLines).slice(0,8).map(([name, cents]) => `  • ${name.replace(/[\n\r*_~]/g," ").slice(0,80)}: ${money(cents)}`),
    `${es ? "Gastos realizados" : "Despesas realizadas"}: ${money(p.spent)}`,
    `${es ? "Gastos previstos" : "Despesas programadas"}: ${money(p.expense)}`,
    `${es ? "Resultado del período" : "Resultado do período"}: ${money(p.result)}`,
    `*${es ? "Saldo final previsto" : "Saldo final projetado"}: ${money(p.closing)}*`,
    es ? "Base: movimientos y compromisos registrados en Zelo." : "Base: lançamentos e compromissos cadastrados na Zelo.",
  ];
  if (!p.openingEvidence) lines.push(es ? "No hay saldo realizado anterior registrado. Si ya tenías dinero, el saldo final cambia por ese valor." : "Sem saldo realizado anterior registrado. Se já havia dinheiro antes, o saldo final muda por esse valor.");
  if (!p.income && !p.received) lines.push(es ? "No encontré ingresos para este período. Puedes consultar tus ingresos recurrentes antes de registrar uno nuevo." : "Não encontrei receitas para esse período. Confira as receitas em Recorrentes antes de cadastrar uma nova.");
  if (p.undated) lines.push(es ? "Hay pendientes sin fecha fuera de la proyección." : "Há pendências sem data fora da projeção.");
  if (p.hasEarlierPending) lines.push(es ? "Hay vencimientos anteriores sin confirmar fuera del saldo inicial. Comprueba si se pagaron o cobraron." : "Há vencimentos anteriores sem baixa fora do saldo inicial. Confira se foram pagos ou recebidos.");
  if (p.possibleRepeats.size) {
    const names = [...p.possibleRepeats].slice(0,5).map(s => s.replace(/[\n\r*_~]/g," ").slice(0,80)).join(", ");
    lines.push((es ? "Total provisional. Revisa posibles repeticiones en Recorrentes: " : "Total provisório. Confira possíveis repetições em Recorrentes: ") + names + ".");
  }
  return lines.join("\n");
}
