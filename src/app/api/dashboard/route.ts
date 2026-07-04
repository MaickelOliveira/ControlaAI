import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, getWppPhones, getMaxWppPhones } from "@/lib/users";
import { getBalance, getDailyTotals, getByCategory, getRecentTransactions } from "@/lib/finances";
import { getPendingTasks, getOverdueTasks } from "@/lib/tasks";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const personalBalance = getBalance(user.id, "personal", year, month);
  const businessBalance = getBalance(user.id, "business", year, month);
  const personalDailyTotals = getDailyTotals(user.id, "personal", 30);
  const businessDailyTotals = getDailyTotals(user.id, "business", 30);
  const personalExpCategories = getByCategory(user.id, "personal", "expense", year, month);
  const businessExpCategories = getByCategory(user.id, "business", "expense", year, month);
  const pendingTasks = getPendingTasks(user.id, user.activeMode);
  const overdueTasks = getOverdueTasks(user.id, user.activeMode);
  const recentTransactions = getRecentTransactions(user.id, user.activeMode, 5);

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, status: user.status, activeMode: user.activeMode, trialEndsAt: user.trialEndsAt, wppPhone: user.wppPhone ?? null, wppPhones: getWppPhones(user), maxWppPhones: getMaxWppPhones(user) },
    personal: { balance: personalBalance, dailyTotals: personalDailyTotals, expenseCategories: personalExpCategories },
    business: { balance: businessBalance, dailyTotals: businessDailyTotals, expenseCategories: businessExpCategories },
    tasks: { pendingCount: pendingTasks.length, overdueCount: overdueTasks.length, recent: pendingTasks.slice(0, 5) },
    recentTransactions,
  });
}
