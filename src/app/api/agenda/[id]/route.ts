import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateAppointment, deleteAppointment } from "@/lib/agenda";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const updated = updateAppointment(id, session.sub, body);
  if (!updated) return NextResponse.json({ error: "Compromisso não encontrado" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const ok = deleteAppointment(id, session.sub);
  if (!ok) return NextResponse.json({ error: "Compromisso não encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
