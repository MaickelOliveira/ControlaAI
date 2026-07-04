import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateRecurring, cancelRecurring, deleteRecurring } from "@/lib/recurring";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { amount, description, category, dayOfMonth, repeatUnit, totalInstallments } = body;

  const updated = updateRecurring(id, session.sub, {
    ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
    ...(dayOfMonth !== undefined ? { dayOfMonth: parseInt(dayOfMonth) } : {}),
    ...(repeatUnit ? { repeatUnit } : {}),
    ...(totalInstallments !== undefined ? { totalInstallments: parseInt(totalInstallments) } : {}),
  });

  if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const ok = deleteRecurring(id, session.sub);
  if (!ok) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
