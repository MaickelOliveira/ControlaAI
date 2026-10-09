import type { PolpSnapshot } from "@/lib/polp-sandbox";
import { reconcilePolpSnapshot, type ExistingEntry, type Reconciliation } from "@/lib/polp-reconciliation";

export type PreviewRow = Reconciliation & { id:string; name:string; date:string; amount:unknown; credit:boolean; origin:string; installment?:string };
export type PreviewLedger = Record<string,"imported" | "linked" | "ignored">;

export function money(value:unknown):string {
  const object = value && typeof value === "object" ? value as Record<string,unknown> : null;
  const amount = object ? object.amount : value;
  if ((typeof amount !== "string" && typeof amount !== "number") || amount === "" || !Number.isFinite(Number(amount))) return "Não informado";
  const currency = typeof object?.currency === "string" ? object.currency : "BRL";
  if (!/^[A-Z]{3}$/.test(currency)) return "Não informado";
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency}).format(Number(amount));
}

export function recordValue(value:unknown, ...paths:string[]):unknown {
  for (const path of paths) {
    let current:unknown = value;
    for (const part of path.split(".")) current = current && typeof current === "object" ? (current as Record<string,unknown>)[part] : undefined;
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return null;
}

export function text(value:unknown):string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "Não informado";
}

/** One clearly labelled fictitious AI record lets the owner try reconciliation.
 * No existing Zelo data is queried and all decisions live only in React state. */
export function previewRows(snapshot:PolpSnapshot):PreviewRow[] {
  const example = snapshot.accountTransactions.find(tx => tx.credit_debit_type === "DEBITO" && !/fatura|transfer/i.test(tx.transaction_name));
  const existing:ExistingEntry[] = example ? [{id:"preview-ai-example",type:"expense",amount:Number(example.transaction_amount.amount),date:example.transaction_date_time,description:example.transaction_name,mode:"personal",source:"ai"}] : [];
  const matches = new Map(reconcilePolpSnapshot(snapshot,existing).map(row=>[row.sourceId,row]));
  const rows = [
    ...snapshot.accountTransactions.map(tx=>({id:`account:${tx.accountId}:${tx.id}`,name:tx.transaction_name,date:tx.transaction_date_time,amount:tx.transaction_amount,credit:tx.credit_debit_type === "CREDITO",origin:"Conta bancária"})),
    ...snapshot.cardTransactions.map(tx=>({id:`card:${tx.cardId}:${tx.id}`,name:tx.transaction_name,date:tx.transaction_date_time,amount:tx.brazilian_amount,credit:tx.credit_debit_type === "CREDITO",origin:"Cartão",installment:tx.charge_identificator && tx.charge_number ? `${tx.charge_identificator}/${tx.charge_number}` : undefined})),
  ];
  return rows.flatMap(row=>{
    const match = matches.get(row.id);
    return match ? [{...row,...match,reason:match.matchingFinanceIds.includes("preview-ai-example") ? "Exemplo fictício de compra já registrada pela IA" : match.reason}] : [];
  }).filter((row,index,all)=>all.findIndex(other=>other.id===row.id)===index).sort((a,b)=>b.date.localeCompare(a.date));
}

export function applyPreviewAction(ledger:PreviewLedger,row:PreviewRow,action:"import" | "link" | "ignore"):PreviewLedger {
  if (ledger[row.id]) return ledger;
  if (action === "import" && row.status !== "new") return ledger;
  if (action === "link" && (row.status !== "review" || !row.matchingFinanceIds.length)) return ledger;
  return {...ledger,[row.id]:action === "import" ? "imported" : action === "link" ? "linked" : "ignored"};
}
