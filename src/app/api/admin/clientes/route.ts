import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { getUsers, isTrialExpired, createUser, getUserByEmail, updateUser } from "@/lib/users";
import { getFinancesByUser } from "@/lib/finances";
import { getTasksByUser } from "@/lib/tasks";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const users = getUsers();
  const now = new Date();

  const clientes = users.map(u => {
    const finances = getFinancesByUser(u.id);
    const tasks = getTasksByUser(u.id);
    const lastFinance = finances.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const lastActivity = lastFinance?.createdAt ?? u.createdAt;
    const isToday = new Date(lastActivity).toDateString() === now.toDateString();
    const trialExpired = isTrialExpired(u);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      wppPhone: (u as Record<string,unknown>).wppPhone ?? null,
      plan: u.plan,
      status: trialExpired ? "expired" : u.status,
      activeMode: u.activeMode,
      company: u.company,
      trialEndsAt: u.trialEndsAt,
      createdAt: u.createdAt,
      financesCount: finances.length,
      tasksCount: tasks.length,
      lastActivity,
      activeToday: isToday,
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const stats = {
    total: clientes.length,
    activeToday: clientes.filter(c => c.activeToday).length,
    trial: clientes.filter(c => c.status === "trial").length,
    active: clientes.filter(c => c.status === "active").length,
    expired: clientes.filter(c => c.status === "expired").length,
  };

  return NextResponse.json({ clientes, stats });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { name, email, password, phone, plan, company, isTrial, trialDays } = body;

  if (!name || !email || !password) return NextResponse.json({ error: "Nome, email e senha são obrigatórios" }, { status: 400 });
  if (getUserByEmail(email)) return NextResponse.json({ error: "Email já cadastrado" }, { status: 400 });

  const user = await createUser({ name, email, password, phone: phone || "", plan: plan || "personal", company });

  if (!isTrial) {
    // Ativo imediatamente (sem trial)
    updateUser(user.id, { status: "active" });
  } else if (trialDays && trialDays !== 14) {
    // Trial com prazo customizado
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + Number(trialDays));
    updateUser(user.id, { trialEndsAt: trialEnd.toISOString() });
  }

  return NextResponse.json({ ok: true, id: user.id });
}
