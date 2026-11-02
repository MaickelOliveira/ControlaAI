import type {BankOverview} from "./open-finance-display";
import {bankDate,bankMoney} from "./open-finance-display";
import {financeLoanInstallments} from "./finance-loan-installments";
import type {BankInstallmentAnchor} from "./bank-installment-projections";
import {ledgerAmount} from "./finance-ledger";
import {recurringInstallmentEnd,installmentEndMonth} from "./installment-progress";
import {descriptionsLikelyMatch,type RecurringTransaction} from "./recurring";
import type {ImportedInstallmentStatus} from "./finances";
import {hasZeroBankDebt} from "./bank-debt";
import {normalizeMerchantText} from "./merchant-text";

export type EndingCommitment={id:string;description:string;origin:string;amount:number|null;currency:string|null;endDate:string|null;monthOnly?:boolean;monthly:boolean};
const validDate=(value:string|null):value is string=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
function monthEnd(month:string){const [year,number]=month.split("-").map(Number);return `${month}-${String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,"0")}`;}
function shiftMonths(date:string,offset:number){const [year,month,day]=date.split("-").map(Number),first=new Date(Date.UTC(year,month-1+offset,1));const end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(day,end));return first.toISOString().slice(0,10);}

export function manualEndingCommitments(registered:readonly RecurringTransaction[],imported:readonly ImportedInstallmentStatus[]):EndingCommitment[]{
 const installments=registered.filter(row=>row.type==="expense"&&row.status==="active"&&row.recurrenceType==="installment"&&row.totalInstallments&&row.paidInstallments<row.totalInstallments);
 return [...installments.map(row=>({id:`manual:${row.id}`,description:row.description,origin:"Cadastro Zelo",amount:row.amount,currency:"BRL",endDate:recurringInstallmentEnd(row),monthly:row.repeatUnit==="monthly"})),
 ...imported.filter(row=>row.remaining>0&&!installments.some(manual=>manual.totalInstallments===row.total&&Math.abs(manual.amount-row.amount)<=.009&&descriptionsLikelyMatch(manual.description,row.description))).map((row,index)=>({id:`imported:${index}`,description:row.description,origin:"Fatura importada",amount:row.amount,currency:"BRL",endDate:validDate(row.date)?shiftMonths(row.date,row.remaining):null,monthly:true}))];
}

export function bankEndingCommitments(data:BankOverview,anchors:readonly BankInstallmentAnchor[],today:string):EndingCommitment[]{
 const active=new Set(data.connections.filter(c=>c.status==="active"&&!c.archived_at&&!c.revoked_at&&(!c.consent_expires_at||Date.parse(c.consent_expires_at)>Date.parse(`${today}T00:00:00Z`))).map(c=>c.id));
 const overview={...data,resources:data.resources.filter(r=>active.has(r.connection_id)&&!hasZeroBankDebt(r,data))};
 const from=`${today.slice(0,7)}-01`,to=monthEnd(today.slice(0,7));
 const loans=financeLoanInstallments(overview,[],{from,to},today).map(row=>({id:`credit:${row.resourceId}`,description:row.name,origin:`${row.category} · ${row.bank}`,amount:row.amount,currency:row.currency,endDate:row.finalDueDate??row.manualPlan?.last_due_date??null,monthly:!!row.manualPlan||overview.credit.find(c=>c.resource_id===row.resourceId)?.periodicity==="MENSAL"}));
 const available=new Set(overview.resources.filter(r=>r.resource_type==="card").map(r=>r.id));
 const represented=new Set<string>();
 const selected:BankInstallmentAnchor[]=[];
 // A current bank pattern can retain an old observed purchase month. That
 // linked month/ordinal still determines its final month; it does not prove payment.
 // Preserve the positively identified fragment groups already used by the statement.
 for(const group of overview.agenda?.items??[]){
  if(!group.source_schedule_ids?.length)continue;
  const linked=anchors.filter(a=>available.has(a.resource_id)&&group.source_schedule_ids!.includes(a.id)).sort((a,b)=>b.observed_installments-a.observed_installments||b.bill_month.localeCompare(a.bill_month));
  if(linked[0]){for(const id of group.source_schedule_ids)represented.add(id);selected.push({...linked[0],id:group.id,description:group.description});}
 }
 selected.push(...anchors.filter(a=>available.has(a.resource_id)&&!represented.has(a.id)));
 const uncertain=new Set<string>();
 for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
  const a=selected[i],b=selected[j],left=overview.agenda?.items.find(s=>s.id===a.id),right=overview.agenda?.items.find(s=>s.id===b.id);
  if(!left?.purchase_date||left.purchase_date!==right?.purchase_date||a.resource_id!==b.resource_id||a.total_installments!==b.total_installments||a.currency!==b.currency||a.observed_installments===b.observed_installments)continue;
  const names=[a.description,b.description].map(n=>normalizeMerchantText(n).replace(/ /g,"")).sort((x,y)=>x.length-y.length);
  const first=ledgerAmount(a.amount),second=ledgerAmount(b.amount),ordinals=[left.source_ordinals,right.source_ordinals];
  if(names[0].length<9||!names[1].startsWith(names[0])||first===null||second===null||Math.abs(first-second)>.20||Math.abs(first-second)>Math.min(first,second)*.02||ordinals.some(o=>!o?.length)||ordinals[0]!.some(n=>ordinals[1]!.includes(n)))continue;
  if(installmentEndMonth(a.bill_month,a.observed_installments,a.total_installments)!==installmentEndMonth(b.bill_month,b.observed_installments,b.total_installments))continue;
  // Incomplete fragment evidence is not enough to count a second obligation.
  // Keep the latest observation and disclose the unresolved older pattern.
  uncertain.add(a.observed_installments<b.observed_installments?a.id:b.id);
 }
 const cards:EndingCommitment[]=selected.map(row=>{
  represented.add(row.id);
  const final=installmentEndMonth(row.bill_month,row.observed_installments,row.total_installments);
  const end=final?monthEnd(`${final.slice(3)}-${final.slice(0,2)}`):null;
  return {id:`card:${row.id}`,description:row.description,origin:`Cartão · ${row.institution_name}`,amount:uncertain.has(row.id)?null:ledgerAmount(row.amount),currency:row.currency,endDate:end,monthOnly:true,monthly:true};
 });
 for(const row of overview.agenda?.items??[]){
  if(row.kind!=="installment"||!row.resource_id||!available.has(row.resource_id)||represented.has(row.id))continue;
  const final=installmentEndMonth(row.last_observed_month,row.last_observed_installment,row.total_installments);
  cards.push({id:`card:${row.id}`,description:row.description,origin:`Cartão · ${row.institution_name}`,amount:null,currency:row.currency,endDate:final?monthEnd(`${final.slice(3)}-${final.slice(0,2)}`):null,monthOnly:true,monthly:true});
 }
 return [...loans,...cards];
}

