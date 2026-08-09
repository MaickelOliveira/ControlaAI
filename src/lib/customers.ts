import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

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

type Row = {
  id: string; user_id: string; name: string; phone: string | null; email: string | null;
  company: string | null; address: string | null; notes: string | null; status: CustomerStatus; created_at: string;
};

function fromRow(r: Row): Customer {
  return {
    id: r.id, userId: r.user_id, name: r.name, phone: r.phone ?? undefined, email: r.email ?? undefined,
    company: r.company ?? undefined, address: r.address ?? undefined, notes: r.notes ?? undefined,
    status: r.status, createdAt: r.created_at,
  };
}

export async function createCustomer(data: Omit<Customer, "id" | "createdAt">): Promise<Customer> {
  const row = {
    id: randomUUID(), user_id: data.userId, name: data.name, phone: data.phone, email: data.email,
    company: data.company, address: data.address, notes: data.notes, status: data.status,
  };
  const { data: inserted, error } = await getSupabase().from("customers").insert(row).select("*").single();
  if (error) throw new Error(`[customers] createCustomer falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getCustomersByUser(userId: string, status?: CustomerStatus): Promise<Customer[]> {
  let query = getSupabase().from("customers").select("*").eq("user_id", userId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) { console.error("[customers] getCustomersByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function updateCustomer(id: string, userId: string, patch: Partial<Customer>): Promise<Customer | null> {
  const rowPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.phone !== undefined) rowPatch.phone = patch.phone;
  if (patch.email !== undefined) rowPatch.email = patch.email;
  if (patch.company !== undefined) rowPatch.company = patch.company;
  if (patch.address !== undefined) rowPatch.address = patch.address;
  if (patch.notes !== undefined) rowPatch.notes = patch.notes;
  if (patch.status !== undefined) rowPatch.status = patch.status;
  const { data, error } = await getSupabase().from("customers").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function findCustomerByName(userId: string, name: string): Promise<Customer | null> {
  const lower = name.toLowerCase();
  return (await getCustomersByUser(userId)).find(c => c.name.toLowerCase().includes(lower)) ?? null;
}

/** Todos os clientes ativos cujo nome bate com o termo — usado em consultas
 *  ("qual o telefone do Bruno"), onde pode haver mais de um cliente com o
 *  mesmo primeiro nome e a resposta precisa listar todos em vez de escolher
 *  um só. Se o termo já incluir sobrenome/identificação mais específica
 *  (ex: "Bruno Ciola"), a busca por substring naturalmente restringe a um
 *  único resultado, sem lógica extra. */
export async function findCustomersByName(userId: string, name: string): Promise<Customer[]> {
  const lower = name.toLowerCase();
  return (await getCustomersByUser(userId, "active")).filter(c => c.name.toLowerCase().includes(lower));
}
