import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

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

type Row = {
  id: string; user_id: string; name: string; role: string; salary: number; start_date: string;
  status: EmployeeStatus; phone: string | null; email: string | null; notes: string | null; created_at: string;
};

function fromRow(r: Row): Employee {
  return {
    id: r.id, userId: r.user_id, name: r.name, role: r.role, salary: Number(r.salary),
    startDate: r.start_date, status: r.status, phone: r.phone ?? undefined,
    email: r.email ?? undefined, notes: r.notes ?? undefined, createdAt: r.created_at,
  };
}

export async function createEmployee(data: Omit<Employee, "id" | "createdAt">): Promise<Employee> {
  const row = {
    id: randomUUID(), user_id: data.userId, name: data.name, role: data.role, salary: data.salary,
    start_date: data.startDate, status: data.status, phone: data.phone, email: data.email, notes: data.notes,
  };
  const { data: inserted, error } = await getSupabase().from("employees").insert(row).select("*").single();
  if (error) throw new Error(`[employees] createEmployee falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getEmployeesByUser(userId: string, status?: EmployeeStatus): Promise<Employee[]> {
  let query = getSupabase().from("employees").select("*").eq("user_id", userId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) { console.error("[employees] getEmployeesByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function updateEmployee(id: string, userId: string, patch: Partial<Employee>): Promise<Employee | null> {
  const rowPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.role !== undefined) rowPatch.role = patch.role;
  if (patch.salary !== undefined) rowPatch.salary = patch.salary;
  if (patch.startDate !== undefined) rowPatch.start_date = patch.startDate;
  if (patch.status !== undefined) rowPatch.status = patch.status;
  if (patch.phone !== undefined) rowPatch.phone = patch.phone;
  if (patch.email !== undefined) rowPatch.email = patch.email;
  if (patch.notes !== undefined) rowPatch.notes = patch.notes;
  const { data, error } = await getSupabase().from("employees").update(rowPatch).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function getTotalPayroll(userId: string): Promise<number> {
  return (await getEmployeesByUser(userId, "active")).reduce((s, e) => s + e.salary, 0);
}

export async function findEmployeeByName(userId: string, name: string): Promise<Employee | null> {
  const lower = name.toLowerCase();
  return (await getEmployeesByUser(userId)).find(e => e.name.toLowerCase().includes(lower)) ?? null;
}
