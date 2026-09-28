import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type FinanceType = "income" | "expense";
export type FinanceMode = "personal" | "business";
export type FinanceSource = "whatsapp" | "web";
export type FinanceStatus = "posted" | "pending";

function normalizeFinanceModeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Identifica o modo de DESTINO numa alteração de lançamento.
 *
 * É separado do `mode` usado como contexto/origem porque frases como
 * "mudar da conta pessoal para a conta da empresa" citam os dois modos.
 * As formas com "para/a la" têm prioridade; uma resposta curta como
 * "conta da empresa" também funciona durante uma edição pendente. */
export function parseFinanceDestinationMode(text: string): FinanceMode | null {
  const normalized = normalizeFinanceModeText(text);
  if (!normalized) return null;

  const businessTarget = /\b(?:para|pra|pro|a|ao|hacia)\s+(?:(?:a|o|la|el)\s+)?(?:(?:conta|cuenta|modo)\s+)?(?:(?:da|de\s+la|do)\s+)?(?:empresa|empresarial|negocio)\b/;
  const personalTarget = /\b(?:para|pra|pro|a|ao|hacia)\s+(?:(?:a|o|la|el)\s+)?(?:(?:conta|cuenta|modo)\s+)?(?:pessoal|personal)\b/;

  const businessTargetMatch = normalized.match(businessTarget);
  const personalTargetMatch = normalized.match(personalTarget);
  if (businessTargetMatch || personalTargetMatch) {
    if (!businessTargetMatch) return "personal";
    if (!personalTargetMatch) return "business";
    return (businessTargetMatch.index ?? 0) > (personalTargetMatch.index ?? 0) ? "business" : "personal";
  }

  const mentionsBusiness = /\b(?:conta|cuenta|modo)\s+(?:(?:da|de\s+la)\s+)?(?:empresa|empresarial|negocio)\b|\bconta\s+empresarial\b|\bcuenta\s+empresarial\b/.test(normalized);
  const mentionsPersonal = /\b(?:conta|cuenta|modo)\s+(?:pessoal|personal)\b/.test(normalized);
  if (mentionsBusiness === mentionsPersonal) return null;
  return mentionsBusiness ? "business" : "personal";
}

export const CATEGORIES_EXPENSE = [
  "Alimentação", "Transporte", "Moradia", "Saúde", "Educação",
  "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos",
  "Funcionários", "Marketing", "Fornecedores", "Outros", "Transferência",
];
export const CATEGORIES_INCOME = [
  "Salário", "Freelance", "Vendas", "Investimentos", "Aluguel",
  "Serviços", "Reembolso", "Outros", "Transferência",
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
  "Empleados", "Marketing", "Proveedores", "Otros", "Transferencia",
];
const CATEGORIES_EXPENSE_PTPT = [
  "Alimentação", "Transporte", "Habitação", "Saúde", "Educação",
  "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos",
  "Funcionários", "Marketing", "Fornecedores", "Outros", "Transferência",
];
const CATEGORIES_INCOME_ES = [
  "Salario", "Freelance", "Ventas", "Inversiones", "Alquiler",
  "Servicios", "Reembolso", "Otros", "Transferencia",
];
const CATEGORIES_INCOME_PTPT = [
  "Salário", "Freelance", "Vendas", "Investimentos", "Renda",
  "Serviços", "Reembolso", "Outros", "Transferência",
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
  /** Funcionário ao qual este pagamento/gasto pertence. O vínculo é opcional:
   *  lançamentos antigos e a escolha explícita "sem funcionário" ficam vazios. */
  employeeId?: string;
  createdAt: string;
};

// Entrada está "postada" (contabilizada) se status for "posted" ou undefined (registros antigos)
export function isPostedFinance(f: Finance): boolean {
  return !f.status || f.status === "posted";
}

export type FinanceBalance = {
  income: number;
  expense: number;
  balance: number;
};

/** Calcula o saldo apenas com movimentos efetivamente contabilizados.
 *  É uma função pura para que o resumo do período e o saldo acumulado usem
 *  exatamente a mesma regra (pendências não alteram o caixa). */
