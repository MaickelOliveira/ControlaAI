import type {BankMovement} from "./open-finance-report";
import type {BankFinancialData} from "./open-finance-report";
import {bankCategory,type BankCategory} from "./bank-category";
export type FinanceLedgerData={finances:LedgerEntry[];balance:{income:number;expense:number;balance:number};totalBalance:{income:number;expense:number;balance:number};bank:BankFinancialData|null};
export type RecordedFinance = {id:string;type:string;amount:number;category:string;description:string;date:string;mode:string;source?:"whatsapp"|"web";status?:string;createdAt?:string};
export type LedgerEntry = Omit<RecordedFinance,"source"> & {source:"whatsapp"|"web"|"bank";included:boolean;possibleDuplicate:boolean;bank?:BankMovement;categorySource?:BankCategory["source"]};
export function ledgerAmount(value:string|null):number|null {
  if(value===null||! /^-?\d{1,16}(\.\d{1,8})?$/.test(value))return null;
  const [whole,fraction=""]=value.replace(/^-/ ,"").split(".");
  const cents=BigInt(whole)*BigInt(100)+BigInt((fraction+"00").slice(0,2))+(Number(fraction[2]??0)>=5?BigInt(1):BigInt(0));
  return cents<=BigInt(Number.MAX_SAFE_INTEGER)?Number(cents)/100*(value.startsWith("-")?-1:1):null;
}
export function createFinanceLedger(records:readonly RecordedFinance[],movements:readonly BankMovement[],mode:string):LedgerEntry[] {
  const entries:LedgerEntry[]=records.filter(f=>f.mode===mode).map(f=>({...f,source:f.source??"web",included:f.status!=="pending"&&Number.isFinite(f.amount),possibleDuplicate:false}));
  const knownIds=new Set<string>();
  for(const bank of movements){
    if(knownIds.has(bank.id))continue;knownIds.add(bank.id);
    const amount=ledgerAmount(bank.amount);
    const refund=bank.resource_type==="card"&&bank.direction==="credit";
    const included=amount!==null&&amount>=0&&bank.currency==="BRL"&&bank.kind!=="excluded"&&(bank.direction==="debit"||bank.direction==="credit");
    const category=bankCategory(bank);
    entries.push({id:`bank:${bank.id}`,type:refund||bank.direction!=="credit"?"expense":"income",amount:(amount??0)*(refund?-1:1),category:category.name,categorySource:category.source,description:bank.description,date:bank.date,mode,source:"bank",status:"posted",included,possibleDuplicate:false,bank});
  }
  // A same amount/date is a clue, not identity. Never remove records based on it.
  const signature=(e:LedgerEntry)=>`${e.date}|${e.type}|${Math.round(e.amount*100)}`;
  const manualKeys=new Set(entries.filter(e=>e.source!=="bank"&&e.included).map(signature));
  const bankKeys=new Set(entries.filter(e=>e.source==="bank"&&e.included).map(signature));
  for(const e of entries)e.possibleDuplicate=e.included&&(e.source==="bank"?manualKeys:bankKeys).has(signature(e));
  return entries.sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt??"").localeCompare(a.createdAt??"")||a.id.localeCompare(b.id));
}
export function ledgerBalance(entries:readonly LedgerEntry[]) {
  let income=0,expense=0;
  for(const entry of entries)if(entry.included&&entry.status!=="pending"){
    const cents=Math.round(entry.amount*100);
    if(entry.type==="income")income+=cents;else if(entry.type==="expense")expense+=cents;
  }
  return {income:income/100,expense:expense/100,balance:(income-expense)/100};
}
export function financeOrigin(entry:LedgerEntry):string {
  return entry.source==="bank"?`${entry.bank?.resource_type==="card"?"Cartão":"Conta"} · ${entry.bank?.institution_name}`:entry.source==="whatsapp"?"WhatsApp":"Plataforma";
}
/** Signed amounts: credit card refunds stay negative instead of disappearing from charts. */
export function ledgerExpenseGroups(entries:readonly LedgerEntry[],groupBy:"origin"|"category") {
  const totals=new Map<string,number>();
  for(const entry of entries)if(entry.included&&entry.status!=="pending"&&entry.type==="expense"){
    const name=groupBy==="category"?entry.category:entry.source==="bank"?(entry.bank?.resource_type==="card"?"Cartões":"Contas bancárias"):entry.source==="whatsapp"?"WhatsApp":"Plataforma";
    totals.set(name,(totals.get(name)??0)+Math.round(entry.amount*100));
  }
  return [...totals].map(([name,cents])=>({name,value:cents/100}));
}
