import type {FinanceLedgerData,LedgerEntry} from "./finance-ledger";
import {bankResourceName} from "./open-finance-display";
export type FinanceAccountOption={value:string;label:string};
export function financeAccountKey(entry:LedgerEntry):string {
 return entry.source==="bank"?(entry.bank?.resource_id?`bank:${entry.bank.resource_id}`:"unlinked"):(entry.accountId?`manual:${entry.accountId}`:"unlinked");
}
export function matchesFinanceAccount(entry:LedgerEntry,account?:string):boolean {return !account||financeAccountKey(entry)===account;}
/** IDs preserve distinct accounts even when two banks or people reuse a name. */
export function financeAccountOptions(data:FinanceLedgerData|null):FinanceAccountOption[] {
 if(!data)return [];
 const options=new Map<string,FinanceAccountOption>();
 for(const account of data.accounts??[])options.set(`manual:${account.id}`,{value:`manual:${account.id}`,label:`${account.name} · ${account.type==="credit_card"?"Cartão manual":"Conta manual"}`});
 for(const resource of data.bank?.overview.resources??[]){
  if(resource.resource_type!=="account"&&resource.resource_type!=="card")continue;
  const bank=data.bank?.overview.connections.find(c=>c.id===resource.connection_id);
  const value=`bank:${resource.id}`,label=`${bank?.institution_name??"Banco"} · ${bankResourceName(resource.name)}${resource.identification_last4?` · final ${resource.identification_last4}`:""}${bank&&bank.status!=="active"?" · Histórico":""}`;
  options.set(value,{value,label});
 }
 for(const entry of data.finances){
  const value=financeAccountKey(entry);
  if(!options.has(value))options.set(value,{value,label:value==="unlinked"?"Sem conta identificada":entry.source==="bank"?`${entry.bank?.institution_name??"Banco"} · ${entry.bank?.resource_name??"Conta"} · Histórico`:"Conta manual fora da lista"});
 }
 const labels=new Map<string,number>();
 return [...options.values()].map(option=>{const count=(labels.get(option.label)??0)+1;labels.set(option.label,count);return count>1?{...option,label:`${option.label} (${count})`}:option;});
}
