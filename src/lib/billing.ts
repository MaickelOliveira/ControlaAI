import { getSupabase } from "./supabase";
import type { User } from "./users";

export type PlanPrices = { personal: number; business: number };

const DEFAULT_PRICES: PlanPrices = { personal: 0, business: 0 };

export async function getPlanPrices(): Promise<PlanPrices> {
  const { data, error } = await getSupabase().from("billing_config").select("personal, business").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_PRICES;
  const row = data as { personal: number; business: number };
  return { personal: Number(row.personal), business: Number(row.business) };
}

export async function setPlanPrices(prices: PlanPrices): Promise<void> {
  await getSupabase().from("billing_config").upsert({ id: 1, personal: prices.personal, business: prices.business });
}

/** Preço mensal de um cliente: usa o valor negociado (priceOverride) se
 *  houver, senão o preço padrão do plano dele. */
export function priceForUser(user: User, prices: PlanPrices): number {
  return user.priceOverride ?? prices[user.plan];
}
