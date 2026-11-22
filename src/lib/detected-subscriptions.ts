import type {BankMovement} from "./open-finance-report";
import type {BankAgendaItem} from "./open-finance-schedules";
import {bankCategory} from "./bank-category";
import {descriptionExpenseCategory} from "./expense-category";
import {normalizeMerchantText} from "./merchant-text";

/**
 * Assinaturas que o banco não marca como recorrentes (ex.: ChatGPT cobrado no
 * cartão todo mês). Uma cobrança do mesmo estabelecimento, no mesmo cartão ou
 * conta, com valor parecido e em meses seguidos, vira previsão para os meses
 * seguintes. Nada é gravado: é só previsão, como as do banco.
 */
export type DetectedSubscription = {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  resourceId?: string;
  resourceName: string;
  institutionName: string;
};

const MIN_MONTHS = 2;
const MAX_AMOUNT_SPREAD = 0.15;
const MAX_DAY_SPREAD = 5;
const MAX_MONTHS_SINCE_LAST = 2;
const CANCEL_GRACE_DAYS = 10;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function subscriptionKey(description: string): string {
  return description.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(?:subscr\w*|assinatura|mensal(?:idade)?|monthly|plan[oa]?)\b/g, " ")
    .replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const monthStart = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
function dateInMonth(index: number, day: number): string {
  const year = Math.floor(index / 12), month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${monthStart(index)}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const LATE_FEE_RE = /\b(?:juros|multas?|iof|rotativo|mora|atraso|encargos?)\b/;
const FOOD_CATEGORIES = new Set(["Delivery", "Alimentação"]);

/**
 * Cobranças que podem se repetir, mas não são conta mensal: juros, multa e IOF
 * só aparecem quando a fatura atrasa; lanche, restaurante, mercado e delivery
 * são consumo. Assinaturas de comida (iFood Club) continuam valendo.
 */
export function isOccasionalCharge(description: string, category?: string | null): boolean {
  if (LATE_FEE_RE.test(normalizeMerchantText(description))) return true;
  const byDescription = descriptionExpenseCategory(description);
  if (byDescription === "Assinaturas" || byDescription === "Inteligência Artificial") return false;
  return [byDescription, category?.trim()].some(name => !!name && FOOD_CATEGORIES.has(name));
}

export function isSubscriptionCandidate(row: BankMovement): boolean {
  // Compras no cartão podem chegar sem "debit" como direção; o tipo do
  // movimento diz que é saída.
  const outflow = row.kind === "card_purchases" || row.kind === "account_debits" || row.direction === "debit";
  if (!outflow || row.direction === "credit" || row.classification === "bill_payment") return false;
  const category = bankCategory(row);
  if (category.source === "excluded" || isOccasionalCharge(row.description, category.name)) return false;
  if ((row.currency ?? "BRL") !== "BRL" || row.amount === null) return false;
  if ((row.installment_count ?? 1) > 1) return false;
  const amount = Number(row.amount);
  return Number.isFinite(amount) && amount > 0;
}

/** Já previsto pelo banco ou cadastrado na Zelo com nome parecido. */
function alreadyKnown(key: string, known: readonly string[]): boolean {
  return known.some(other => {
    const k = subscriptionKey(other);
    return !!k && (k === key || k.includes(key) || key.includes(k));
  });
}

export function detectSubscriptions(input: {
  history: readonly BankMovement[];
  period: {from: string; to: string};
  today: string;
  bankSchedules?: readonly Pick<BankAgendaItem, "kind" | "description">[];
  knownDescriptions?: readonly string[];
}): DetectedSubscription[] {
  const groups = new Map<string, BankMovement[]>();
  for (const row of input.history) {
    if (!isSubscriptionCandidate(row) || row.date > input.today) continue;
    const key = subscriptionKey(row.description);
    if (key.length < 3) continue;
    // Agrupa pelo banco, não pelo cartão: alguns bancos trocam o identificador
    // do cartão entre faturas e separariam as cobranças do mesmo serviço.
    const groupKey = `${row.institution_name}|${key}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }

  const known = [
    ...(input.bankSchedules ?? []).filter(row => row.kind === "recurring").map(row => row.description),
    ...(input.knownDescriptions ?? []),
  ];
  const firstMonth = monthIndex(input.period.from), lastMonth = monthIndex(input.period.to);
  const result: DetectedSubscription[] = [];

  for (const [baseKey, all] of groups) {
   const key = baseKey.slice(baseKey.indexOf("|") + 1);
   if (alreadyKnown(key, known)) continue;
   // O mesmo nome pode ter cobranças de valores diferentes no mês (ex.: Google
   // One de R$ 96,99 e uma verificação de R$ 1,00). Cada faixa de valor é
   // avaliada sozinha, para uma não anular a outra.
   const clusters = amountClusters(all);
   for (const [index, rows] of clusters.entries()) {
    const groupKey = clusters.length > 1 ? `${baseKey}|${index}` : baseKey;
    // Uma cobrança por mês: compras repetidas no mesmo mês não são assinatura.
    const byMonth = new Map<number, BankMovement[]>();
    for (const row of rows) byMonth.set(monthIndex(row.date), [...(byMonth.get(monthIndex(row.date)) ?? []), row]);
    if ([...byMonth.values()].some(list => list.length > 1)) continue;
    const months = [...byMonth.keys()].sort((a, b) => a - b);
    if (months.length < MIN_MONTHS) continue;
    if (months.some((month, index) => index > 0 && month - months[index - 1] !== 1)) continue;

    const amounts = rows.map(row => Number(row.amount));
    const typical = median(amounts);
    if (amounts.some(value => Math.abs(value - typical) / typical > MAX_AMOUNT_SPREAD)) continue;
    const days = rows.map(row => Number(row.date.slice(8, 10)));
    if (Math.max(...days) - Math.min(...days) > MAX_DAY_SPREAD) continue;

    const lastSeen = months[months.length - 1];
    const latest = rows.find(row => monthIndex(row.date) === lastSeen)!;
    const day = Math.round(median(days));
    // Cancelada: a cobrança deste mês não veio até 10 dias depois do dia de
    // sempre (o cartão pode lançar com alguns dias de atraso).
    const currentMonth = monthIndex(input.today);
    if (lastSeen < currentMonth && input.today > addDays(dateInMonth(currentMonth, day), CANCEL_GRACE_DAYS)) continue;
    for (let month = Math.max(firstMonth, lastSeen + 1); month <= lastMonth; month++) {
      // Sem cobrança há mais de dois meses, a assinatura provavelmente acabou.
      if (month - lastSeen > MAX_MONTHS_SINCE_LAST) break;
      const date = dateInMonth(month, day);
      if (date < input.period.from || date > input.period.to || date < input.today) continue;
      result.push({
        id: `detected:${groupKey}:${monthStart(month)}`,
        description: latest.description.replace(/\s+/g, " ").trim(),
        amount: Math.round(typical * 100) / 100,
        // Mesma tradução de categoria do extrato ("Alimentação", não o código do banco).
        category: bankCategory(latest).name,
        date,
        resourceId: latest.resource_id,
        resourceName: latest.resource_name,
        institutionName: latest.institution_name,
      });
    }
   }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function amountClusters(rows: readonly BankMovement[]): BankMovement[][] {
  const clusters: BankMovement[][] = [];
  for (const row of [...rows].sort((a, b) => Number(a.amount) - Number(b.amount))) {
    const current = clusters[clusters.length - 1];
    if (current && Number(row.amount) <= Number(current[0].amount) * (1 + MAX_AMOUNT_SPREAD)) current.push(row);
    else clusters.push([row]);
  }
  return clusters;
}

/**
 * Recorrências que o banco informa só até o mês atual (ex.: Google com
 * vencimento em 12/11) continuam nos meses seguintes, no mesmo dia. Só vale
 * para recorrências vistas neste mês ou no anterior, com valor em reais.
 */
export function projectBankRecurring(input: {
  schedules: readonly BankAgendaItem[];
  period: {from: string; to: string};
  today: string;
  category: (item: BankAgendaItem) => string;
}): DetectedSubscription[] {
  const firstMonth = monthIndex(input.period.from), lastMonth = monthIndex(input.period.to), current = monthIndex(input.today);
  const result: DetectedSubscription[] = [];
  const seen = new Set<string>();
  for (const item of input.schedules) {
    if (item.kind !== "recurring" || !item.due_date || item.amount === null || (item.currency ?? "BRL") !== "BRL") continue;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const dueMonth = monthIndex(item.due_date);
    if (dueMonth < current - 1 || dueMonth > current) continue;
    const category = input.category(item);
    if (isOccasionalCharge(item.description, category)) continue;
    const day = Number(item.due_date.slice(8, 10));
    for (let month = Math.max(firstMonth, dueMonth + 1); month <= lastMonth; month++) {
      const date = dateInMonth(month, day);
      if (date < input.period.from || date > input.period.to || date < input.today) continue;
      const id = `bank-recurring:${item.id}:${monthStart(month)}`;
      const dedupe = `${item.institution_name}|${subscriptionKey(item.description)}|${Math.round(amount * 100)}|${monthStart(month)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      result.push({id, description: item.description.replace(/\s+/g, " ").trim(), amount: Math.round(amount * 100) / 100, category, date,
        resourceId: item.resource_id, resourceName: item.resource_name, institutionName: item.institution_name});
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
