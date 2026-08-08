import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCustomer, getCustomersByUser, updateCustomer } from "@/lib/customers";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "active" | "inactive" | undefined;
  const customers = getCustomersByUser(session.sub, status || undefined);
  return NextResponse.json({ customers });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { name, phone, email, company, address, notes } = await req.json();
  if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  const customer = createCustomer({ userId: session.sub, name, phone, email, company, address, notes, status: "active" });
  return NextResponse.json(customer, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const c = updateCustomer(id, session.sub, patch);
  return c ? NextResponse.json(c) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}
