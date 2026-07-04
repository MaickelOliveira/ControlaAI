import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type FuelType = "gasoline" | "ethanol" | "diesel" | "electric" | "flex";
export type VehicleExpenseType = "fuel" | "maintenance" | "insurance" | "tax" | "other";
export type VehicleMode = "personal" | "business";

export type VehicleExpense = {
  id: string;
  date: string;
  km?: number;
  type: VehicleExpenseType;
  amount: number;
  description: string;
  financeId?: string; // ID do lançamento espelhado em finances.json
};

export type Vehicle = {
  id: string;
  userId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  fuelType: FuelType;
  currentKm: number;
  mode: VehicleMode;
  expenses: VehicleExpense[];
  notes: string;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "vehicles.json");

function load(): Vehicle[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}
function save(items: Vehicle[]) { writeFileSync(FILE, JSON.stringify(items, null, 2)); }

export function createVehicle(data: Omit<Vehicle, "id" | "expenses" | "createdAt">): Vehicle {
  const items = load();
  const v: Vehicle = { ...data, id: randomUUID(), expenses: [], createdAt: new Date().toISOString() };
  items.push(v);
  save(items);
  return v;
}

export function getVehiclesByUser(userId: string, mode?: VehicleMode): Vehicle[] {
  return load().filter(v => v.userId === userId && (!mode || v.mode === mode));
}

export function addVehicleExpense(vehicleId: string, userId: string, expense: Omit<VehicleExpense, "id">): Vehicle | null {
  const items = load();
  const idx = items.findIndex(v => v.id === vehicleId && v.userId === userId);
  if (idx < 0) return null;
  const exp: VehicleExpense = { ...expense, id: randomUUID() };
  items[idx].expenses.push(exp);
  if (expense.km && expense.km > items[idx].currentKm) items[idx].currentKm = expense.km;
  save(items);
  return items[idx];
}

export function updateVehicleExpense(vehicleId: string, userId: string, expenseId: string, patch: Partial<Omit<VehicleExpense, "id">>): Vehicle | null {
  const items = load();
  const idx = items.findIndex(v => v.id === vehicleId && v.userId === userId);
  if (idx < 0) return null;
  const eIdx = items[idx].expenses.findIndex(e => e.id === expenseId);
  if (eIdx < 0) return null;
  items[idx].expenses[eIdx] = { ...items[idx].expenses[eIdx], ...patch };
  save(items);
  return items[idx];
}

/** Retorna { vehicle, financeId, expense } para que o caller possa apagar o lançamento financeiro vinculado */
export function deleteVehicleExpense(vehicleId: string, userId: string, expenseId: string): { vehicle: Vehicle; financeId?: string; expense: VehicleExpense } | null {
  const items = load();
  const idx = items.findIndex(v => v.id === vehicleId && v.userId === userId);
  if (idx < 0) return null;
  const expense = items[idx].expenses.find(e => e.id === expenseId);
  if (!expense) return null;
  const financeId = expense.financeId;
  items[idx].expenses = items[idx].expenses.filter(e => e.id !== expenseId);
  save(items);
  return { vehicle: items[idx], financeId, expense };
}

/** Busca o vehicle expense pelo financeId — usado ao excluir em Finanças */
export function findExpenseByFinanceId(userId: string, financeId: string): { vehicleId: string; expenseId: string } | null {
  for (const v of load()) {
    if (v.userId !== userId) continue;
    const e = v.expenses.find(ex => ex.financeId === financeId);
    if (e) return { vehicleId: v.id, expenseId: e.id };
  }
  return null;
}

/** Atualiza o financeId de um gasto de veículo após criar o lançamento financeiro */
export function setExpenseFinanceId(vehicleId: string, expenseId: string, financeId: string): void {
  const items = load();
  const v = items.find(v => v.id === vehicleId);
  if (!v) return;
  const e = v.expenses.find(e => e.id === expenseId);
  if (e) { e.financeId = financeId; save(items); }
}

export function updateVehicleKm(vehicleId: string, userId: string, km: number): Vehicle | null {
  const items = load();
  const idx = items.findIndex(v => v.id === vehicleId && v.userId === userId);
  if (idx < 0) return null;
  items[idx].currentKm = km;
  save(items);
  return items[idx];
}

export function findVehicleByName(userId: string, name: string, mode?: VehicleMode): Vehicle | null {
  const lower = name.toLowerCase();
  return getVehiclesByUser(userId, mode).find(v =>
    v.model.toLowerCase().includes(lower) || v.brand.toLowerCase().includes(lower) || v.plate.toLowerCase().includes(lower)
  ) ?? null;
}

export function getVehicleTotalExpenses(vehicle: Vehicle): number {
  return vehicle.expenses.reduce((s, e) => s + e.amount, 0);
}

export function getVehicleExpensesByType(vehicle: Vehicle): Record<string, number> {
  return vehicle.expenses.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
}

export const EXPENSE_TYPE_LABEL: Record<VehicleExpenseType, string> = {
  fuel: "⛽ Combustível",
  maintenance: "🔧 Manutenção",
  insurance: "🛡️ Seguro",
  tax: "📋 IPVA/Impostos",
  other: "📌 Outros",
};

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  gasoline: "Gasolina",
  ethanol: "Etanol",
  diesel: "Diesel",
  electric: "Elétrico",
  flex: "Flex",
};
