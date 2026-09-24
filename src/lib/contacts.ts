import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type ContactStatus = "active" | "inactive";

export type Contact = {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  relation?: string;
  notes?: string;
  status: ContactStatus;
  createdAt: string;
};

type Row = {
  id: string; user_id: string; name: string; phone: string | null; email: string | null;
  relation: string | null; notes: string | null; status: ContactStatus; created_at: string;
};

function fromRow(r: Row): Contact {
  return {
    id: r.id, userId: r.user_id, name: r.name, phone: r.phone ?? undefined, email: r.email ?? undefined,
    relation: r.relation ?? undefined, notes: r.notes ?? undefined,
    status: r.status, createdAt: r.created_at,
  };
}

export async function createContact(data: Omit<Contact, "id" | "createdAt">): Promise<Contact> {
  const row = {
    id: randomUUID(), user_id: data.userId, name: data.name, phone: data.phone, email: data.email,
    relation: data.relation, notes: data.notes, status: data.status,
  };
  const { data: inserted, error } = await getSupabase().from("contacts").insert(row).select("*").single();
  if (error) throw new Error(`[contacts] createContact falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getContactsByUser(userId: string, status?: ContactStatus): Promise<Contact[]> {
  let query = getSupabase().from("contacts").select("*").eq("user_id", userId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) { console.error("[contacts] getContactsByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function updateContact(id: string, userId: string, patch: Partial<Contact>): Promise<Contact | null> {
  const rowPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.phone !== undefined) rowPatch.phone = patch.phone;
  if (patch.email !== undefined) rowPatch.email = patch.email;
  if (patch.relation !== undefined) rowPatch.relation = patch.relation;
  if (patch.notes !== undefined) rowPatch.notes = patch.notes;
  if (patch.status !== undefined) rowPatch.status = patch.status;
  const { data, error } = await getSupabase().from("contacts").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function findContactByName(userId: string, name: string): Promise<Contact | null> {
  const lower = name.toLowerCase();
  return (await getContactsByUser(userId, "active")).find(c => c.name.toLowerCase().includes(lower)) ?? null;
}

/** Todos os contatos ativos cujo nome bate com o termo — mesma lógica de
 *  findCustomersByName, usada em consultas onde pode haver mais de uma
 *  pessoa com o mesmo primeiro nome. */
export async function findContactsByName(userId: string, name: string): Promise<Contact[]> {
  const lower = name.toLowerCase();
  return (await getContactsByUser(userId, "active")).filter(c => c.name.toLowerCase().includes(lower));
}
