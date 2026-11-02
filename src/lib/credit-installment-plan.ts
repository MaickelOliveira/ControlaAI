export type CreditInstallmentPlan={resource_id:string;amount:string;currency:string;first_due_date:string;last_due_date:string};
function validDate(value:unknown):value is string{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<"1900-01-01")return false;
 const date=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validCreditPlan(plan:unknown):plan is CreditInstallmentPlan{
 if(!plan||typeof plan!=="object")return false;
 const p=plan as CreditInstallmentPlan;
 if(typeof p.resource_id!=="string"||typeof p.amount!=="string"||!/^\d{1,10}(\.\d{1,2})?$/.test(p.amount)||Number(p.amount)<=0||!Number.isSafeInteger(Math.round(Number(p.amount)*100))||typeof p.currency!=="string"||!/^[A-Z]{3}$/.test(p.currency)||!validDate(p.first_due_date)||!validDate(p.last_due_date)||p.last_due_date<p.first_due_date)return false;
 const a=p.first_due_date.split("-").map(Number),b=p.last_due_date.split("-").map(Number);
 return (b[0]-a[0])*12+b[1]-a[1]<600;
}
/** Each month retains the first due day, clamped to the end of shorter months.
 * The last date is an inclusive boundary, never an inferred payment. */
export function creditPlanDates(plan:CreditInstallmentPlan,from:string,to:string):string[]{
 if(!validCreditPlan(plan))return [];
 const [year,month,day]=plan.first_due_date.split("-").map(Number),dates:string[]=[];
 for(let offset=0;offset<600;offset++){
  const first=new Date(Date.UTC(year,month-1+offset,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  first.setUTCDate(Math.min(day,last));
  const date=first.toISOString().slice(0,10);
  if(date>plan.last_due_date||date>to)break;
  if(date>=from)dates.push(date);
 }
 return dates;
}

/** Accept Brazilian grouping/comma decimals and ungrouped dot decimals. */
export function creditPlanAmount(value:string):string{
 const text=value.trim();
 if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text))return text.replace(/\./g,"").replace(",",".");
 return /^\d+(?:[,.]\d{1,2})?$/.test(text)?text.replace(",","."):"";
}
