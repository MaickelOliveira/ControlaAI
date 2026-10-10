export type BankResource = { id: string; connection_id: string; resource_type: "account" | "card" | "investment" | "loan" | "financing" | "reserve"; name: string; subtype: string | null; card_network: string | null; identification_last4: string | null; currency: string | null; available_amount: string | number | null; gross_amount: string | number | null; net_amount: string | number | null; valuation_date: string | null; synced_at: string };
export type BankConnection = { id: string; institution_name: string; status: string; provider_status: string | null; scopes: string[]; consent_expires_at: string | null; revoked_at: string | null; last_successful_sync_at: string | null; created_at: string; sync_notes?:string[] };
export type BankLimit = { id: string; resource_id: string; line_name: string | null; consolidation_type: string | null; currency: string; total_amount: string | number | null; used_amount: string | number | null; available_amount: string | number | null; is_flexible: boolean | null };
export type BankBill = { id: string; resource_id: string; currency: string | null; due_date: string | null; total_amount: string | number | null; minimum_payment_amount: string | number | null; status: string };
export type BankCredit = { resource_id: string; currency: string | null; contract_amount: string | number | null; outstanding_amount: string | number | null; next_installment_amount: string | number | null; due_date: string | null };
export type BankOverview = { connections: BankConnection[]; resources: BankResource[]; limits: BankLimit[]; bills: BankBill[]; credit: BankCredit[]; sync: Array<{ status: string; last_successful_sync_at: string | null; covered_from: string | null; covered_to: string | null }>; truncated?:boolean; connectAvailable?: boolean; contactEmail?:string };
export function bankResourceName(name:string):string {
  const names:Record<string,string>={CONTA_DEPOSITO_A_VISTA:"Conta corrente",CONTA_POUPANCA:"Poupança",CONTA_PAGAMENTO_PRE_PAGA:"Conta de pagamento",CONTA_PAGAMENTO_POS_PAGA:"Cartão de crédito"};
  return names[name]||name;
}
export function bankMoney(value: string | number | null | undefined, currency: string | null | undefined): string {
  if (value == null || !currency || !/^[A-Z]{3}$/.test(currency) || !/^-?\d+(\.\d+)?$/.test(String(value))) return "Não informado";
  if(String(value).length>100)return "Não informado";
  try {
    const formatter=new Intl.NumberFormat("pt-BR",{style:"currency",currency});
    const decimals=formatter.resolvedOptions().maximumFractionDigits??2;
    const [integer,fraction=""]=String(value).replace(/^-/ ,"").split(".");
    const scale=BigInt(10)**BigInt(decimals);
    let units=BigInt(integer)*scale+BigInt((fraction+"0".repeat(decimals)).slice(0,decimals)||"0");
    if(Number(fraction[decimals]??"0")>=5)units++;
    const whole=units/scale,negative=String(value).startsWith("-");
    const signed=negative?(whole===BigInt(0)?-0:-whole):whole;
    return formatter.formatToParts(signed).map(part=>part.type==="fraction"?(units%scale).toString().padStart(decimals,"0"):part.value).join("");
  } catch { return "Não informado"; }
}
export function bankDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "Não informado";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
export function matchesBank(bank: { name: string; organizationName?: string; parentOrganizationName?: string }, query: string): boolean {
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase().trim();
  return normalize([bank.name, bank.organizationName, bank.parentOrganizationName].join(" ")).includes(normalize(query));
}
export const BANK_CATEGORIES: Record<string, string> = { ACCOUNT: "Dados da conta", CREDIT_CARD_ACCOUNT: "Cartão de crédito", CREDIT_OPERATIONS: "Operações de Crédito", INVESTMENTS: "Dados de investimento" };
export const BANK_STATUSES: Record<string, string> = { pending: "Aguardando autorização", active: "Autorizado", expired: "Expirado", revoking: "Cancelamento em andamento", revoked: "Cancelado", error: "Não autorizado" };
export type BankAuthorization = { authorizationUrl: string | null; authorizationPending?: boolean; authorizationHost?: string; authorizationExpired?: boolean };
