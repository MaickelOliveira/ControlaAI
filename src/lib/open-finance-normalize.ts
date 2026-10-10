import "server-only";
import { createHash } from "node:crypto";
import { polpExternalId, polpObject, type PolpObject } from "./polp-production";
export const INVESTMENT_FAMILIES = ["bank-fixed-incomes","credit-fixed-incomes","funds","treasure-titles","variable-incomes"] as const;
export const RESOURCE_FAMILIES = ["accounts","credit-cards","loans","financings",...INVESTMENT_FAMILIES] as const;
export type ResourceFamily = typeof RESOURCE_FAMILIES[number];
export function sourceText(value: unknown, max = 200): string | null { return typeof value === "string" ? value.slice(0,max) : null; }
function object(value: unknown): PolpObject { return value == null ? {} : polpObject(value); }
export function sourceDate(value: unknown): string | null {
  const text = sourceText(value, 40)?.slice(0,10);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text) || text < "1900-01-01") return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== text) throw new Error("INVALID_DATE");
  return text;
}
function money(value: unknown): { amount: string | null; currency: string | null } {
  if (value == null) return { amount: null, currency: null };
  const item = polpObject(value), amount = String(item.amount);
  if (!/^-?\d{1,16}(\.\d{1,8})?$/.test(amount) || typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency)) throw new Error("INVALID_AMOUNT");
  return { amount, currency: item.currency };
}
function currencyOf(...values: ReturnType<typeof money>[]): string | null {
  const codes = [...new Set(values.map(v=>v.currency).filter(Boolean))];
  if (codes.length>1) throw new Error("MIXED_CURRENCIES");
  return codes[0] ?? null;
}
export function normalizeResource(family: ResourceFamily, row: PolpObject): PolpObject {
  const balance = object(row.balance);
  const available = money(balance.available_amount), gross = money(balance.gross_amount), net = money(balance.net_amount);
  const kind = family === "accounts" ? "account" : family === "credit-cards" ? "card" : family === "loans" ? "loan" : family === "financings" ? "financing" : "investment";
  const paymentMethods = Array.isArray(row.payment_methods) ? row.payment_methods : [];
  const last4 = paymentMethods.length === 1 ? sourceText(object(paymentMethods[0]).identification_number) : null;
  return { external_id: polpExternalId(row.id), external_consent_id: sourceText(row.consent_id), resource_type: kind,
    name: sourceText(row.name ?? row.product_name ?? row.ticker ?? row.type ?? family,250), subtype: family,
    card_network: sourceText(row.credit_card_network,100), identification_last4: last4 && /^\d{4}$/.test(last4) ? last4 : null,
    currency: currencyOf(available,gross,net), available_amount: available.amount, gross_amount: gross.amount, net_amount: net.amount,
    valuation_date: sourceDate(balance.reference_date ?? balance.reference_date_time), source_updated_at: sourceText(row.updated_at,40) };
}
export function normalizeLimits(card: PolpObject): PolpObject[] {
  if (card.limits == null) return [];
  if (!Array.isArray(card.limits) || card.limits.length>100) throw new Error("INVALID_LIMITS");
  return card.limits.map(value => {
    const l=polpObject(value), total=money(l.limit_amount), used=money(l.used_amount), available=money(l.available_amount), customized=money(l.customized_limit_amount);
    const currency=currencyOf(total,used,available,customized);
    if (!currency) throw new Error("LIMIT_CURRENCY_UNKNOWN");
    return { resource_external_id:polpExternalId(card.id), line_key:createHash("sha256").update(JSON.stringify([l.identification_number,l.consolidation_type,l.credit_line_limit_type,l.line_name])).digest("hex"), line_name:sourceText(l.line_name,100), consolidation_type:sourceText(l.consolidation_type,100), limit_type:sourceText(l.credit_line_limit_type,100), currency, total_amount:total.amount, used_amount:used.amount, available_amount:available.amount, customized_amount:customized.amount, is_flexible:typeof l.is_limit_flexible==="boolean"?l.is_limit_flexible:null, source_updated_at:sourceText(l.updated_at ?? card.updated_at,40) };
  });
}
export function normalizeMovements(family: string, resourceId: string, rows: PolpObject[]): PolpObject[] {
  const account=family==="accounts", card=family==="credit-cards";
  const ownerField=account?"account_id":card?"credit_card_id":family.replace(/s$/," ").trim().replace(/-/g,"_")+"_id";
  return rows.map(row => {
    if (row[ownerField] !== resourceId) throw new Error("RESOURCE_MISMATCH");
    const value=money(account?row.transaction_amount:card?row.brazilian_amount:row.transaction_net_value ?? row.transaction_value ?? row.transaction_gross_value);
    const original=card?money(row.amount):money(null), type=sourceText(card?row.transaction_type:row.type,100), category=sourceText(row.category_ref);
    const direction=account || card ? row.credit_debit_type==="DEBITO"?"debit":row.credit_debit_type==="CREDITO"?"credit":"unknown" : "unknown";
    const classification=!account&&!card?"investment":type==="PAGAMENTO_FATURA"||category==="CREDIT_CARD_PAYMENT"?"bill_payment":category==="ACCOUNT_TRANSFER"?"transfer":card&&type==="COMPRA"?"purchase":"unknown";
    const month=sourceText(row.bill_forecast_date,7);
    return { resource_external_id:resourceId, resource_type:account?"account":card?"card":"investment", external_id:polpExternalId(row.id), description:sourceText(row.transaction_name ?? row.transaction_type ?? type ?? "Movimentação",1000), transaction_date:sourceDate(family==="funds"?row.transaction_conversion_date:row.transaction_date_time ?? row.transaction_date), amount:value.amount?.replace(/^-/," ").trim() ?? null, currency:value.currency, original_amount:original.amount?.replace(/^-/," ").trim() ?? null, original_currency:original.currency, direction, classification, source_type:type, source_category:category,
      bill_month:card&&month&&/^\d{4}-\d{2}$/.test(month)?sourceDate(`${month}-01`):null, bill_external_id:card?sourceText(row.bill_id):null,
      installment_number:Number.isInteger(row.charge_identificator)?row.charge_identificator:null, installment_count:Number.isInteger(row.charge_number)?row.charge_number:null, source_updated_at:sourceText(row.updated_at,40) };
  });
}
export function normalizeBills(cardId: string, rows: PolpObject[]): PolpObject[] {
  return rows.map(row=>{
    if (row.credit_card_id!==cardId) throw new Error("RESOURCE_MISMATCH");
    const total=money(row.bill_total_amount), minimum=money(row.bill_minimum_amount);
    return { resource_external_id:cardId,external_id:polpExternalId(row.id),currency:currencyOf(total,minimum),due_date:sourceDate(row.due_date),total_amount:total.amount,minimum_payment_amount:minimum.amount,installment_allowed:typeof row.is_instalment==="boolean"?row.is_instalment:null,status:"unknown",source_updated_at:sourceText(row.updated_at,40) };
  });
}
export function normalizeCredit(family: "loans" | "financings", row: PolpObject): PolpObject {
  const payments=object(row.payments), schedule=object(row.scheduled_instalments);
  const makeMoney=(value:unknown)=>money(value==null?null:{amount:value,currency:row.currency});
  const contract=makeMoney(row.contract_amount), outstanding=makeMoney(payments.contract_outstanding_balance), next=makeMoney(family==="loans"?row.next_instalment_amount:null);
  return { resource_external_id:polpExternalId(row.id),resource_type:family==="loans"?"loan":"financing",currency:currencyOf(contract,outstanding,next),contract_amount:contract.amount,outstanding_amount:outstanding.amount,next_installment_amount:next.amount,paid_installments:Number.isInteger(schedule.paid_instalments)?schedule.paid_instalments:null,remaining_installments:Number.isInteger(schedule.contract_remaining_number)?schedule.contract_remaining_number:null,due_date:sourceDate(row.due_date),source_updated_at:sourceText(row.updated_at,40) };
}