/** Only obligations ending by the inclusive cutoff contribute to monthly relief.
 * This is a schedule estimate, never payment confirmation or remaining principal. */
export function endingCommitmentsSummary(rows:readonly EndingCommitment[],today:string,cutoff:string){
 if(!validDate(today)||!validDate(cutoff))throw Error("ENDING_PERIOD_INVALID");
 const seen=new Set<string>(),items:EndingCommitment[]=[];let unquantified=0,totalCents=0;
 for(const row of rows){
  if(seen.has(row.id))continue;seen.add(row.id);
  if(validDate(row.endDate)&&(row.endDate<today||row.endDate.slice(0,7)>cutoff.slice(0,7)))continue;
  if(!validDate(row.endDate)){unquantified++;continue;}
  if(row.endDate>cutoff){if(row.monthOnly&&row.endDate.slice(0,7)===cutoff.slice(0,7))unquantified++;continue;}
  const cents=row.amount===null?null:Math.round(row.amount*100);
  if(!row.monthly||row.currency!=="BRL"||cents===null||!Number.isSafeInteger(cents)||cents<=0){unquantified++;continue;}
  items.push(row);totalCents+=cents;
 }
 return {items:items.sort((a,b)=>a.endDate!.localeCompare(b.endDate!)||a.description.localeCompare(b.description)),monthlyRelief:totalCents/100,unquantified};
}
const safe=(text:string)=>text.replace(/[\r\n*`_~<>]/g," ").slice(0,160);
export function formatEndingCommitments(rows:readonly EndingCommitment[],today:string,cutoff:string,label:string,partial=false,locale?:string){
 const {items,monthlyRelief,unquantified}=endingCommitmentsSummary(rows,today,cutoff),es=locale==="es";
 const lines=items.map(row=>`• ${safe(row.description)} — ${bankMoney(row.amount,"BRL")}/${es?"mes":"mês"}\n  ${safe(row.origin)} · ${es?"última":"última"}: ${row.monthOnly?`${row.endDate!.slice(5,7)}/${row.endDate!.slice(0,4)} (${es?"día no informado":"dia não informado"})`:bankDate(row.endDate)}`);
 return `${es?"📉 Reducción mensual prevista hasta":"📉 Redução mensal prevista até"} *${bankDate(cutoff)}* · ${safe(label)}\n\n*${bankMoney(monthlyRelief,"BRL")} ${es?"por mes":"por mês"}*${partial||unquantified?` (${es?"subtotal conocido":"subtotal conhecido"})`:""}\n\n${lines.join("\n\n")|| (es?"No encontré compromisos con valor y vencimiento final informados dentro de ese plazo.":"Não encontrei compromissos com valor e último vencimento informados dentro desse prazo.")}\n\n${es?"Solo suma cuotas y préstamos que terminan hasta esa fecha. Es una previsión conforme al calendario, no confirmación de pago.":"Soma apenas parcelas e empréstimos que terminam até essa data. É uma previsão conforme o cronograma, sem confirmar pagamentos."}${unquantified?`\n${unquantified} ${es?"compromiso(s) sin datos suficientes quedaron fuera del total.":"compromisso(s) sem dados suficientes ficaram fora do total."}`:""}${partial?`\n${es?"La consulta bancaria está incompleta o no estuvo disponible.":"A consulta bancária está incompleta ou não esteve disponível."}`:""}`;
}
