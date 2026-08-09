import { readFileSync, existsSync } from "fs";
import { writeJSONAtomic } from "./json-store";
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
  address?: string;
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
function save(items: Customer[]) { writeJSONAtomic(FILE, items); }

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

/** Todos os clientes ativos cujo nome bate com o termo — usado em consultas
 *  ("qual o telefone do Bruno"), onde pode haver mais de um cliente com o
 *  mesmo primeiro nome e a resposta precisa listar todos em vez de escolher
 *  um só. Se o termo já incluir sobrenome/identificação mais específica
 *  (ex: "Bruno Ciola"), a busca por substring naturalmente restringe a um
 *  único resultado, sem lógica extra. */
export function findCustomersByName(userId: string, name: string): Customer[] {
  const lower = name.toLowerCase();
  return getCustomersByUser(userId, "active").filter(c => c.name.toLowerCase().includes(lower));
}
