import type {BankAgendaItem} from "./open-finance-schedules";
import {normalizeMerchantText} from "./merchant-text";
import type {BankMovement} from "./open-finance-report";

export type ScheduledBankInstallment=BankMovement & {schedule_ids:string[];synced_at:string};
export type BankInstallmentAnchor={purchase_date?:string|null;user_category?:string|null;id:string;resource_id:string;description:string;resource_name:string;institution_name:string;institution_id?:string|null;amount:string;currency:string|null;bill_month:string;observed_installments:number;total_installments:number;synced_at:string};
export type BankInstallmentProjection=BankInstallmentAnchor & {month:string;position:number;total:number;observed:boolean;source_schedule_ids?:string[];category_movement_id?:string};

function monthIndex(value:string):number|null {
  const match=/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(value);
  return match?Number(match[1])*12+Number(match[2])-1:null;
}
function monthLabel(index:number):string {
  const year=Math.floor(index/12),month=index%12+1;
  return `${year}-${String(month).padStart(2,"0")}`;
}
function validAmount(value:string):boolean {return /^\d{1,16}(?:\.\d{1,8})?$/.test(value)&&Number(value)>0;}

/** Only a linked, recently observed bill month can anchor a future estimate. */
export function projectBankInstallments(anchors:readonly BankInstallmentAnchor[],received:readonly BankMovement[],range:{from:string;to:string;today:string},scheduled:readonly ScheduledBankInstallment[]=[]):BankInstallmentProjection[]{
  const from=monthIndex(range.from),to=monthIndex(range.to),currentMonth=monthIndex(range.today);
  if(from===null||to===null||currentMonth===null||to<from)return [];
  const projections:BankInstallmentProjection[]=[];
  const known=scheduledInstallmentForecasts(anchors,scheduled,received,range);
  projections.push(...known.items);
  for(const anchor of anchors){
    if(known.represented.has(anchor.id))continue;
    const base=monthIndex(anchor.bill_month);
    const {observed_installments:observed,total_installments:total}=anchor;
    if(base===null||base<currentMonth-2||base>currentMonth+1||!Number.isInteger(observed)||!Number.isInteger(total)||observed<1||total<observed||total>1000||!validAmount(anchor.amount)||!anchor.currency||!/^[A-Z]{3}$/.test(anchor.currency))continue;
    const first=Math.max(observed,observed+from-base,observed+currentMonth-base);
    const last=Math.min(total,observed+to-base);
    for(let position=first;position<=last;position++){
      const month=monthLabel(base+position-observed);
      const [year,monthNumber]=month.split("-").map(Number);
      const monthEnd=`${month}-${String(new Date(Date.UTC(year,monthNumber,0)).getUTCDate()).padStart(2,"0")}`;
      if(`${month}-01`<range.from||monthEnd>range.to)continue;
      const alreadyReceived=received.some(movement=>movement.resource_id===anchor.resource_id&&movement.installment_number===position&&movement.installment_count===total&&movement.currency===anchor.currency&&movement.amount!==null&&Number(movement.amount)===Number(anchor.amount)&&(movement.bill_month??movement.date).slice(0,7)===month);
      if(!alreadyReceived)projections.push({...anchor,month,position,total,observed:position===observed});
    }
  }
  return projections.sort((a,b)=>a.month.localeCompare(b.month)||a.description.localeCompare(b.description)||a.id.localeCompare(b.id));
}

const purchaseName=(description:string)=>normalizeMerchantText(description.replace(/\s+\d+\s*\/\s*\d+\s*$/,""));
function fullMonth(month:string,range:{from:string;to:string}){
 const [year,number]=month.split("-").map(Number);
 return `${month}-01`>=range.from&&`${month}-${String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,"0")}`<=range.to;
}
/** Bank-provided future bill rows retain their exact amounts, including rounding.
 * Only a unique monthly numbered sequence may fill its missing future months.
 * Purchase date and resource keep separate purchases at one merchant separate. */
