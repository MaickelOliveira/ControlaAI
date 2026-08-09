import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addFinance, getFinancesByUser, getFinancesInRange, getBalance, isPostedFinance } from "@/lib/finances";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") as "personal" | "business" | undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    if (from || to) {
      // Filtro de período customizado (Dashboard/Finanças com filtros ativos)
      // — saldo calculado a partir do MESMO array retornado, pra cards,
      // gráfico de categoria e extrato nunca terem escopos de data diferentes.
      const finances = (await getFinancesInRange(session.sub, mode || undefined, from, to))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const posted = finances.filter(isPostedFinance);
      const income = posted.filter(f => f.type === "income").reduce((s, f) => s + f.amount, 0);
      const expense = posted.filter(f => f.type === "expense").reduce((s, f) => s + f.amount, 0);
      return NextResponse.json({ finances, balance: { income, expense, balance: income - expense } });
    }

    // Sem período — comportamento padrão (mês atual), mantido pra quem não filtra.
    const finances = (await getFinancesByUser(session.sub, mode || undefined))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const now = new Date();
    const balance = await getBalance(session.sub, mode || "personal", now.getFullYear(), now.getMonth() + 1);

    return NextResponse.json({ finances, balance });
  } catch {
    return NextResponse.json({ finances: [], balance: { income: 0, expense: 0, balance: 0 } });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { type, amount, category, description, date, mode } = body;

  if (!type || !amount || !category) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });

  const finance = await addFinance({
    userId: session.sub,
    type, amount: parseFloat(amount), category,
    description: description || category,
    date: date || new Date().toISOString().slice(0, 10),
    mode: mode || "personal",
    source: "web",
  });

  return NextResponse.json(finance, { status: 201 });
}
