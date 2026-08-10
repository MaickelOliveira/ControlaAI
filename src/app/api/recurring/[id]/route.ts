import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateRecurring, cancelRecurring } from "@/lib/recurring";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { amount, description, category, dayOfMonth, repeatUnit, totalInstallments } = body;

  const updated = await updateRecurring(id, session.sub, {
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

// Cancela (soft-delete) em vez de apagar de vez — mesmo comportamento do bot
// via WhatsApp (recurring_cancel), pra não ter duas semânticas diferentes
// pro mesmo botão "cancelar". O registro cancelado só some da lista (que já
// filtra status=active) mas continua no histórico, reversível se precisar.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const cancelled = await cancelRecurring(id, session.sub);
  if (!cancelled) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
