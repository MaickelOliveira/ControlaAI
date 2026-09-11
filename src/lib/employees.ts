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

export type EmployeePayment = {
  id: string;
  employeeId: string;
  amount: number;
  description: string;
  date: string;
  status: "posted" | "pending";
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
  return (await findEmployeesByName(userId, name))[0] ?? null;
}

/** Procura todos os funcionários compatíveis, preferindo nome exato. Não
 * escolhe silenciosamente quando há homônimos ou nomes parciais ambíguos. */
export async function findEmployeesByName(userId: string, name: string, status?: EmployeeStatus): Promise<Employee[]> {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
  const target = normalize(name);
  if (!target) return [];
  const employees = await getEmployeesByUser(userId, status);
  const exact = employees.filter(employee => normalize(employee.name) === target);
  if (exact.length) return exact;
  return employees.filter(employee => {
    const candidate = normalize(employee.name);
    return candidate.includes(target) || target.includes(candidate);
  });
}

/** Histórico de pagamentos vinculados aos funcionários. A própria despesa em
 * Finanças é a fonte de verdade; trocar/remover o funcionário atualiza este
 * histórico automaticamente, sem criar um segundo registro. */
export async function getEmployeePaymentsByUser(userId: string): Promise<Record<string, EmployeePayment[]>> {
  const { data, error } = await getSupabase()
    .from("finances")
    .select("id,employee_id,amount,description,date,pending,created_at")
    .eq("user_id", userId)
    .not("employee_id", "is", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[employees] getEmployeePaymentsByUser erro:", error.message);
    return {};
  }
  const grouped: Record<string, EmployeePayment[]> = {};
  for (const row of (data ?? []) as Array<{ id: string; employee_id: string; amount: number; description: string; date: string; pending: boolean }>) {
    const payment: EmployeePayment = {
      id: row.id,
      employeeId: row.employee_id,
      amount: Number(row.amount),
      description: row.description,
      date: row.date,
      status: row.pending ? "pending" : "posted",
    };
    (grouped[row.employee_id] ??= []).push(payment);
  }
  return grouped;
}
