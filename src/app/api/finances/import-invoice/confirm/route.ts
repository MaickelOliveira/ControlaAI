import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addFinance, getBalance } from "@/lib/finances";

type ImportItem = { date: string; description: string; amount: number; category: string };

/** Registra de fato os lançamentos da fatura que o usuário confirmou na prévia
 *  (/api/finances/import-invoice) — cada um vira uma despesa avulsa. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const mode = body.mode === "business" ? "business" : "personal";
  const items: ImportItem[] = Array.isArray(body.items) ? body.items : [];

  const valid = items.filter(i =>
    i && typeof i.amount === "number" && i.amount > 0 &&
    typeof i.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.date) &&
    typeof i.description === "string" && typeof i.category === "string"
  );

  if (valid.length === 0) return NextResponse.json({ error: "Nenhum lançamento válido para importar" }, { status: 400 });

  for (const item of valid) {
    addFinance({
      userId: session.sub,
      type: "expense",
      amount: item.amount,
      category: item.category || "Outros",
      description: item.description || "Lançamento da fatura",
      date: item.date,
      mode,
      source: "web",
    });
  }

  const now = new Date();
  const balance = getBalance(session.sub, mode, now.getFullYear(), now.getMonth() + 1);

  return NextResponse.json({ imported: valid.length, balance });
}
