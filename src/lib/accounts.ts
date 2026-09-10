import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import type { FinanceMode } from "./finances";

export type AccountType = "bank" | "credit_card";

export type Account = {
  id: string;
  userId: string;
  mode: FinanceMode;
  name: string;
  type: AccountType;
  isDefault: boolean;
  creditLimit?: number; // só type="credit_card"
  closingDay?: number;  // idem, 1-28
  dueDay?: number;      // idem, 1-28
  createdAt: string;
};

export type CardInvoiceStatus = "open" | "closed" | "paid";

export type CardInvoice = {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: CardInvoiceStatus;
  paidAt?: string;
  createdAt: string;
};

type AccountRow = {
  id: string; user_id: string; mode: FinanceMode; name: string; type: AccountType;
  is_default: boolean; credit_limit: number | string | null; closing_day: number | null;
  due_day: number | null; created_at: string;
};
function accountFromRow(r: AccountRow): Account {
  return {
    id: r.id, userId: r.user_id, mode: r.mode, name: r.name, type: r.type, isDefault: r.is_default,
    creditLimit: r.credit_limit != null ? Number(r.credit_limit) : undefined,
    closingDay: r.closing_day ?? undefined, dueDay: r.due_day ?? undefined, createdAt: r.created_at,
  };
}

type InvoiceRow = {
  id: string; account_id: string; period_start: string; period_end: string; due_date: string;
  status: CardInvoiceStatus; paid_at: string | null; created_at: string;
};
function invoiceFromRow(r: InvoiceRow): CardInvoice {
  return {
    id: r.id, accountId: r.account_id, periodStart: r.period_start, periodEnd: r.period_end,
    dueDate: r.due_date, status: r.status, paidAt: r.paid_at ?? undefined, createdAt: r.created_at,
  };
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Contas ──────────────────────────────
export async function getAccountsByUser(userId: string, mode?: FinanceMode): Promise<Account[]> {
  let query = getSupabase().from("accounts").select("*").eq("user_id", userId);
  if (mode) query = query.eq("mode", mode);
  const { data, error } = await query.order("name");
  if (error || !data) return [];
  return (data as AccountRow[]).map(accountFromRow);
}

/** A primeira conta cadastrada num modo vira automaticamente a "coringa"
 *  (is_default) daquele modo — depois disso, só via setDefaultAccount. */
export async function createAccount(data: {
  userId: string; mode: FinanceMode; name: string; type: AccountType;
  creditLimit?: number; closingDay?: number; dueDay?: number; makeDefault?: boolean;
}): Promise<Account> {
  const existing = await getAccountsByUser(data.userId, data.mode);
  const isDefault = data.makeDefault || existing.length === 0;
  if (isDefault) {
    // Só pode ter 1 padrão por modo — tira dos outros antes de gravar o
    // índice único parcial (accounts_user_mode_default_uidx) reforça isso
    // no banco também, mas aqui evita a query falhar por conflito.
    await getSupabase().from("accounts").update({ is_default: false }).eq("user_id", data.userId).eq("mode", data.mode).eq("is_default", true);
  }
  const { data: inserted, error } = await getSupabase().from("accounts").insert({
    id: randomUUID(), user_id: data.userId, mode: data.mode, name: data.name, type: data.type,
    is_default: isDefault, credit_limit: data.creditLimit ?? null,
    closing_day: data.closingDay ?? null, due_day: data.dueDay ?? null,
  }).select("*").single();
  if (error) throw new Error(`[accounts] createAccount falhou: ${error.message}`);
  return accountFromRow(inserted as AccountRow);
}

/** Retorna TODAS as contas cujo nome bate — nunca escolhe a primeira
 *  silenciosamente quando há mais de uma (regra de ouro do projeto, mesma
 *  usada em findGoalsByTitle/findAppointmentsByKeyword). */
export async function findAccountByName(userId: string, mode: FinanceMode, name: string, type?: AccountType): Promise<Account[]> {
  let query = getSupabase().from("accounts").select("*").eq("user_id", userId).eq("mode", mode).ilike("name", `%${name}%`);
  if (type) query = query.eq("type", type);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as AccountRow[]).map(accountFromRow);
}

/** null se o usuário ainda não cadastrou NENHUMA conta nesse modo — não
 *  cria uma "coringa" do nada, só existe depois que a primeira conta real
 *  for cadastrada (createAccount cuida disso). */
export async function getDefaultAccount(userId: string, mode: FinanceMode): Promise<Account | null> {
  const { data } = await getSupabase().from("accounts").select("*").eq("user_id", userId).eq("mode", mode).eq("is_default", true).maybeSingle();
  return data ? accountFromRow(data as AccountRow) : null;
}

