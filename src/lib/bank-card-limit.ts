import { bankMoney, type BankLimit } from "./open-finance-display";

export type DisplayCardLimit = BankLimit & { displayCount: number };

function cents(value: BankLimit["total_amount"]): bigint | null {
  const raw = String(value ?? "");
  if (!/^-?\d{1,16}(\.\d{1,8})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const rounded = BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2)) + (Number(fraction[2] ?? 0) >= 5 ? BigInt(1) : BigInt(0));
  return raw.startsWith("-") ? -rounded : rounded;
}

/** Warn on inconsistent source numbers; never rewrite a bank-reported limit. */
export function cardLimitAmountsDisagree(limit: BankLimit): boolean {
  const total = cents(limit.total_amount), used = cents(limit.used_amount), available = cents(limit.available_amount);
  if (total === null || used === null || available === null) return false;
  const difference = total - used - available;
  return difference > BigInt(1) || difference < BigInt(-1);
}

// Compare decimal values exactly; display rounding must not hide different limits.
function decimalKey(value: BankLimit["total_amount"]): string | null | undefined {
  if (value === null) return null;
  const raw = String(value);
  if (raw.length > 100 || !/^-?\d+(\.\d+)?$/.test(raw)) return undefined;
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const decimals = fraction.replace(/0+$/, "");
  return `${raw.startsWith("-") && (integer !== "0" || decimals) ? "-" : ""}${integer}${decimals ? `.${decimals}` : ""}`;
}

/** Fold identical labelled source rows for display only. Never add credit or alter history. */
export function displayCardLimits(limits: readonly BankLimit[]): DisplayCardLimit[] {
  const groups = new Map<string, DisplayCardLimit>();
  const result: DisplayCardLimit[] = [];
  for (const line of limits) {
    const amounts = [line.total_amount, line.used_amount, line.available_amount].map(decimalKey);
    const key = line.line_name?.trim() && amounts.every(amount => amount !== undefined)
      ? JSON.stringify([line.resource_id, line.line_name.trim(), line.consolidation_type, line.currency, ...amounts, line.is_flexible])
      : null;
    const previous = key ? groups.get(key) : undefined;
    if (previous) previous.displayCount++;
    else {
      const display = { ...line, displayCount: 1 };
      result.push(display);
      if (key) groups.set(key, display);
    }
  }
  return result;
}

/** One labelled line, never a sum of potentially shared limits. */
export function headlineCardLimit(limits: readonly BankLimit[]): BankLimit | undefined {
  const rank = (line: BankLimit) => {
    const known = bankMoney(line.available_amount, line.currency) !== "Não informado";
    const positive = known && !String(line.available_amount).startsWith("-") && /[1-9]/.test(String(line.available_amount));
    const purchases = /CREDITO[_ ]A[_ ]VISTA|COMPRA|CREDIT[_ ]LIMIT/i.test(line.line_name ?? "");
    return (positive ? 4 : known ? 2 : 0) + (purchases ? 1 : 0);
  };
  return [...limits].sort((a, b) => rank(b) - rank(a))[0];
}
