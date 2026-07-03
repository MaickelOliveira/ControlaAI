import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type EmployeeStatus = "active" | "inactive";

export type Employee = {
  id: string;
  userId: string;
  name: string;
  role: string;
  salary: number;
  startDate: string;
  status: EmployeeStatus;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "employees.json");

function load(): Employee[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}
function save(items: Employee[]) { writeFileSync(FILE, JSON.stringify(items, null, 2)); }

export function createEmployee(data: Omit<Employee, "id" | "createdAt">): Employee {
  const items = load();
  const e: Employee = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  items.push(e);
  save(items);
  return e;
}

export function getEmployeesByUser(userId: string, status?: EmployeeStatus): Employee[] {
  return load().filter(e => e.userId === userId && (!status || e.status === status));
}

export function updateEmployee(id: string, userId: string, patch: Partial<Employee>): Employee | null {
  const items = load();
  const idx = items.findIndex(e => e.id === id && e.userId === userId);
  if (idx < 0) return null;
  items[idx] = { ...items[idx], ...patch };
  save(items);
  return items[idx];
}

export function getTotalPayroll(userId: string): number {
  return getEmployeesByUser(userId, "active").reduce((s, e) => s + e.salary, 0);
}

export function findEmployeeByName(userId: string, name: string): Employee | null {
  const lower = name.toLowerCase();
  return getEmployeesByUser(userId).find(e => e.name.toLowerCase().includes(lower)) ?? null;
}
