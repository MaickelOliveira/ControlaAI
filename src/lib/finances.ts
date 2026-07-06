import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

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
  createdAt: string;
};

// Entrada está "postada" (contabilizada) se status for "posted" ou undefined (registros antigos)
function isPosted(f: Finance): boolean {
  return !f.status || f.status === "posted";
}

const FILE = path.join(process.cwd(), "data", "finances.json");

function load(): Finance[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}
function save(items: Finance[]) {
  writeFileSync(FILE, JSON.stringify(items, null, 2));
}

export function addFinance(data: Omit<Finance, "id" | "createdAt">): Finance {
  const items = load();
  const item: Finance = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  items.push(item);
  save(items);
  return item;
}

export function getFinancesByUser(userId: string, mode?: FinanceMode): Finance[] {
  return load().filter(f => f.userId === userId && (!mode || f.mode === mode));
}

export function getBalance(userId: string, mode: FinanceMode, year?: number, month?: number): {
  income: number;
  expense: number;
  balance: number;
} {
  let items = getFinancesByUser(userId, mode).filter(isPosted);
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

export function getByCategory(userId: string, mode: FinanceMode, type: FinanceType, year?: number, month?: number): Record<string, number> {
  let items = getFinancesByUser(userId, mode).filter(f => f.type === type && isPosted(f));
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

export function getDailyTotals(userId: string, mode: FinanceMode, days = 30): Array<{ date: string; income: number; expense: number }> {
  const items = getFinancesByUser(userId, mode).filter(isPosted);
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

export function deleteFinance(id: string, userId: string): boolean {
  const items = load();
  const idx = items.findIndex(f => f.id === id && f.userId === userId);
  if (idx < 0) return false;
  items.splice(idx, 1);
  save(items);
  return true;
}

export function updateFinance(id: string, userId: string, patch: Partial<Pick<Finance, "amount" | "category" | "description" | "date" | "status">>): Finance | null {
  const items = load();
  const idx = items.findIndex(f => f.id === id && f.userId === userId);
  if (idx < 0) return null;
  items[idx] = { ...items[idx], ...patch };
  save(items);
  return items[idx];
}

export function findFinanceByDescription(userId: string, mode: FinanceMode | null, keyword: string, limit = 5): Finance[] {
  const lower = keyword.toLowerCase();
  return load()
    .filter(f => f.userId === userId && (mode === null || f.mode === mode) && (
      f.description.toLowerCase().includes(lower) ||
      f.category.toLowerCase().includes(lower)
    ))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getRecentTransactions(userId: string, mode: FinanceMode, limit = 10): Finance[] {
  return getFinancesByUser(userId, mode)
    .filter(isPosted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getMonthlyTransactions(userId: string, mode: FinanceMode, year: number, month: number): Finance[] {
  return getFinancesByUser(userId, mode)
    .filter(f => isPosted(f) && /^\d{4}-\d{2}-\d{2}$/.test(f.date ?? ""))
    .filter(f => {
      const d = new Date(f.date + "T12:00:00");
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Retorna lançamentos pendentes de um usuário ordenados por data
export function getPendingFinances(userId: string, mode?: FinanceMode): Finance[] {
  return load()
    .filter(f => f.userId === userId && f.status === "pending" && (!mode || f.mode === mode))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Posta automaticamente os lançamentos pendentes cuja data já chegou
// Retorna os lançamentos que foram postados
export function autoPostPendingFinances(todayStr: string): Finance[] {
  const items = load();
  const posted: Finance[] = [];
  let changed = false;
  for (const f of items) {
    if (f.status === "pending" && f.date <= todayStr) {
      f.status = "posted";
      posted.push(f);
      changed = true;
    }
  }
  if (changed) save(items);
  return posted;
}

export function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
