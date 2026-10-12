import type { BankOverview, BankResource } from "./open-finance-display";
import { normalizeMerchantText } from "./merchant-text";

/** Hide only a confirmed exact zero, never missing data or a rounded small debt. */
export function hasZeroBankDebt(resource: BankResource, data: BankOverview): boolean {
  if (resource.resource_type !== "loan" && resource.resource_type !== "financing") return false;
  const amount = data.credit.find(c => c.resource_id === resource.id)?.outstanding_amount;
  return amount != null && /^-?0+(?:\.0+)?$/.test(String(amount));
}

/** Purpose aliases match the bank's product name, not unrelated personal loans. */
export function matchesBankDebtPurpose(resource: BankResource, keyword?: string): boolean {
  if (!keyword) return true;
  const name = normalizeMerchantText(resource.name).replace(/_/g, " ");
  const target = normalizeMerchantText(keyword);
  if (/^(carro|veiculo|automovel)$/.test(target)) return /\b(?:carros?|veiculos?|automoveis|automovel|utilitarios?)\b/.test(name);
  if (/^(casa|imovel|habitacao)$/.test(target)) return /\b(?:casas?|imoveis|imovel|habitacao|habitacional|residencial)\b/.test(name);
  if (/^(moto|motocicleta)$/.test(target)) return /\b(?:motos?|motocicletas?)\b/.test(name);
  return name.includes(target);
}
