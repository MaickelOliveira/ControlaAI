import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllRemindersByUser, createReminder, deleteReminder, updateReminder } from "@/lib/reminders";
import { getUserById } from "@/lib/users";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(getAllRemindersByUser(session.sub));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { message, scheduledAt, repeat } = await req.json();
  if (!message || !scheduledAt) return NextResponse.json({ error: "message e scheduledAt obrigatórios" }, { status: 400 });

  const user = getUserById(session.sub);
  const phone = user?.wppPhone || user?.phone || "";

  const r = createReminder({ userId: session.sub, message, phone, scheduledAt, repeat: repeat || "none" });
  return NextResponse.json(r, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const r = updateReminder(id, session.sub, patch);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  deleteReminder(id, session.sub);
  return NextResponse.json({ ok: true });
}
