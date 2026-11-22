import type {BankMovement} from "./open-finance-report";
import type {BankAgendaItem} from "./open-finance-schedules";
import {bankCategory} from "./bank-category";

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

export function isSubscriptionCandidate(row: BankMovement): boolean {
  // Compras no cartão podem chegar sem "debit" como direção; o tipo do
  // movimento diz que é saída.
  const outflow = row.kind === "card_purchases" || row.kind === "account_debits" || row.direction === "debit";
  if (!outflow || row.direction === "credit" || row.classification === "bill_payment") return false;
  if (bankCategory(row).source === "excluded") return false;
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

  for (const [groupKey, rows] of groups) {
    const key = groupKey.slice(groupKey.indexOf("|") + 1);
    if (alreadyKnown(key, known)) continue;
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
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
