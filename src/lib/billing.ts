import { getSupabase } from "./supabase";
import type { User } from "./users";

export type PlanPrices = { monthly: number; semiannual: number; annual: number };

const DEFAULT_PRICES: PlanPrices = { monthly: 47, semiannual: 39.66, annual: 29.70 };

export async function getPlanPrices(): Promise<PlanPrices> {
  const { data, error } = await getSupabase().from("billing_config").select("monthly, semiannual, annual").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_PRICES;
  const row = data as PlanPrices;
  return { monthly: Number(row.monthly), semiannual: Number(row.semiannual), annual: Number(row.annual) };
}

export async function setPlanPrices(prices: PlanPrices): Promise<void> {
  await getSupabase().from("billing_config").upsert({ id: 1, monthly: prices.monthly, semiannual: prices.semiannual, annual: prices.annual });
}

/** Preço mensal de um cliente: usa o valor negociado (priceOverride) se
 *  houver, senão o preço padrão do plano dele. */
export function priceForUser(user: User, prices: PlanPrices): number {
  return user.priceOverride ?? prices[user.billingCycle];
}
