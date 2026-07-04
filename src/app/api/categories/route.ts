import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, updateUser } from "@/lib/users";

const DEFAULT_EXPENSE = ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Lazer", "Vestuário", "Tecnologia", "Serviços", "Impostos", "Funcionários", "Marketing", "Fornecedores", "Outros"];
const DEFAULT_INCOME = ["Salário", "Freelance", "Vendas", "Investimentos", "Aluguel", "Serviços", "Reembolso", "Outros"];

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  return NextResponse.json({
    expense: [...DEFAULT_EXPENSE, ...(user.customCategoriesExpense || [])],
    income: [...DEFAULT_INCOME, ...(user.customCategoriesIncome || [])],
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { type, name } = await req.json();
  if (!type || !name || !name.trim()) return NextResponse.json({ error: "type e name obrigatórios" }, { status: 400 });
  if (type !== "expense" && type !== "income") return NextResponse.json({ error: "type inválido" }, { status: 400 });

  const user = getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const trimmed = name.trim();
  const defaults = type === "expense" ? DEFAULT_EXPENSE : DEFAULT_INCOME;
  const existing = type === "expense"
    ? (user.customCategoriesExpense || [])
    : (user.customCategoriesIncome || []);

  if ([...defaults, ...existing].some(c => c.toLowerCase() === trimmed.toLowerCase())) {
    return NextResponse.json({ error: "Categoria já existe" }, { status: 409 });
  }

  const updated = [...existing, trimmed];
  if (type === "expense") {
    updateUser(session.sub, { customCategoriesExpense: updated });
  } else {
    updateUser(session.sub, { customCategoriesIncome: updated });
  }

  return NextResponse.json({ ok: true, name: trimmed });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { type, name } = await req.json();
  if (!type || !name) return NextResponse.json({ error: "type e name obrigatórios" }, { status: 400 });

  const user = getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const existing = type === "expense"
    ? (user.customCategoriesExpense || [])
    : (user.customCategoriesIncome || []);
  const filtered = existing.filter(c => c !== name);

  if (type === "expense") {
    updateUser(session.sub, { customCategoriesExpense: filtered });
  } else {
    updateUser(session.sub, { customCategoriesIncome: filtered });
  }

  return NextResponse.json({ ok: true });
}
