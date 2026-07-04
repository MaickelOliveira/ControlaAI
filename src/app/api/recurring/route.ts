import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createRecurring, getRecurringByUser } from "@/lib/recurring";
import { todayStrBR } from "@/lib/date-br";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || undefined;
  const status = searchParams.get("status") || undefined;
  const items = getRecurringByUser(session.sub, mode, status);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { type, amount, totalAmount, category, description, mode, recurrenceType, totalInstallments, repeatUnit, dayOfMonth, startDate } = body;

  if (!type || !amount || !category || !description || !mode || !recurrenceType || !repeatUnit) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  const rec = createRecurring({
    userId: session.sub,
    type,
    amount: parseFloat(amount),
    totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
    category,
    description,
    mode,
    recurrenceType,
    totalInstallments: totalInstallments ? parseInt(totalInstallments) : undefined,
    repeatUnit,
    dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : undefined,
    startDate: startDate || todayStrBR(),
    source: "web",
  });

  return NextResponse.json(rec);
}
