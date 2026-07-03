import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type FinanceType = "income" | "expense";
export type FinanceMode = "personal" | "business";
export type FinanceSource = "whatsapp" | "web";

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
  createdAt: string;
};

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
  let items = getFinancesByUser(userId, mode);
  if (year !== undefined && month !== undefined) {
    items = items.filter(f => {
      const d = new Date(f.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }
  const income = items.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
  const expense = items.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
  return { income, expense, balance: income - expense };
}

export function getByCategory(userId: string, mode: FinanceMode, type: FinanceType, year?: number, month?: number): Record<string, number> {
  let items = getFinancesByUser(userId, mode).filter(f => f.type === type);
  if (year && month) {
    items = items.filter(f => {
      const d = new Date(f.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }
  return items.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + f.amount;
    return acc;
  }, {} as Record<string, number>);
}

export function getDailyTotals(userId: string, mode: FinanceMode, days = 30): Array<{ date: string; income: number; expense: number }> {
  const items = getFinancesByUser(userId, mode);
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

export function getRecentTransactions(userId: string, mode: FinanceMode, limit = 10): Finance[] {
  return getFinancesByUser(userId, mode)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
