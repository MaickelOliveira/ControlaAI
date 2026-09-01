import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type FinanceType = "income" | "expense";
export type FinanceMode = "personal" | "business";
export type FinanceSource = "whatsapp" | "web";
export type FinanceStatus = "posted" | "pending";

export const CATEGORIES_EXPENSE = [
  "Alimentação", "Transporte", "Moradia", "Saúde", "Educação",
  "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos",
  "Funcionários", "Marketing", "Fornecedores", "Outros",
];
export const CATEGORIES_INCOME = [
  "Salário", "Freelance", "Vendas", "Investimentos", "Aluguel",
  "Serviços", "Reembolso", "Outros",
];

// Traduções apenas de EXIBIÇÃO das categorias padrão (mesma ordem/índice de
// CATEGORIES_EXPENSE/CATEGORIES_INCOME acima) — o valor gravado em
// Finance.category continua sempre em português (é o que a IA classifica e o
// que o dashboard usa pra agrupar/filtrar); só o texto mostrado ao usuário
// es/pt-PT muda. Categoria customizada (fora dessas listas) não tem como
// traduzir — mantém como o usuário cadastrou.
const CATEGORIES_EXPENSE_ES = [
  "Alimentación", "Transporte", "Vivienda", "Salud", "Educación",
  "Ocio", "Ropa", "Tecnología", "Servicios", "Impuestos",
  "Empleados", "Marketing", "Proveedores", "Otros",
];
const CATEGORIES_EXPENSE_PTPT = [
  "Alimentação", "Transporte", "Habitação", "Saúde", "Educação",
  "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos",
  "Funcionários", "Marketing", "Fornecedores", "Outros",
];
const CATEGORIES_INCOME_ES = [
  "Salario", "Freelance", "Ventas", "Inversiones", "Alquiler",
  "Servicios", "Reembolso", "Otros",
];
const CATEGORIES_INCOME_PTPT = [
  "Salário", "Freelance", "Vendas", "Investimentos", "Renda",
  "Serviços", "Reembolso", "Outros",
];

export function translateCategory(category: string, type: FinanceType, locale?: string): string {
  if (locale !== "es" && locale !== "pt-PT") return category;
  const source = type === "expense" ? CATEGORIES_EXPENSE : CATEGORIES_INCOME;
  const idx = source.indexOf(category);
  if (idx === -1) return category;
  const target = locale === "es"
    ? (type === "expense" ? CATEGORIES_EXPENSE_ES : CATEGORIES_INCOME_ES)
    : (type === "expense" ? CATEGORIES_EXPENSE_PTPT : CATEGORIES_INCOME_PTPT);
  return target[idx] ?? category;
}

export type Finance = {
  id: string;
  userId: string;
  type: FinanceType;
  amount: number;
  category: string;
  description: string;
  date: string;
  mode: FinanceMode;
  source: FinanceSource;
  status?: FinanceStatus; // undefined = posted (retrocompatível)
  // Só importa quando status é "pending". true (padrão) = lançamento agendado
  // com data futura conhecida, posta sozinho quando a data chegar. false =
  // pendente SEM data conhecida (ex: "a receber" sem previsão) — nunca é
  // postado automaticamente, só via confirmação manual (finance_confirm_pending).
  autoPost?: boolean;
  registeredBy?: string; // número de WhatsApp de quem registrou (para contas com vários números vinculados)
  accountId?: string; // conta bancária/cartão associada (src/lib/accounts.ts) — ausente em lançamentos antigos ou quem não cadastrou conta
  cardInvoiceId?: string; // só quando accountId aponta pra um cartão — a fatura do ciclo em que a despesa caiu
  createdAt: string;
};

// Entrada está "postada" (contabilizada) se status for "posted" ou undefined (registros antigos)
export function isPostedFinance(f: Finance): boolean {
  return !f.status || f.status === "posted";
}

type Row = {
  id: string; user_id: string; type: FinanceType; amount: number; category: string;
  description: string; date: string; mode: FinanceMode; source: FinanceSource;
  pending: boolean; auto_post: boolean; registered_by: string | null; created_at: string;
  account_id: string | null; card_invoice_id: string | null;
};

function fromRow(r: Row): Finance {
  return {
    id: r.id, userId: r.user_id, type: r.type, amount: Number(r.amount), category: r.category,
    description: r.description, date: r.date, mode: r.mode, source: r.source,
    status: r.pending ? "pending" : "posted", autoPost: r.auto_post, registeredBy: r.registered_by ?? undefined, createdAt: r.created_at,
    accountId: r.account_id ?? undefined, cardInvoiceId: r.card_invoice_id ?? undefined,
  };
}

