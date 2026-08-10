import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, getMaxWppPhones } from "@/lib/users";
import { getPhonesForUser } from "@/lib/wpp-phone-links";
import { getBalance, getDailyTotals, getByCategory, getRecentTransactions } from "@/lib/finances";
import { getPendingTasks, getOverdueTasks } from "@/lib/tasks";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = await getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    personalBalance, businessBalance,
    personalDailyTotals, businessDailyTotals,
    personalExpCategories, businessExpCategories,
    pendingTasks, overdueTasks, recentTransactions, phoneLinks,
  ] = await Promise.all([
    getBalance(user.id, "personal", year, month),
    getBalance(user.id, "business", year, month),
    getDailyTotals(user.id, "personal", 30),
    getDailyTotals(user.id, "business", 30),
    getByCategory(user.id, "personal", "expense", year, month),
    getByCategory(user.id, "business", "expense", year, month),
    getPendingTasks(user.id, user.activeMode),
    getOverdueTasks(user.id, user.activeMode),
    getRecentTransactions(user.id, user.activeMode, 5),
    getPhonesForUser(user.id),
  ]);

  const wppPhones = phoneLinks.map(link => link.phone);
  const wppPhoneNames = Object.fromEntries(phoneLinks.filter(link => link.name).map(link => [link.phone, link.name]));
  const wppPhoneRelations = Object.fromEntries(phoneLinks.filter(link => link.relation).map(link => [link.phone, link.relation]));
  const wppPhoneAccess = Object.fromEntries(phoneLinks.map(link => [link.phone, link.access]));

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, status: user.status, activeMode: user.activeMode, trialEndsAt: user.trialEndsAt, wppPhone: wppPhones[0] ?? null, wppPhones, wppPhoneNames, wppPhoneRelations, wppPhoneAccess, maxWppPhones: getMaxWppPhones(user) },
    personal: { balance: personalBalance, dailyTotals: personalDailyTotals, expenseCategories: personalExpCategories },
    business: { balance: businessBalance, dailyTotals: businessDailyTotals, expenseCategories: businessExpCategories },
    tasks: { pendingCount: pendingTasks.length, overdueCount: overdueTasks.length, recent: pendingTasks.slice(0, 5) },
    recentTransactions,
  });
}
