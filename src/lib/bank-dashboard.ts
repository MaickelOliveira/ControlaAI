import {bankResourceName,type BankOverview} from "./open-finance-display";
import {bankDebtCategory,hasZeroBankDebt} from "./bank-debt";
import {normalizeBankText} from "./bank-question-parser";
function amountUnits(raw:string|null):bigint|null{
  if(raw===null||! /^-?\d{1,16}(\.\d{1,8})?$/.test(raw))return null;
  const [whole,fraction=""]=raw.replace(/^-/ ,"").split(".");
  return (BigInt(whole)*BigInt(100000000)+BigInt((fraction+"00000000").slice(0,8)))*(raw.startsWith("-")?BigInt(-1):BigInt(1));
}
function unitsText(units:bigint):string{
  const absolute=units<BigInt(0)?-units:units;
  return `${units<BigInt(0)?"-":""}${absolute/BigInt(100000000)}.${String(absolute%BigInt(100000000)).padStart(8,"0")}`;
}
export function bankDashboardAccounts(overview:BankOverview){
  const totals=new Map<string,bigint>();
  const groups=new Map<string,{currency:string;total:string|null;missing:number;accounts:Array<{id:string;name:string;amount:number|null;rawAmount:string|null}>}>();
  for(const resource of overview.resources.filter(r=>r.resource_type==="account")){
    const currency=resource.currency??"Não informada",group=groups.get(currency)??{currency,total:null,missing:0,accounts:[]};
    const rawAmount=resource.available_amount==null?null:String(resource.available_amount),units=amountUnits(rawAmount);
    const bank=overview.connections.find(c=>c.id===resource.connection_id)?.institution_name??"Banco";
    group.accounts.push({id:resource.id,name:`${bank} · ${bankResourceName(resource.name)}`,amount:units===null?null:Number(rawAmount),rawAmount:units===null?null:rawAmount});
    if(units===null)group.missing++;else {const total=(totals.get(currency)??BigInt(0))+units;totals.set(currency,total);group.total=unitsText(total);}
    groups.set(currency,group);
  }
  return [...groups.values()];
}

export type BankLoanFilters={type?:string;categories?:readonly string[];account?:string;search?:string};
/** Contract positions are separate from posted expenses and have no payment date. */
export function bankDashboardLoans(overview:BankOverview,filters:BankLoanFilters={}){
  if(filters.type==="income"||(filters.account&&!filters.account.startsWith("bank:")))return [];
  const groups=new Map<string,{category:string;currency:string|null;total:string|null;missing:number;loans:Array<{id:string;name:string;bank:string;institutionId?:string;kind:string;amount:number|null;rawAmount:string|null;contractAmount:string|number|null;nextInstallment:string|number|null;finalDueDate:string|null;historical:boolean}>}>();
  const totals=new Map<string,bigint>(),seen=new Set<string>();
  const query=normalizeBankText(filters.search??"");
  for(const resource of overview.resources){
    if((resource.resource_type!=="loan"&&resource.resource_type!=="financing")||hasZeroBankDebt(resource,overview)||seen.has(resource.id))continue;
    const category=bankDebtCategory(resource);
    if(filters.categories?.length&&!filters.categories.includes(category))continue;
    const connection=overview.connections.find(c=>c.id===resource.connection_id);
    if(connection?.archived_at||(filters.account&&filters.account!==`bank:${resource.id}`))continue;
    const credit=overview.credit.find(c=>c.resource_id===resource.id);
    const bank=connection?.institution_name??"Banco conectado",name=bankResourceName(resource.name);
    const kind=resource.resource_type==="financing"?"Financiamento":"Empréstimo";
    if(query&&!normalizeBankText(`${name} ${bank} ${kind}`).includes(query))continue;
    seen.add(resource.id);
    const currency=credit?.currency??null,key=`${category}:${currency??"unknown"}`;
    const group=groups.get(key)??{category,currency,total:null,missing:0,loans:[]};
    const raw=credit?.outstanding_amount==null?null:String(credit.outstanding_amount),units=amountUnits(raw);
    const valid=units!==null&&units>=BigInt(0);
    group.loans.push({id:resource.id,name,bank,institutionId:connection?.institution_id,kind,amount:valid?Number(raw):null,rawAmount:valid?raw:null,contractAmount:credit?.contract_amount??null,nextInstallment:credit?.next_installment_amount??null,finalDueDate:credit?.due_date??null,historical:!!connection&&connection.status!=="active"});
    if(!valid)group.missing++;
    else {const total=(totals.get(key)??BigInt(0))+units;totals.set(key,total);group.total=unitsText(total);}
    groups.set(key,group);
  }
  return [...groups.values()];
}
