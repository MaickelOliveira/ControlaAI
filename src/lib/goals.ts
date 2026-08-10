import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type GoalStatus = "active" | "completed" | "cancelled";
export type GoalMode = "personal" | "business";

export type Goal = {
  id: string;
  userId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  category: string;
  mode: GoalMode;
  status: GoalStatus;
  createdAt: string;
};

type Row = {
  id: string; user_id: string; title: string; target_amount: number; current_amount: number;
  deadline: string | null; category: string; mode: GoalMode; status: GoalStatus; created_at: string;
};

function fromRow(r: Row): Goal {
  return {
    id: r.id, userId: r.user_id, title: r.title, targetAmount: Number(r.target_amount),
    currentAmount: Number(r.current_amount), deadline: r.deadline ?? undefined, category: r.category,
    mode: r.mode, status: r.status, createdAt: r.created_at,
  };
}

export async function createGoal(data: Omit<Goal, "id" | "createdAt">): Promise<Goal> {
  const row = {
    id: randomUUID(), user_id: data.userId, title: data.title, target_amount: data.targetAmount,
    current_amount: data.currentAmount, deadline: data.deadline, category: data.category,
    mode: data.mode, status: data.status,
  };
  const { data: inserted, error } = await getSupabase().from("goals").insert(row).select("*").single();
  if (error) throw new Error(`[goals] createGoal falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getGoalsByUser(userId: string, mode?: GoalMode): Promise<Goal[]> {
  let query = getSupabase().from("goals").select("*").eq("user_id", userId);
  if (mode) query = query.eq("mode", mode);
  const { data, error } = await query;
  if (error) { console.error("[goals] getGoalsByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function getActiveGoals(userId: string, mode?: GoalMode): Promise<Goal[]> {
  return (await getGoalsByUser(userId, mode)).filter(g => g.status === "active");
}

export async function updateGoalAmount(id: string, userId: string, amount: number): Promise<Goal | null> {
  const { data: current, error: readError } = await getSupabase().from("goals").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (readError || !current) return null;
  const row = current as Row;
  const newAmount = Math.min(Number(row.current_amount) + amount, Number(row.target_amount));
  const newStatus = newAmount >= Number(row.target_amount) ? "completed" : row.status;
  const { data, error } = await getSupabase().from("goals").update({ current_amount: newAmount, status: newStatus }).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function updateGoalStatus(id: string, userId: string, status: GoalStatus): Promise<Goal | null> {
  const { data, error } = await getSupabase().from("goals").update({ status }).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** Retorna TODAS as metas ativas cujo título bate — call-sites (add/complete/
 *  cancel) precisam saber quando há mais de uma candidata (ex: duas metas
 *  "viagem") pra desambiguar com o usuário em vez de aplicar a ação na
 *  primeira que aparecer (bug real: silenciosamente somava valor na meta
 *  errada quando havia duas com título parecido). Só metas ativas — não faz
 *  sentido adicionar valor ou concluir de novo uma já concluída/cancelada. */
export async function findGoalsByTitle(userId: string, title: string, mode?: GoalMode): Promise<Goal[]> {
  if (!title) return [];
  const lower = title.toLowerCase();
  return (await getActiveGoals(userId, mode)).filter(g => g.title?.toLowerCase().includes(lower));
}

export async function findGoalByTitle(userId: string, title: string, mode?: GoalMode): Promise<Goal | null> {
  return (await findGoalsByTitle(userId, title, mode))[0] ?? null;
}

export function getGoalProgress(goal: Goal): number {
  if (goal.targetAmount === 0) return 100;
  return Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
}

export function formatGoalDeadline(goal: Goal): string {
  if (!goal.deadline) return "Sem prazo";
  const d = new Date(goal.deadline + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
