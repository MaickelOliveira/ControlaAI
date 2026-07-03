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
