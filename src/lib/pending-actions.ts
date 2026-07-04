import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { VehicleExpenseType } from "./vehicles";

const FILE = path.join(process.cwd(), "data", "pending.json");
const TTL_MS = 5 * 60 * 1000; // 5 minutos

export type PendingVehicleSelection = {
  type: "vehicle_selection";
  phone: string;
  userId: string;
  mode: string;
  expenseData: {
    amount: number;
    expenseType: VehicleExpenseType;
    description: string;
    km?: number;
    date: string;
  };
  vehicles: Array<{ id: string; brand: string; model: string; year: number }>;
  expiresAt: string;
};

export type PendingGoalSelection = {
  type: "goal_selection";
  phone: string;
  userId: string;
  mode: string;
  amount: number;
  goals: Array<{ id: string; title: string; currentAmount: number; targetAmount: number }>;
  expiresAt: string;
};

export type PendingAction = PendingVehicleSelection | PendingGoalSelection;

type Store = Record<string, PendingAction>;

function load(): Store {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return {}; }
}

function save(store: Store) {
  try { writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch { /* ignore */ }
}

type PendingActionInput = Omit<PendingVehicleSelection, "phone" | "expiresAt"> | Omit<PendingGoalSelection, "phone" | "expiresAt">;

export function setPendingAction(phone: string, action: PendingActionInput): void {
  const store = load();
  // remove expirados
  const now = Date.now();
  for (const key of Object.keys(store)) {
    if (new Date(store[key].expiresAt).getTime() < now) delete store[key];
  }
  store[phone] = { ...action, phone, expiresAt: new Date(now + TTL_MS).toISOString() } as PendingAction;
  save(store);
}

export function getPendingAction(phone: string): PendingAction | null {
  const store = load();
  const action = store[phone];
  if (!action) return null;
  if (new Date(action.expiresAt).getTime() < Date.now()) {
    delete store[phone];
    save(store);
    return null;
  }
  return action;
}

export function clearPendingAction(phone: string): void {
  const store = load();
  if (phone in store) {
    delete store[phone];
    save(store);
  }
}

/** Interpreta a resposta do usuário como escolha de meta.
 *  Aceita: "1", "2", parte do título. Retorna índice (0-based) ou -1. */
export function parseGoalChoice(
  text: string,
  goals: Array<{ id: string; title: string; currentAmount: number; targetAmount: number }>
): number {
  const t = text.trim().toLowerCase();
  const num = parseInt(t);
  if (!isNaN(num) && num >= 1 && num <= goals.length) return num - 1;
  for (let i = 0; i < goals.length; i++) {
    if (goals[i].title.toLowerCase().includes(t) || t.includes(goals[i].title.toLowerCase())) return i;
  }
  return -1;
}

/** Interpreta a resposta do usuário como escolha de veículo.
 *  Aceita: "1", "2", nome do modelo, nome da marca. Retorna índice (0-based) ou -1. */
export function parseVehicleChoice(
  text: string,
  vehicles: Array<{ id: string; brand: string; model: string; year: number }>
): number {
  const t = text.trim().toLowerCase();

  // número direto: "1", "2", etc.
  const num = parseInt(t);
  if (!isNaN(num) && num >= 1 && num <= vehicles.length) return num - 1;

  // match por modelo ou marca
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    if (
      v.model.toLowerCase().includes(t) ||
      v.brand.toLowerCase().includes(t) ||
      t.includes(v.model.toLowerCase()) ||
      t.includes(v.brand.toLowerCase())
    ) {
      return i;
    }
  }

  return -1;
}
