import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { confirmRecurring } from "@/lib/recurring";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const result = confirmRecurring(id, session.sub);
  if (!result) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(result);
}
