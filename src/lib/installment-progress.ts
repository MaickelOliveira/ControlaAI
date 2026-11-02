/** A numbered bank charge is an observation, not confirmation of payment. */
export function installmentEndMonth(month:string|null|undefined,position:number|null|undefined,total:number|null|undefined):string|null{
 if(!month||!/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(month)||!Number.isInteger(position)||!Number.isInteger(total)||position!<1||total!<position!||total!>1000)return null;
 const [year,number]=month.slice(0,7).split("-").map(Number);
 const final=new Date(Date.UTC(year,number-1+total!-position!,1));
 return `${String(final.getUTCMonth()+1).padStart(2,"0")}/${final.getUTCFullYear()}`;
}
export function recurringInstallmentEnd(row:{nextDueDate:string;paidInstallments:number;totalInstallments?:number;repeatUnit:string;dayOfMonth?:number}):string|null{
 const remaining=(row.totalInstallments??0)-row.paidInstallments;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(row.nextDueDate)||!Number.isInteger(remaining)||remaining<1||remaining>1000)return null;
 const date=new Date(`${row.nextDueDate}T00:00:00Z`);
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.nextDueDate)return null;
 const offset=remaining-1,[year,month,day]=row.nextDueDate.split("-").map(Number);
 if(row.repeatUnit==="monthly"||row.repeatUnit==="yearly"){
  const final=new Date(Date.UTC(year,month-1+offset*(row.repeatUnit==="yearly"?12:1),1));
  const last=new Date(Date.UTC(final.getUTCFullYear(),final.getUTCMonth()+1,0)).getUTCDate();
  final.setUTCDate(Math.min(row.dayOfMonth??day,last));return final.toISOString().slice(0,10);
 }
 if(row.repeatUnit!=="daily"&&row.repeatUnit!=="weekly")return null;
 date.setUTCDate(date.getUTCDate()+offset*(row.repeatUnit==="weekly"?7:1));return date.toISOString().slice(0,10);
}