export async function setDefaultAccount(userId: string, mode: FinanceMode, accountId: string): Promise<boolean> {
  const { data: target } = await getSupabase().from("accounts").select("id").eq("id", accountId).eq("user_id", userId).eq("mode", mode).maybeSingle();
  if (!target) return false;
  await getSupabase().from("accounts").update({ is_default: false }).eq("user_id", userId).eq("mode", mode).eq("is_default", true);
  const { error } = await getSupabase().from("accounts").update({ is_default: true }).eq("id", accountId);
  return !error;
}

export async function updateAccount(id: string, userId: string, patch: Partial<{ name: string; creditLimit: number; closingDay: number; dueDay: number }>): Promise<Account | null> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.creditLimit !== undefined) row.credit_limit = patch.creditLimit;
  if (patch.closingDay !== undefined) row.closing_day = patch.closingDay;
  if (patch.dueDay !== undefined) row.due_day = patch.dueDay;
  const { data, error } = await getSupabase().from("accounts").update(row).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return accountFromRow(data as AccountRow);
}

export async function deleteAccount(id: string, userId: string): Promise<void> {
  await getSupabase().from("accounts").delete().eq("id", id).eq("user_id", userId);
}

// ── Fatura de cartão ──────────────────────
/** Calcula o ciclo (fechamento/vencimento) que a data cai, dado o dia de
 *  fechamento e vencimento da conta. Usa aritmética de Date (mês
 *  negativo/13 se normaliza sozinho) em vez de montar string manual —
 *  mesmo cuidado já tomado em ai-processor.ts pra calendário relativo.
 *  closing_day/due_day são sempre 1-28, então nunca há problema de "dia
 *  não existe nesse mês". */
function computeInvoicePeriod(closingDay: number, dueDay: number, dateStr: string): { periodStart: string; periodEnd: string; dueDate: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const monthIndex = m - 1; // 0-based, mês da própria data
  const closesThisMonth = d <= closingDay;
  const periodEndMonthIndex = closesThisMonth ? monthIndex : monthIndex + 1;

  const periodEnd = new Date(y, periodEndMonthIndex, closingDay);
  const periodStart = new Date(y, periodEndMonthIndex - 1, closingDay + 1);
  // vencimento depois do fechamento no MESMO mês do fechamento se due_day >
  // closing_day (ex: fecha 5, vence 15); senão, vence no mês seguinte ao
  // fechamento (ex: fecha 25, vence 5 — vencer no mesmo mês seria antes de
  // fechar, o que não faz sentido).
  const dueMonthIndex = dueDay > closingDay ? periodEndMonthIndex : periodEndMonthIndex + 1;
  const dueDate = new Date(y, dueMonthIndex, dueDay);

  return { periodStart: toYMD(periodStart), periodEnd: toYMD(periodEnd), dueDate: toYMD(dueDate) };
}

/** Acha (ou cria) a fatura do ciclo em que `date` cai, pra uma conta
 *  type="credit_card". Não pré-cria faturas futuras — só existe a partir
 *  da primeira despesa lançada naquele ciclo. */
export async function findOrCreateInvoiceForDate(accountId: string, date: string): Promise<CardInvoice> {
  const { data: accountRow, error: accError } = await getSupabase().from("accounts").select("*").eq("id", accountId).maybeSingle();
  if (accError || !accountRow) throw new Error(`[accounts] findOrCreateInvoiceForDate: conta ${accountId} não encontrada`);
  const account = accountFromRow(accountRow as AccountRow);
  if (account.type !== "credit_card" || !account.closingDay || !account.dueDay) {
    throw new Error(`[accounts] findOrCreateInvoiceForDate: conta ${accountId} não é cartão com fechamento/vencimento configurados`);
  }

  const { periodStart, periodEnd, dueDate } = computeInvoicePeriod(account.closingDay, account.dueDay, date);

  const { data: existing } = await getSupabase().from("card_invoices").select("*").eq("account_id", accountId).eq("period_end", periodEnd).maybeSingle();
  if (existing) return invoiceFromRow(existing as InvoiceRow);

  const { data: inserted, error } = await getSupabase().from("card_invoices").insert({
    id: randomUUID(), account_id: accountId, period_start: periodStart, period_end: periodEnd, due_date: dueDate, status: "open",
  }).select("*").single();
  if (error) throw new Error(`[accounts] findOrCreateInvoiceForDate falhou: ${error.message}`);
  return invoiceFromRow(inserted as InvoiceRow);
}

export async function getOpenInvoice(accountId: string): Promise<CardInvoice | null> {
  const { data } = await getSupabase().from("card_invoices").select("*").eq("account_id", accountId).eq("status", "open").order("period_end", { ascending: false }).limit(1).maybeSingle();
  return data ? invoiceFromRow(data as InvoiceRow) : null;
}

/** Fatura mais recente ainda não paga (open ou closed) — usada por
 *  "paguei a fatura do Nubank" quando o usuário quer quitar a que já
 *  fechou (o caso mais comum) sem precisar dizer qual. */
export async function getLatestUnpaidInvoice(accountId: string): Promise<CardInvoice | null> {
  const { data } = await getSupabase().from("card_invoices").select("*").eq("account_id", accountId).in("status", ["open", "closed"]).order("period_end", { ascending: false }).limit(1).maybeSingle();
  return data ? invoiceFromRow(data as InvoiceRow) : null;
}

