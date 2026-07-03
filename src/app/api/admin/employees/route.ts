import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createEmployee, getEmployeesByUser, updateEmployee, getTotalPayroll } from "@/lib/employees";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "active" | "inactive" | undefined;
  const employees = getEmployeesByUser(session.sub, status || undefined);
  const totalPayroll = getTotalPayroll(session.sub);
  return NextResponse.json({ employees, totalPayroll });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { name, role, salary, startDate, phone, email, notes } = await req.json();
  if (!name || !role) return NextResponse.json({ error: "Nome e cargo obrigatórios" }, { status: 400 });
  const employee = createEmployee({
    userId: session.sub, name, role,
    salary: parseFloat(salary) || 0,
    startDate: startDate || new Date().toISOString().slice(0, 10),
    status: "active", phone, email, notes,
  });
  return NextResponse.json(employee, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  if (patch.salary) patch.salary = parseFloat(patch.salary);
  const e = updateEmployee(id, session.sub, patch);
  return e ? NextResponse.json(e) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}
