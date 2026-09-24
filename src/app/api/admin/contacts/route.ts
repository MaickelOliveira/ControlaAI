import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createContact, getContactsByUser, updateContact } from "@/lib/contacts";
import { normalizePhoneInput } from "@/lib/phone";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "active" | "inactive" | undefined;
  const contacts = await getContactsByUser(session.sub, status || undefined);
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { name, phone, email, relation, notes } = await req.json();
  if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  const contact = await createContact({ userId: session.sub, name, phone: phone ? normalizePhoneInput(phone) : phone, email, relation, notes, status: "active" });
  return NextResponse.json(contact, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  if (patch.phone) patch.phone = normalizePhoneInput(patch.phone);
  const c = await updateContact(id, session.sub, patch);
  return c ? NextResponse.json(c) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}
