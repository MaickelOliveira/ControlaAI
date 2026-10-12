import { bankMoney, type BankLimit } from "./open-finance-display";

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
