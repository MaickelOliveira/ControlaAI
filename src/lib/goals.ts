import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type GoalStatus = "active" | "completed" | "cancelled";
export type GoalMode = "personal" | "business";

export type Goal = {
  id: string;
  userId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  category: string;
  mode: GoalMode;
  status: GoalStatus;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "goals.json");

function load(): Goal[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}
function save(items: Goal[]) { writeFileSync(FILE, JSON.stringify(items, null, 2)); }

export function createGoal(data: Omit<Goal, "id" | "createdAt">): Goal {
  const items = load();
  const goal: Goal = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  items.push(goal);
  save(items);
  return goal;
}

export function getGoalsByUser(userId: string, mode?: GoalMode): Goal[] {
  return load().filter(g => g.userId === userId && (!mode || g.mode === mode));
}

export function getActiveGoals(userId: string, mode?: GoalMode): Goal[] {
  return getGoalsByUser(userId, mode).filter(g => g.status === "active");
}

export function updateGoalAmount(id: string, userId: string, amount: number): Goal | null {
  const items = load();
  const idx = items.findIndex(g => g.id === id && g.userId === userId);
  if (idx < 0) return null;
  items[idx].currentAmount = Math.min(items[idx].currentAmount + amount, items[idx].targetAmount);
  if (items[idx].currentAmount >= items[idx].targetAmount) {
    items[idx].status = "completed";
  }
  save(items);
  return items[idx];
}

export function updateGoalStatus(id: string, userId: string, status: GoalStatus): Goal | null {
  const items = load();
  const idx = items.findIndex(g => g.id === id && g.userId === userId);
  if (idx < 0) return null;
  items[idx].status = status;
  save(items);
  return items[idx];
}

export function findGoalByTitle(userId: string, title: string, mode?: GoalMode): Goal | null {
  const lower = title.toLowerCase();
  return getGoalsByUser(userId, mode).find(g => g.title.toLowerCase().includes(lower)) ?? null;
}

export function getGoalProgress(goal: Goal): number {
  if (goal.targetAmount === 0) return 100;
  return Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
}

export function formatGoalDeadline(goal: Goal): string {
  if (!goal.deadline) return "Sem prazo";
  const d = new Date(goal.deadline + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
