import { readFileSync, existsSync } from "fs";
import { writeJSONAtomic } from "./json-store";
import path from "path";
import type { User } from "./users";

export type PlanPrices = { personal: number; business: number };

const FILE = path.join(process.cwd(), "data", "billing-config.json");
const DEFAULT_PRICES: PlanPrices = { personal: 0, business: 0 };

export function getPlanPrices(): PlanPrices {
  try {
    if (!existsSync(FILE)) return DEFAULT_PRICES;
    return { ...DEFAULT_PRICES, ...JSON.parse(readFileSync(FILE, "utf-8")) };
  } catch { return DEFAULT_PRICES; }
}

export function setPlanPrices(prices: PlanPrices): void {
  writeJSONAtomic(FILE, prices);
}

/** Preço mensal de um cliente: usa o valor negociado (priceOverride) se
 *  houver, senão o preço padrão do plano dele. */
export function priceForUser(user: User, prices: PlanPrices): number {
  return user.priceOverride ?? prices[user.plan];
}
