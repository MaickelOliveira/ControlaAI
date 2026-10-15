import type {BankMovement} from "./open-finance-report";

export type BankInstallmentAnchor={id:string;resource_id:string;description:string;resource_name:string;institution_name:string;institution_id?:string|null;amount:string;currency:string|null;bill_month:string;observed_installments:number;total_installments:number;synced_at:string};
export type BankInstallmentProjection=BankInstallmentAnchor & {month:string;position:number;total:number;observed:boolean};

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
export function projectBankInstallments(anchors:readonly BankInstallmentAnchor[],received:readonly BankMovement[],range:{from:string;to:string;today:string}):BankInstallmentProjection[]{
  const from=monthIndex(range.from),to=monthIndex(range.to),currentMonth=monthIndex(range.today);
  if(from===null||to===null||currentMonth===null||to<from)return [];
  const projections:BankInstallmentProjection[]=[];
  for(const anchor of anchors){
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
