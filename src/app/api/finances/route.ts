import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addFinance, calculateFinanceBalance, getAllTimeBalance, getFinancesByUser, getFinancesInRange, getBalance } from "@/lib/finances";

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
      const selectedMode = mode || "personal";
      const [periodFinances, totalBalance] = await Promise.all([
        getFinancesInRange(session.sub, selectedMode, from, to),
        getAllTimeBalance(session.sub, selectedMode),
      ]);
      const finances = periodFinances.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return NextResponse.json({ finances, balance: calculateFinanceBalance(finances), totalBalance });
    }

    // Sem período — comportamento padrão (mês atual), mantido pra quem não filtra.
    const finances = (await getFinancesByUser(session.sub, mode || undefined))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const now = new Date();
    const balance = await getBalance(session.sub, mode || "personal", now.getFullYear(), now.getMonth() + 1);

    return NextResponse.json({ finances, balance, totalBalance: calculateFinanceBalance(finances) });
  } catch {
    const emptyBalance = { income: 0, expense: 0, balance: 0 };
    return NextResponse.json({ finances: [], balance: emptyBalance, totalBalance: emptyBalance });
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
