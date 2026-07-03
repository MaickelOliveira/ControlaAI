import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addFinance, getFinancesByUser, getBalance } from "@/lib/finances";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") as "personal" | "business" | undefined;
  const finances = getFinancesByUser(session.sub, mode || undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const now = new Date();
  const balance = getBalance(session.sub, mode || "personal", now.getFullYear(), now.getMonth() + 1);

  return NextResponse.json({ finances, balance });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { type, amount, category, description, date, mode } = body;

  if (!type || !amount || !category) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });

  const finance = addFinance({
    userId: session.sub,
    type, amount: parseFloat(amount), category,
    description: description || category,
    date: date || new Date().toISOString().slice(0, 10),
    mode: mode || "personal",
    source: "web",
  });

  return NextResponse.json(finance, { status: 201 });
}