function scheduledInstallmentForecasts(anchors:readonly BankInstallmentAnchor[],scheduled:readonly ScheduledBankInstallment[],received:readonly BankMovement[],range:{from:string;to:string;today:string}){
 const groups=new Map<string,ScheduledBankInstallment[]>(),seen=new Set<string>(),represented=new Set<string>(),items:BankInstallmentProjection[]=[];
 const current=monthIndex(range.today)!,from=monthIndex(range.from)!,to=monthIndex(range.to)!;
 for(const row of scheduled){
  const month=row.bill_month?monthIndex(row.bill_month):null,position=row.installment_number,total=row.installment_count;
  if(seen.has(row.id)||!row.resource_id||month==null||month<current||row.direction!=="debit"||row.resource_type!=="card"||row.amount===null||!validAmount(row.amount)||!row.currency||!/^[A-Z]{3}$/.test(row.currency)||!Number.isInteger(position)||!Number.isInteger(total)||!position||!total||position>total||total<2||total>1000)continue;
  seen.add(row.id);
  const key=JSON.stringify([row.resource_id,month-position+1,purchaseName(row.description),total,row.currency]);
  const group=groups.get(key)??[];group.push(row);groups.set(key,group);
 }
 for(const group of groups.values()){
  group.sort((a,b)=>a.installment_number!-b.installment_number!||a.id.localeCompare(b.id));
  const first=group[0],total=first.installment_count!,scheduleIds=[...new Set(group.flatMap(row=>row.schedule_ids))];
  const linked=anchors.filter(anchor=>scheduleIds.includes(anchor.id));
  for(const anchor of linked)represented.add(anchor.id);
  const scheduleId=linked[0]?.id??scheduleIds[0],id=scheduleId??`movement:${first.id}`;
  const start=monthIndex(first.bill_month!)!-first.installment_number!+1;
  const unique=new Set(group.map(row=>row.installment_number)).size===group.length;
  const identified=new Set(group.map(row=>row.date)).size===1||first.schedule_ids.some(id=>group.every(row=>row.schedule_ids.includes(id)));
  const monthly=unique&&identified&&group.every(row=>monthIndex(row.bill_month!)!-row.installment_number!+1===start);
  const fallback=linked[0],description=fallback?.description??first.description.replace(/\s+\d+\s*\/\s*\d+\s*$/,""),category=fallback?.user_category??first.user_category;
  const make=(row:ScheduledBankInstallment,position:number,month:string,exact:boolean):BankInstallmentProjection=>({
   id,resource_id:row.resource_id!,description,resource_name:row.resource_name,institution_name:row.institution_name,institution_id:row.institution_id,
   amount:row.amount!,currency:row.currency,bill_month:first.bill_month!,observed_installments:first.installment_number!,total_installments:total,synced_at:row.synced_at,
   purchase_date:row.date,user_category:exact?row.user_category??category:category,month,position,total,observed:exact,source_schedule_ids:scheduleIds,
   ...(!scheduleId?{category_movement_id:row.id}:{})
  });
  if(!monthly){
   // Ambiguous same-day purchases remain individual bank facts; no guessed series.
   for(const row of group){const month=row.bill_month!.slice(0,7);if(fullMonth(month,range)&&!received.some(m=>m.id===row.id))items.push({...make(row,row.installment_number!,month,true),id:`movement:${row.id}`,category_movement_id:row.id});}
   continue;
  }
  for(let position=Math.max(1,from-start+1,current-start+1);position<=Math.min(total,to-start+1);position++){
   const month=monthLabel(start+position-1);
   if(!fullMonth(month,range))continue;
   const exact=group.find(row=>row.installment_number===position);
   if(exact?received.some(m=>m.id===exact.id):received.some(m=>m.resource_id===first.resource_id&&m.date===first.date&&purchaseName(m.description)===purchaseName(first.description)&&m.installment_number===position&&m.installment_count===total&&(m.bill_month??m.date).slice(0,7)===month))continue;
   items.push(make(exact??first,position,month,!!exact));
  }
 }
 return {items,represented};
}

/** Reuse only the positively linked fragment groups of the bank overview. */
export function linkScheduledBankInstallments(rows:readonly ScheduledBankInstallment[],schedules:readonly BankAgendaItem[]):ScheduledBankInstallment[]{
 return rows.map(row=>{
  let groups=schedules.filter(item=>item.kind==="installment"&&item.resource_id===row.resource_id&&row.schedule_ids.some(id=>item.id===id||item.source_schedule_ids?.includes(id)));
  if(!groups.length)groups=schedules.filter(item=>item.kind==="installment"&&item.resource_id===row.resource_id&&item.purchase_date===row.date&&item.total_installments===row.installment_count&&purchaseName(item.description)===purchaseName(row.description)&&(!item.currency||item.currency===row.currency)&&item.amount!==null&&Math.abs(Number(item.amount)-Number(row.amount))<=0.20);
  if(groups.length!==1)return row;
  const group=groups[0];
  return {...row,description:group.description,user_category:row.user_category??group.user_category,schedule_ids:group.source_schedule_ids??[group.id]};
 });
}