export async function getInvoicesByAccount(accountId: string): Promise<CardInvoice[]> {
  const { data, error } = await getSupabase().from("card_invoices").select("*").eq("account_id", accountId).order("period_end", { ascending: false });
  if (error || !data) return [];
  return (data as InvoiceRow[]).map(invoiceFromRow);
}

export async function getInvoiceTotal(invoiceId: string): Promise<number> {
  const { data } = await getSupabase().from("finances").select("type, amount").eq("card_invoice_id", invoiceId);
  return (data ?? []).reduce((s: number, f: { type: string; amount: number }) => s + (f.type === "expense" ? Number(f.amount) : -Number(f.amount)), 0);
}

export async function markInvoicePaid(invoiceId: string, userId: string): Promise<CardInvoice | null> {
  const { data: invoice } = await getSupabase().from("card_invoices").select("*, accounts!inner(user_id)").eq("id", invoiceId).maybeSingle();
  if (!invoice || (invoice as unknown as { accounts: { user_id: string } }).accounts.user_id !== userId) return null;
  const { data, error } = await getSupabase().from("card_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoiceId).select("*").maybeSingle();
  if (error || !data) return null;
  return invoiceFromRow(data as InvoiceRow);
}

/** Fecha toda fatura "open" cujo period_end já passou — chamada pelo cron
 *  (instrumentation.ts), varre todos os usuários (mesmo padrão de
 *  getDueReminders/getRecurringDueToday). */
export async function closeDueInvoices(): Promise<CardInvoice[]> {
  const today = toYMD(new Date());
  const { data, error } = await getSupabase().from("card_invoices").update({ status: "closed" }).eq("status", "open").lt("period_end", today).select("*");
  if (error || !data) return [];
  return (data as InvoiceRow[]).map(invoiceFromRow);
}

// ── Resolução de conta pra um lançamento ──────────────
export type ResolvedAccount = { accountId?: string; cardInvoiceId?: string; ambiguous?: Account[] };

/** Garante que todo modo tenha uma carteira manual básica. A criação é
 * idempotente pelo índice único (user_id, mode, lower(name)); isso também
 * atende contas antigas sem exigir que o cliente abra a tela de Contas. */
export async function ensureCashAccount(userId: string, mode: FinanceMode): Promise<Account | null> {
  const existing = await findAccountByName(userId, mode, "Dinheiro", "bank");
  let cash = existing[0] ?? null;
  try {
    if (!cash) cash = await createAccount({ userId, mode, name: "Dinheiro", type: "bank", makeDefault: true });
  } catch {
    // Outra requisição pode ter criado a mesma conta entre o SELECT e INSERT.
    cash = (await findAccountByName(userId, mode, "Dinheiro", "bank"))[0] ?? null;
  }
  if (cash) {
    // Antes da liberação de Contas, os lançamentos não tinham account_id.
    // Eles passam a pertencer a Dinheiro, preservando totais e permitindo
    // consultar imediatamente o histórico dessa conta.
    await getSupabase().from("finances").update({ account_id: cash.id })
      .eq("user_id", userId).eq("mode", mode).is("account_id", null);
  }
  return cash;
}

/** Contas disponíveis na versão atual. Cartões antigos permanecem no banco
 * para preservar o histórico, mas não são oferecidos para novos lançamentos. */
export async function getManualAccountsByUser(userId: string, mode: FinanceMode): Promise<Account[]> {
  await ensureCashAccount(userId, mode);
  return (await getAccountsByUser(userId, mode)).filter(account => account.type === "bank");
}

/** Chamada antes de addFinance: resolve um nome explícito; com uma conta usa
 * automaticamente, e com várias devolve todas para o handler perguntar. */
export async function resolveAccountForFinance(userId: string, mode: FinanceMode, accountHint?: string): Promise<ResolvedAccount> {
  let account: Account | null = null;

  const accounts = await getManualAccountsByUser(userId, mode);

  if (accountHint) {
    const lowerHint = accountHint.trim().toLocaleLowerCase();
    const matches = accounts.filter(candidate => {
      const lowerName = candidate.name.toLocaleLowerCase();
      return lowerName.includes(lowerHint) || lowerHint.includes(lowerName);
    });
    if (matches.length === 1) account = matches[0];
    else if (matches.length > 1) return { ambiguous: matches };
    else return { ambiguous: accounts };
  }

  // Com uma única conta a escolha é automática. Com duas ou mais, nunca
  // adivinha nem usa silenciosamente a padrão: pergunta ao cliente.
  if (!account && accounts.length === 1) {
    account = accounts[0];
    if (!account.isDefault) await setDefaultAccount(userId, mode, account.id);
  }
  if (!account && accounts.length > 1) return { ambiguous: accounts };
  if (!account) return {};
  return { accountId: account.id };
}
