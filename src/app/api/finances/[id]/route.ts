import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteFinance, updateFinance } from "@/lib/finances";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { amount, category, description, date } = body;

  const updated = updateFinance(id, session.sub, {
    ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
    ...(category ? { category } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(date ? { date } : {}),
  });

  if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const ok = deleteFinance(id, session.sub);
  if (!ok) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