export function calculateFinanceBalance(items: readonly Finance[]): FinanceBalance {
  const posted = items.filter(isPostedFinance);
  const income = posted
    .filter(f => f.type === "income" && !isNaN(f.amount))
    .reduce((sum, f) => sum + f.amount, 0);
  const expense = posted
    .filter(f => f.type === "expense" && !isNaN(f.amount))
    .reduce((sum, f) => sum + f.amount, 0);
  return { income, expense, balance: income - expense };
}

type Row = {
  id: string; user_id: string; type: FinanceType; amount: number; category: string;
  description: string; date: string; mode: FinanceMode; source: FinanceSource;
  pending: boolean; auto_post: boolean; registered_by: string | null; created_at: string;
  account_id: string | null; card_invoice_id: string | null; employee_id: string | null;
};

function fromRow(r: Row): Finance {
  return {
    id: r.id, userId: r.user_id, type: r.type, amount: Number(r.amount), category: r.category,
    description: r.description, date: r.date, mode: r.mode, source: r.source,
    status: r.pending ? "pending" : "posted", autoPost: r.auto_post, registeredBy: r.registered_by ?? undefined, createdAt: r.created_at,
    accountId: r.account_id ?? undefined, cardInvoiceId: r.card_invoice_id ?? undefined,
    employeeId: r.employee_id ?? undefined,
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
  const row = financeInsertRow(data);
  const { data: inserted, error } = await getSupabase().from("finances").insert(row).select("*").single();
  if (error) throw new Error(`[finances] addFinance falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

function financeInsertRow(data: Omit<Finance, "id" | "createdAt">): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: randomUUID(), user_id: data.userId, type: data.type, amount: data.amount,
    category: data.category, description: data.description, date: data.date,
    mode: data.mode, source: data.source, pending: data.status === "pending",
    auto_post: data.autoPost !== false,
    registered_by: data.registeredBy,
    account_id: data.accountId ?? null, card_invoice_id: data.cardInvoiceId ?? null,
  };
  // Compatibilidade durante a implantação da migração: lançamentos comuns
  // não mencionam a coluna nova. Quando há vínculo explícito, ela é enviada.
  if (data.employeeId !== undefined) row.employee_id = data.employeeId;
  return row;
}

/** Insere uma importação inteira em uma única operação no banco. Assim a
 *  confirmação nunca diz "tudo importado" após gravar apenas uma parte. */
export async function addFinances(
  items: Array<Omit<Finance, "id" | "createdAt">>,
): Promise<Finance[]> {
  if (items.length === 0) return [];
  const rows = items.map(financeInsertRow);
  const { data, error } = await getSupabase().from("finances").insert(rows).select("*");
  if (error) throw new Error(`[finances] addFinances falhou: ${error.message}`);
  if (!data || data.length !== items.length) {
    throw new Error(`[finances] addFinances retornou ${data?.length ?? 0}/${items.length} lançamentos`);
  }
  return (data as Row[]).map(fromRow);
}

export async function getFinancesByUser(userId: string, mode?: FinanceMode, registeredBy?: string): Promise<Finance[]> {
  return load(userId, { mode, registeredBy });
}

/** Contagem e data do lançamento mais recente de TODOS os usuários numa
 *  única query (só as colunas user_id/created_at, sem o resto da linha) —
 *  usado pelo painel admin. Fazer isso por usuário (1 requisição cada)
 *  significava dezenas de idas e vindas ao Supabase toda vez que a tela
 *  abria; numa lista pequena de lançamentos isso pesa mais em latência de
 *  rede do que em volume de dados, então uma query só resolve as duas coisas. */
export async function getFinancesSummaryByAllUsers(): Promise<Map<string, { count: number; latestCreatedAt: string }>> {
  const { data, error } = await getSupabase()
    .from("finances")
    .select("user_id, created_at")
    .order("created_at", { ascending: false });
  const summary = new Map<string, { count: number; latestCreatedAt: string }>();
  if (error) { console.error("[finances] getFinancesSummaryByAllUsers erro:", error.message); return summary; }
  for (const row of data as { user_id: string; created_at: string }[]) {
    const existing = summary.get(row.user_id);
    if (existing) existing.count += 1;
    else summary.set(row.user_id, { count: 1, latestCreatedAt: row.created_at });
  }
  return summary;
}

/** Filtra por intervalo de datas (YYYY-MM-DD, inclusive nas duas pontas) em
 *  vez do ano/mês fixo de getBalance — usado pelos filtros de período
 *  customizados em Finanças/Dashboard. Sem from/to, retorna tudo (mesmo
 *  comportamento de getFinancesByUser). */
export async function getFinancesInRange(userId: string, mode?: FinanceMode, from?: string, to?: string): Promise<Finance[]> {
  return load(userId, { mode, from, to });
}

export async function getBalance(userId: string, mode: FinanceMode, year?: number, month?: number, registeredBy?: string): Promise<FinanceBalance> {
  let items = await getFinancesByUser(userId, mode, registeredBy);
  if (year !== undefined && month !== undefined) {
    items = items.filter(f => {
      const d = new Date(f.date + "T12:00:00");
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }
  return calculateFinanceBalance(items);
}

/** Saldo acumulado de todo o histórico do modo selecionado, sem depender do
 *  período que o usuário está vendo no dashboard. */
export async function getAllTimeBalance(userId: string, mode: FinanceMode): Promise<FinanceBalance> {
  return calculateFinanceBalance(await getFinancesByUser(userId, mode));
}

/** Equivalente a getBalance, mas por intervalo de datas em vez de ano/mês fixo
 *  — usado quando a IA identifica um período relativo ("mês passado", "semana
 *  passada") em vez do mês atual. */
export async function getBalanceInRange(userId: string, mode: FinanceMode, from?: string, to?: string, registeredBy?: string): Promise<FinanceBalance> {
  const items = (await getFinancesInRange(userId, mode, from, to))
    .filter(f => !registeredBy || f.registeredBy === registeredBy);
  return calculateFinanceBalance(items);
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
  amazonas: ["amazonas mercad", "mercado amazonas", "amazonas mercado", "amazonas"],
  zedelivery: ["ze delivery", "zedelivery"],
  aiqfome: ["aiqfome", "aiq fome", "ai que fome", "aiquefome"],
  "99food": ["99food", "99 food", "99app", "app 99"],
  rappi: ["rappi"],
  ubereats: ["uber eats", "ubereats"],
};

function normalizeMerchantText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Expande um termo de busca digitado pelo usuário pras variantes conhecidas
 *  do mesmo comerciante (ex: "ifood" → também busca "ifd"), pra não perder
 *  lançamentos cuja descrição ficou abreviada. */
export function expandMerchantAliases(term: string): string[] {
  const rawLower = term.trim().toLowerCase();
  const lower = normalizeMerchantText(term);
  for (const variants of Object.values(MERCHANT_ALIASES)) {
    if (variants.some(v => {
      const normalizedVariant = normalizeMerchantText(v);
      return lower === normalizedVariant || lower.includes(normalizedVariant) || normalizedVariant.includes(lower);
    })) return variants;
  }
  return [rawLower];
}

/** Compara comerciante sem depender de acento, caixa ou separadores do
 * extrato ("Zé Delivery", "ZE*DELIVERY" e "ze delivery" são equivalentes). */
export function merchantDescriptionMatchesTerms(description: string, terms: readonly string[]): boolean {
  const normalizedDescription = normalizeMerchantText(description);
  return terms.some(term => normalizedDescription.includes(normalizeMerchantText(term)));
}

/** Soma os lançamentos cuja descrição bate com algum dos termos (busca OR,
 *  case-insensitive) dentro de um intervalo de datas — usado em perguntas
 *  sobre um comerciante/app específico ("quanto gastei com ifood"). */
export function merchantPurchaseDate(finance: Pick<Finance, "date" | "description">): string {
  const match = finance.description.match(/\bcompra\s+(?:em|el)\s+(\d{2})\/(\d{2})\/(\d{4})\b/i);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : finance.date;
}

export async function getKeywordTotal(userId: string, mode: FinanceMode, type: FinanceType, terms: string[], from?: string, to?: string, registeredBy?: string, accountId?: string): Promise<number> {
  return (await getFinancesByUser(userId, mode, registeredBy))
    .filter(f => isPostedFinance(f) && f.type === type && (!accountId || f.accountId === accountId))
    // Perguntas como "quanto gastei este mês" seguem a competência em que a
    // fatura foi contabilizada. A data original da compra continua preservada
    // na descrição para auditoria e deduplicação, mas não muda o mês da soma.
    .filter(f => (!from || f.date >= from) && (!to || f.date <= to))
    .filter(f => merchantDescriptionMatchesTerms(f.description, terms))
    .reduce((s, f) => s + f.amount, 0);
}

/** Lançamentos crus de um intervalo de datas, mais recente primeiro — usado
 *  por finance_detail quando o período pedido não é o mês atual. */
export async function getTransactionsInRange(userId: string, mode: FinanceMode, from?: string, to?: string): Promise<Finance[]> {
  return (await getFinancesInRange(userId, mode, from, to))
    .filter(f => isPostedFinance(f) && /^\d{4}-\d{2}-\d{2}$/.test(f.date ?? ""))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Visão financeira restrita a uma conta manual. É usada tanto no extrato
 * quanto em perguntas combinadas como "quanto gastei de iFood no Nubank?". */
export async function getAccountTransactionsInRange(
  userId: string, mode: FinanceMode, accountId: string, from?: string, to?: string,
): Promise<Finance[]> {
  return (await getTransactionsInRange(userId, mode, from, to))
    .filter(item => item.accountId === accountId);
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

export type FinanceUpdatePatch = Partial<Pick<Finance, "amount" | "category" | "description" | "date" | "status" | "autoPost" | "type" | "mode">> & {
  accountId?: string | null;
  cardInvoiceId?: string | null;
  employeeId?: string | null;
};

export async function updateFinance(id: string, userId: string, patch: FinanceUpdatePatch): Promise<Finance | null> {
  const rowPatch: Record<string, unknown> = {};
  if (patch.amount !== undefined) rowPatch.amount = patch.amount;
  if (patch.category !== undefined) rowPatch.category = patch.category;
  if (patch.description !== undefined) rowPatch.description = patch.description;
  if (patch.date !== undefined) rowPatch.date = patch.date;
  if (patch.status !== undefined) rowPatch.pending = patch.status === "pending";
  if (patch.autoPost !== undefined) rowPatch.auto_post = patch.autoPost;
  if (patch.type !== undefined) rowPatch.type = patch.type;
  if (patch.mode !== undefined) rowPatch.mode = patch.mode;
  if (patch.accountId !== undefined) rowPatch.account_id = patch.accountId;
  if (patch.cardInvoiceId !== undefined) rowPatch.card_invoice_id = patch.cardInvoiceId;
  if (patch.employeeId !== undefined) rowPatch.employee_id = patch.employeeId;
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

function normalizeDuplicateText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function merchantDescriptionsMatch(a: string, b: string): boolean {
  const left = normalizeDuplicateText(a);
  const right = normalizeDuplicateText(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;

  const ignored = new Set(["compra", "cartao", "parcela", "parcelado", "pagamento", "lancamento", "fatura", "debito", "credito"]);
  const tokens = (value: string) => new Set(value.split(" ").filter(token => token.length >= 3 && !ignored.has(token)));
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  return [...leftTokens].some(token => rightTokens.has(token));
}

function storedInstallment(description: string): { current: number; total: number; merchant: string } | null {
  const explicit = description.match(/\bparcela\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/i);
  const compact = /\brestantes\s+\d+\b/i.test(description)
    ? description.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/)
    : null;
  const match = explicit || compact;
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < current) return null;
  const merchant = description
    .replace(/\s*·?\s*parcela\s*\d{1,3}\s*\/\s*\d{1,3}/ig, "")
    .replace(/\s*·?\s*\d{1,3}\s*\/\s*\d{1,3}(?=\s*·?\s*restantes)/ig, "")
    .replace(/\s*·?\s*restantes\s+\d+/ig, "")
    .trim();
  return { current, total, merchant };
}

export type DocumentFinanceDuplicateCandidate = {
  type: FinanceType;
  amount: number;
  date: string;
  description: string;
  category: string;
  installmentCurrent?: number;
  installmentTotal?: number;
};

function documentDescriptionMatches(leftValue: string, rightValue: string): boolean {
  const clean = (value: string) => normalizeDuplicateText(value
    .replace(/\s*·?\s*parcela\s*\d{1,3}\s*\/\s*\d{1,3}/ig, "")
    .replace(/\s*·?\s*restantes\s*\d+/ig, ""));
  const left = clean(leftValue);
  const right = clean(rightValue);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 5 && (left.includes(right) || right.includes(left))) return true;

  const ignored = new Set(["compra", "comprovante", "recibo", "pagamento", "cartao", "debito", "credito"]);
  const tokens = (value: string) => [...new Set(value.split(" ").filter(token => token.length >= 2 && !ignored.has(token)))];
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const smaller = Math.min(leftTokens.length, rightTokens.length);
  if (!smaller) return false;
  const common = leftTokens.filter(token => rightTokens.includes(token)).length;
  // Uma descrição de uma palavra precisa coincidir exatamente. Para nomes
  // compostos, dois termos iguais suportam pequenas variações da visão.
  return smaller === 1 ? common === 1 : common >= 2 && common / smaller >= 0.67;
}

/** Deduplicação própria para fotos/prints de comprovantes. Exige a mesma
 * data, valor, tipo e descrição/estabelecimento; valor sozinho nunca basta.
 * Quando há parcela explícita, a fração também precisa ser a mesma. */
export function isSameDocumentFinance(
  existing: Finance,
  candidate: DocumentFinanceDuplicateCandidate,
  mode: FinanceMode,
): boolean {
  if (existing.mode !== mode || existing.type !== candidate.type) return false;
  if (existing.date !== candidate.date || Math.abs(existing.amount - candidate.amount) >= 0.01) return false;
  if (!documentDescriptionMatches(existing.description, candidate.description)) return false;

  const existingInstallment = storedInstallment(existing.description);
  const candidateHasInstallment = Boolean(candidate.installmentCurrent && candidate.installmentTotal);
  if (!existingInstallment || !candidateHasInstallment) {
    // Se uma das leituras perdeu a fração, a coincidência dos demais campos
    // ainda protege o reenvio do mesmo print. Não usamos essa regra entre
    // datas diferentes, então a parcela do mês seguinte continua permitida.
    return true;
  }
  return existingInstallment.current === candidate.installmentCurrent
    && existingInstallment.total === candidate.installmentTotal;
}

export async function isLikelyDuplicateDocumentFinance(
  userId: string,
  mode: FinanceMode,
  candidate: DocumentFinanceDuplicateCandidate,
): Promise<boolean> {
  const { data, error } = await getSupabase().from("finances").select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .eq("date", candidate.date);
  // Falhar aberto aqui poderia duplicar um print justamente quando o banco
  // está instável. Nesse caso o handler informa erro e não grava nada.
  if (error) throw new Error(`[finances] verificação de duplicado de comprovante falhou: ${error.message}`);
  const sameDay = (data as Row[]).map(fromRow);
  return sameDay.some(existing => isSameDocumentFinance(existing, candidate, mode));
}

/** Deduplica uma foto de extrato inteiro com uma única consulta. Mantém a
 * mesma regra rigorosa do comprovante unitário: data, tipo, valor e descrição
 * precisam coincidir; valor sozinho nunca elimina uma movimentação. */
export async function getDocumentFinanceDuplicateFlags(
  userId: string,
  mode: FinanceMode,
  candidates: DocumentFinanceDuplicateCandidate[],
): Promise<boolean[]> {
  if (candidates.length === 0) return [];
  const dates = candidates.map(candidate => candidate.date).sort();
  const { data, error } = await getSupabase().from("finances").select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1]);
  if (error) throw new Error(`[finances] verificação de duplicados do extrato falhou: ${error.message}`);
  const existing = (data as Row[]).map(fromRow);
  return candidates.map(candidate => existing.some(item => isSameDocumentFinance(item, candidate, mode)));
}

export type ImportedInstallmentStatus = {
  description: string;
  current: number;
  total: number;
  remaining: number;
  date: string;
  amount: number;
  mode: FinanceMode;
};

export function importedInstallmentStatuses(items: readonly Finance[]): ImportedInstallmentStatus[] {
  const latestByInstallment = new Map<string, ImportedInstallmentStatus>();
  const sorted = [...items]
    .filter(item => item.type === "expense" && isPostedFinance(item))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  for (const item of sorted) {
    const installment = storedInstallment(item.description);
    if (!installment) continue;
    const description = installment.merchant.split(" · compra ")[0].trim();
    const key = `${item.mode}|${normalizeDuplicateText(description)}|${installment.total}|${item.amount.toFixed(2)}`;
    if (latestByInstallment.has(key)) continue;
    latestByInstallment.set(key, {
      description,
      current: installment.current,
      total: installment.total,
      remaining: Math.max(0, installment.total - installment.current),
      date: item.date,
      amount: item.amount,
      mode: item.mode,
    });
  }
  return [...latestByInstallment.values()];
}

export async function getImportedInstallmentStatuses(
  userId: string,
  mode?: FinanceMode,
): Promise<ImportedInstallmentStatus[]> {
  return importedInstallmentStatuses(await getFinancesByUser(userId, mode));
}

/** Localiza a parcela mais recente que veio de uma fatura importada. Essas
 * parcelas não são recorrências geradas pela Zelo, mas mantêm no histórico a
 * fração atual/total e, por isso, também podem responder "quantas faltam?". */
export async function findImportedInstallmentStatus(
  userId: string,
  mode: FinanceMode,
  keyword: string,
): Promise<ImportedInstallmentStatus | null> {
  const normalizedKeyword = normalizeDuplicateText(keyword);
  if (!normalizedKeyword) return null;
  const matches = (await getImportedInstallmentStatuses(userId, mode))
    .filter(item => normalizeDuplicateText(item.description).includes(normalizedKeyword))
    .sort((a, b) => b.date.localeCompare(a.date));
  return matches[0] ?? null;
}

/** Deduplicação específica da importação de fatura. Cruza o que já existe em
 *  QUALQUER conta do mesmo modo com a cobrança do cartão somente quando dia e
 *  valor são iguais e o estabelecimento ou a categoria também é compatível. */
export function isSameInvoiceExpense(
  existing: Finance,
  candidate: { amount: number; date: string; purchaseDate?: string; description: string; category: string; installmentCurrent?: number; installmentTotal?: number },
  mode: FinanceMode,
): boolean {
  if (existing.mode !== mode || existing.type !== "expense") return false;
  if (Math.abs(existing.amount - candidate.amount) >= 0.01) return false;

  const previousInstallment = storedInstallment(existing.description);
  if (candidate.installmentCurrent && candidate.installmentTotal && previousInstallment
    && previousInstallment.total === candidate.installmentTotal
    && merchantDescriptionsMatch(previousInstallment.merchant, candidate.description)) {
    // A mesma parcela do mesmo documento já existe. Uma parcela posterior é
    // a continuação mensal da sequência e deve entrar como gasto do novo mês,
    // sem recriar todas as parcelas restantes.
    const sameDate = merchantPurchaseDate(existing) === (candidate.purchaseDate || candidate.date);
    if (previousInstallment.current !== candidate.installmentCurrent) {
      return previousInstallment.current > candidate.installmentCurrent && sameDate;
    }
    return sameDate;
  }

  if (merchantPurchaseDate(existing) !== (candidate.purchaseDate || candidate.date)) return false;
  return normalizeDuplicateText(existing.category) === normalizeDuplicateText(candidate.category)
    || merchantDescriptionsMatch(existing.description, candidate.description);
}

export async function isLikelyDuplicateInvoiceExpense(
  userId: string,
  mode: FinanceMode,
  candidate: { amount: number; date: string; purchaseDate?: string; description: string; category: string; installmentCurrent?: number; installmentTotal?: number },
): Promise<boolean> {
  const sameDay = await load(userId, { mode, from: candidate.date, to: candidate.date });
  return sameDay.some(existing => isSameInvoiceExpense(existing, candidate, mode));
}

/** Versão em lote para faturas: uma única leitura no banco, mesmo que o PDF
 *  tenha dezenas de linhas. A posição de cada booleano corresponde à posição
 *  da cobrança recebida. */
export async function getInvoiceDuplicateFlags(
  userId: string,
  mode: FinanceMode,
  candidates: Array<{ amount: number; date: string; purchaseDate?: string; description: string; category: string; installmentCurrent?: number; installmentTotal?: number }>,
): Promise<boolean[]> {
  if (candidates.length === 0) return [];
  const dates = candidates.flatMap(candidate => [candidate.date, candidate.purchaseDate].filter((date): date is string => Boolean(date))).sort();
  const { data, error } = await getSupabase().from("finances").select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1]);
  // Deduplicação é uma barreira de segurança: falha de leitura não pode
  // virar silenciosamente "zero duplicados" e oferecer importar tudo outra vez.
  if (error) throw new Error(`[finances] verificação de duplicados da fatura falhou: ${error.message}`);
  const existing = (data as Row[]).map(fromRow);
  return candidates.map(candidate => existing.some(item => isSameInvoiceExpense(item, candidate, mode)));
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