// Todas as funções abaixo já filtravam por userId/mode/registeredBy em
// memória depois de carregar o array inteiro do JSON — mantém exatamente
// a mesma lógica de filtro/agregação em JS (evita reimplementar regra de
// negócio em SQL e arriscar mudar comportamento sutil), só troca de onde
// os dados vêm. Filtra por user_id direto na query quando possível, por
// eficiência, já que esse filtro está presente em quase toda chamada.
async function load(userId?: string, filters: { mode?: FinanceMode; registeredBy?: string; from?: string; to?: string } = {}): Promise<Finance[]> {
  let query = getSupabase().from("finances").select("*");
  if (userId) query = query.eq("user_id", userId);
  if (filters.mode) query = query.eq("mode", filters.mode);
  if (filters.registeredBy) query = query.eq("registered_by", filters.registeredBy);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);
  const { data, error } = await query;
  if (error) { console.error("[finances] load erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function addFinance(data: Omit<Finance, "id" | "createdAt">): Promise<Finance> {
  const row = {
    id: randomUUID(), user_id: data.userId, type: data.type, amount: data.amount,
    category: data.category, description: data.description, date: data.date,
    mode: data.mode, source: data.source, pending: data.status === "pending",
    auto_post: data.autoPost !== false,
    registered_by: data.registeredBy,
    account_id: data.accountId ?? null, card_invoice_id: data.cardInvoiceId ?? null,
  };
  const { data: inserted, error } = await getSupabase().from("finances").insert(row).select("*").single();
  if (error) throw new Error(`[finances] addFinance falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getFinancesByUser(userId: string, mode?: FinanceMode, registeredBy?: string): Promise<Finance[]> {
  return load(userId, { mode, registeredBy });
}

/** Filtra por intervalo de datas (YYYY-MM-DD, inclusive nas duas pontas) em
 *  vez do ano/mês fixo de getBalance — usado pelos filtros de período
 *  customizados em Finanças/Dashboard. Sem from/to, retorna tudo (mesmo
 *  comportamento de getFinancesByUser). */
export async function getFinancesInRange(userId: string, mode?: FinanceMode, from?: string, to?: string): Promise<Finance[]> {
  return load(userId, { mode, from, to });
}

export async function getBalance(userId: string, mode: FinanceMode, year?: number, month?: number, registeredBy?: string): Promise<{
  income: number;
  expense: number;
  balance: number;
}> {
  let items = (await getFinancesByUser(userId, mode, registeredBy)).filter(isPostedFinance);
  if (year !== undefined && month !== undefined) {
    items = items.filter(f => {
      const d = new Date(f.date + "T12:00:00");
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }
  const income = items.filter(f => f.type === "income" && !isNaN(f.amount)).reduce((s, f) => s + f.amount, 0);
  const expense = items.filter(f => f.type === "expense" && !isNaN(f.amount)).reduce((s, f) => s + f.amount, 0);
  return { income, expense, balance: income - expense };
}

/** Equivalente a getBalance, mas por intervalo de datas em vez de ano/mês fixo
 *  — usado quando a IA identifica um período relativo ("mês passado", "semana
 *  passada") em vez do mês atual. */
export async function getBalanceInRange(userId: string, mode: FinanceMode, from?: string, to?: string, registeredBy?: string): Promise<{
  income: number;
  expense: number;
  balance: number;
}> {
  const items = (await getFinancesInRange(userId, mode, from, to))
    .filter(isPostedFinance)
    .filter(f => !registeredBy || f.registeredBy === registeredBy);
  const income = items.filter(f => f.type === "income" && !isNaN(f.amount)).reduce((s, f) => s + f.amount, 0);
  const expense = items.filter(f => f.type === "expense" && !isNaN(f.amount)).reduce((s, f) => s + f.amount, 0);
  return { income, expense, balance: income - expense };
}

/** Soma os lançamentos de uma categoria específica dentro de um intervalo de
 *  datas — usado em perguntas como "quanto gastei com comida mês passado". */
export async function getCategoryTotal(userId: string, mode: FinanceMode, type: FinanceType, category: string, from?: string, to?: string, registeredBy?: string): Promise<number> {
  const lower = category.toLowerCase();
  return (await getFinancesInRange(userId, mode, from, to))
    .filter(f => isPostedFinance(f) && f.type === type && f.category.toLowerCase() === lower && (!registeredBy || f.registeredBy === registeredBy))
    .reduce((s, f) => s + f.amount, 0);
}

/** Apelidos/abreviações comuns pra apps de delivery de comida — a descrição
 *  de um lançamento pode vir tanto do usuário digitando o nome do app quanto
 *  de um extrato importado, que costuma abreviar (ex: "IFD*IFOOD" no cartão).
 *  Ao buscar por um desses termos, expande pra todas as variantes conhecidas
 *  em vez de confiar só na substring literal que a IA mandou. */
const MERCHANT_ALIASES: Record<string, string[]> = {
  ifood: ["ifood", "ifd", "i food"],
  aiqfome: ["aiqfome", "aiq fome", "ai que fome", "aiquefome"],
  "99food": ["99food", "99 food", "99app", "app 99"],
  rappi: ["rappi"],
  ubereats: ["uber eats", "ubereats"],
};

/** Expande um termo de busca digitado pelo usuário pras variantes conhecidas
 *  do mesmo comerciante (ex: "ifood" → também busca "ifd"), pra não perder
 *  lançamentos cuja descrição ficou abreviada. */
export function expandMerchantAliases(term: string): string[] {
  const lower = term.trim().toLowerCase();
  for (const variants of Object.values(MERCHANT_ALIASES)) {
    if (variants.some(v => lower === v || lower.includes(v) || v.includes(lower))) return variants;
  }
  return [lower];
}

/** Soma os lançamentos cuja descrição bate com algum dos termos (busca OR,
 *  case-insensitive) dentro de um intervalo de datas — usado em perguntas
 *  sobre um comerciante/app específico ("quanto gastei com ifood"). */
export async function getKeywordTotal(userId: string, mode: FinanceMode, type: FinanceType, terms: string[], from?: string, to?: string, registeredBy?: string): Promise<number> {
  return (await getFinancesInRange(userId, mode, from, to))
    .filter(f => isPostedFinance(f) && f.type === type && (!registeredBy || f.registeredBy === registeredBy))
    .filter(f => terms.some(t => f.description.toLowerCase().includes(t)))
    .reduce((s, f) => s + f.amount, 0);
}

/** Lançamentos crus de um intervalo de datas, mais recente primeiro — usado
 *  por finance_detail quando o período pedido não é o mês atual. */
export async function getTransactionsInRange(userId: string, mode: FinanceMode, from?: string, to?: string): Promise<Finance[]> {
  return (await getFinancesInRange(userId, mode, from, to))
    .filter(f => isPostedFinance(f) && /^\d{4}-\d{2}-\d{2}$/.test(f.date ?? ""))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getByCategory(userId: string, mode: FinanceMode, type: FinanceType, year?: number, month?: number, registeredBy?: string): Promise<Record<string, number>> {
  let items = (await getFinancesByUser(userId, mode, registeredBy)).filter(f => f.type === type && isPostedFinance(f));
  if (year && month) {
    items = items.filter(f => {
      const d = new Date(f.date + "T12:00:00");
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }
  return items.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + f.amount;
    return acc;
  }, {} as Record<string, number>);
}

/** Equivalente a getByCategory, mas por intervalo de datas — usado por
 *  finance_analysis quando o período pedido não é o mês atual. */
export async function getByCategoryInRange(userId: string, mode: FinanceMode, type: FinanceType, from?: string, to?: string, registeredBy?: string): Promise<Record<string, number>> {
  const items = (await getFinancesInRange(userId, mode, from, to))
    .filter(f => f.type === type && isPostedFinance(f) && (!registeredBy || f.registeredBy === registeredBy));
  return items.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + f.amount;
    return acc;
  }, {} as Record<string, number>);
}

export async function getDailyTotals(userId: string, mode: FinanceMode, days = 30): Promise<Array<{ date: string; income: number; expense: number }>> {
  const items = (await getFinancesByUser(userId, mode)).filter(isPostedFinance);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const map = new Map<string, { income: number; expense: number }>();
  items.filter(f => new Date(f.date) >= cutoff).forEach(f => {
    const key = f.date.slice(0, 10);
    const cur = map.get(key) ?? { income: 0, expense: 0 };
    if (f.type === "income") cur.income += f.amount;
    else cur.expense += f.amount;
    map.set(key, cur);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

export async function deleteFinance(id: string, userId: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("finances").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  return !error && !!count && count > 0;
}

/** Conta quantos lançamentos seriam afetados por "apaga todo o histórico"
 *  ANTES de executar — usado só pra montar a mensagem de confirmação, nunca
 *  pra decidir se apaga (a contagem real é recontada na hora de apagar de
 *  verdade, ver deleteAllFinances). */
export async function countFinances(userId: string, mode: FinanceMode | "both"): Promise<number> {
  let query = getSupabase().from("finances").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (mode !== "both") query = query.eq("mode", mode);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/** Apaga TODOS os lançamentos do usuário (num modo, ou nos dois) — ação
 *  irreversível, só deve ser chamada depois de confirmação explícita e
 *  forte do usuário (ver "confirm_clear_history" em message-handler.ts).
 *  Retorna quantos foram apagados de fato. */
export async function deleteAllFinances(userId: string, mode: FinanceMode | "both"): Promise<number> {
  let query = getSupabase().from("finances").delete({ count: "exact" }).eq("user_id", userId);
  if (mode !== "both") query = query.eq("mode", mode);
  const { error, count } = await query;
  if (error) { console.error("[finances] deleteAllFinances falhou:", error.message); return 0; }
  return count ?? 0;
}

export async function updateFinance(id: string, userId: string, patch: Partial<Pick<Finance, "amount" | "category" | "description" | "date" | "status" | "autoPost" | "type">>): Promise<Finance | null> {
  const rowPatch: Record<string, unknown> = {};
  if (patch.amount !== undefined) rowPatch.amount = patch.amount;
  if (patch.category !== undefined) rowPatch.category = patch.category;
  if (patch.description !== undefined) rowPatch.description = patch.description;
  if (patch.date !== undefined) rowPatch.date = patch.date;
  if (patch.status !== undefined) rowPatch.pending = patch.status === "pending";
  if (patch.autoPost !== undefined) rowPatch.auto_post = patch.autoPost;
  if (patch.type !== undefined) rowPatch.type = patch.type;
  const { data, error } = await getSupabase().from("finances").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

// Lançamentos crus (sem agregação) dos últimos N dias, mais recente primeiro —
// usado para deixar o usuário escolher qual excluir quando não deu palavra-chave
// (ou ela não achou nada), em vez de um beco sem saída.
export async function getFinancesLastDays(userId: string, mode: FinanceMode | null, days = 5): Promise<Finance[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return (await load(userId))
    .filter(f => mode === null || f.mode === mode)
    .filter(f => new Date(f.date + "T12:00:00") >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Verifica se já existe uma despesa com o mesmo valor (tolerância de 1 centavo) e data
 *  próxima (±3 dias) — usado ao importar fatura de cartão para não duplicar um lançamento
 *  que o usuário já tenha registrado manualmente (por foto/texto) quando a compra aconteceu. */
export async function isLikelyDuplicateExpense(userId: string, mode: FinanceMode, amount: number, date: string): Promise<boolean> {
  const target = new Date(date + "T12:00:00").getTime();
  const THREE_DAYS_MS = 3 * 86_400_000;
  return (await load(userId)).some(f =>
    f.mode === mode &&
    f.type === "expense" &&
    Math.abs(f.amount - amount) < 0.01 &&
    Math.abs(new Date(f.date + "T12:00:00").getTime() - target) <= THREE_DAYS_MS
  );
}

export async function findFinanceByDescription(userId: string, mode: FinanceMode | null, keyword: string, limit = 5): Promise<Finance[]> {
  const lower = keyword.toLowerCase();
  return (await load(userId))
    .filter(f => (mode === null || f.mode === mode) && (
      f.description.toLowerCase().includes(lower) ||
      f.category.toLowerCase().includes(lower)
    ))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getRecentTransactions(userId: string, mode: FinanceMode, limit = 10): Promise<Finance[]> {
  return (await getFinancesByUser(userId, mode))
    .filter(isPostedFinance)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getMonthlyTransactions(userId: string, mode: FinanceMode, year: number, month: number): Promise<Finance[]> {
  return (await getFinancesByUser(userId, mode))
    .filter(f => isPostedFinance(f) && /^\d{4}-\d{2}-\d{2}$/.test(f.date ?? ""))
    .filter(f => {
      const d = new Date(f.date + "T12:00:00");
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Retorna lançamentos pendentes de um usuário ordenados por data
export async function getPendingFinances(userId: string, mode?: FinanceMode): Promise<Finance[]> {
  return (await load(userId))
    .filter(f => f.status === "pending" && (!mode || f.mode === mode))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Posta automaticamente os lançamentos pendentes cuja data já chegou
// Retorna os lançamentos que foram postados
export async function autoPostPendingFinances(todayStr: string): Promise<Finance[]> {
  const { data, error } = await getSupabase()
    .from("finances")
    .update({ pending: false })
    .eq("pending", true)
    .eq("auto_post", true)
    .lte("date", todayStr)
    .select("*");
  if (error) { console.error("[finances] autoPostPendingFinances erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
