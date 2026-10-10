import {bankResourceName,type BankOverview} from "./open-finance-display";
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
