import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createGoal, getGoalsByUser, updateGoalAmount, updateGoalStatus } from "@/lib/goals";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") as "personal" | "business" | undefined;
  return NextResponse.json(getGoalsByUser(session.sub, mode || undefined));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { title, targetAmount, currentAmount, deadline, category, mode } = await req.json();
  if (!title || !targetAmount) return NextResponse.json({ error: "title e targetAmount obrigatórios" }, { status: 400 });
  const goal = createGoal({ userId: session.sub, title, targetAmount, currentAmount: currentAmount || 0, deadline, category: category || "Geral", mode: mode || "personal", status: "active" });
  return NextResponse.json(goal, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id, addAmount, status } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  if (addAmount !== undefined) {
    const goal = updateGoalAmount(id, session.sub, addAmount);
    return goal ? NextResponse.json(goal) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  if (status) {
    const goal = updateGoalStatus(id, session.sub, status);
    return goal ? NextResponse.json(goal) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ error: "Nenhuma atualização" }, { status: 400 });
}
