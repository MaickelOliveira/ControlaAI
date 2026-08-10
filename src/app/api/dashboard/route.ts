import { NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { getMaxWppPhones } from "@/lib/users";
import { getPhonesForUser } from "@/lib/wpp-phone-links";
import { getFinancesByUser, isPostedFinance, type Finance, type FinanceMode } from "@/lib/finances";
import { getTasksByUser } from "@/lib/tasks";

export async function GET() {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { user } = auth;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [finances, tasks, phoneLinks] = await Promise.all([
    getFinancesByUser(user.id),
    getTasksByUser(user.id, user.activeMode),
    getPhonesForUser(user.id),
  ]);

  const posted = finances.filter(isPostedFinance);
  const inMonth = (finance: Finance) => {
    const date = new Date(finance.date + "T12:00:00");
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  };
  const balanceFor = (mode: FinanceMode) => {
    const items = posted.filter(finance => finance.mode === mode && inMonth(finance));
    const income = items.filter(finance => finance.type === "income").reduce((sum, finance) => sum + finance.amount, 0);
    const expense = items.filter(finance => finance.type === "expense").reduce((sum, finance) => sum + finance.amount, 0);
    return { income, expense, balance: income - expense };
  };
  const dailyFor = (mode: FinanceMode) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const totals = new Map<string, { income: number; expense: number }>();
    for (const finance of posted.filter(item => item.mode === mode && new Date(item.date + "T12:00:00") >= cutoff)) {
      const current = totals.get(finance.date) ?? { income: 0, expense: 0 };
      current[finance.type] += finance.amount;
      totals.set(finance.date, current);
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, totals]) => ({ date, ...totals }));
  };
  const categoriesFor = (mode: FinanceMode) => posted
    .filter(finance => finance.mode === mode && finance.type === "expense" && inMonth(finance))
    .reduce<Record<string, number>>((totals, finance) => {
      totals[finance.category] = (totals[finance.category] ?? 0) + finance.amount;
      return totals;
    }, {});

  const personalBalance = balanceFor("personal");
  const businessBalance = balanceFor("business");
  const personalDailyTotals = dailyFor("personal");
  const businessDailyTotals = dailyFor("business");
  const personalExpCategories = categoriesFor("personal");
  const businessExpCategories = categoriesFor("business");
  const pendingTasks = tasks.filter(task => task.status !== "completed").sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = pendingTasks.filter(task => task.dueDate && task.dueDate < today);
  const recentTransactions = posted.filter(finance => finance.mode === user.activeMode).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

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
