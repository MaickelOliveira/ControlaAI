import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type CustomerStatus = "active" | "inactive";

export type Customer = {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  status: CustomerStatus;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "customers.json");

function load(): Customer[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}
function save(items: Customer[]) { writeFileSync(FILE, JSON.stringify(items, null, 2)); }

export function createCustomer(data: Omit<Customer, "id" | "createdAt">): Customer {
  const items = load();
  const c: Customer = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  items.push(c);
  save(items);
  return c;
}

export function getCustomersByUser(userId: string, status?: CustomerStatus): Customer[] {
  return load().filter(c => c.userId === userId && (!status || c.status === status));
}

export function updateCustomer(id: string, userId: string, patch: Partial<Customer>): Customer | null {
  const items = load();
  const idx = items.findIndex(c => c.id === id && c.userId === userId);
  if (idx < 0) return null;
  items[idx] = { ...items[idx], ...patch };
  save(items);
  return items[idx];
}

export function findCustomerByName(userId: string, name: string): Customer | null {
  const lower = name.toLowerCase();
  return getCustomersByUser(userId).find(c => c.name.toLowerCase().includes(lower)) ?? null;
}
