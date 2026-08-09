import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getUsers, isTrialExpired } from "@/lib/users";
import { getPlanPrices, setPlanPrices, priceForUser } from "@/lib/billing";

export async function GET() {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const prices = await getPlanPrices();
  const users = await getUsers();

  const activeUsers = users.filter(u => u.status === "active");
  const clientes = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.plan,
    status: isTrialExpired(u) ? "expired" : u.status,
    price: priceForUser(u, prices),
    isOverride: u.priceOverride !== undefined,
    activatedAt: u.activatedAt,
    deactivatedAt: u.deactivatedAt,
    trialEndsAt: u.trialEndsAt,
  })).sort((a, b) => b.price - a.price);

  const mrrByPlan = {
    personal: activeUsers.filter(u => u.plan === "personal").reduce((s, u) => s + priceForUser(u, prices), 0),
    business: activeUsers.filter(u => u.plan === "business").reduce((s, u) => s + priceForUser(u, prices), 0),
  };
  const countByPlan = {
    personal: activeUsers.filter(u => u.plan === "personal").length,
    business: activeUsers.filter(u => u.plan === "business").length,
  };

  const mrr = mrrByPlan.personal + mrrByPlan.business;
  const trialCount = users.filter(u => u.status === "trial" && !isTrialExpired(u)).length;
  const expiredCount = users.filter(u => u.status === "trial" && isTrialExpired(u)).length;
  const inactiveCount = users.filter(u => u.status === "inactive").length;
  const overrideCount = users.filter(u => u.priceOverride !== undefined).length;

  return NextResponse.json({
    prices,
    mrr,
    mrrByPlan,
    countByPlan,
    activeCount: activeUsers.length,
    trialCount,
    expiredCount,
    inactiveCount,
    overrideCount,
    clientes,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const personal = Number(body.personal);
  const business = Number(body.business);
  if (isNaN(personal) || isNaN(business) || personal < 0 || business < 0) {
    return NextResponse.json({ error: "Preços inválidos" }, { status: 400 });
  }

  await setPlanPrices({ personal, business });
  return NextResponse.json({ ok: true });
}
