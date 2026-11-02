"use client";
import {useEffect,useRef,useState} from "react";
import BankLogo from "./BankLogo";
import {bankDate,bankMoney} from "@/lib/open-finance-display";
import type {LoanInstallment} from "@/lib/finance-loan-installments";
import {creditPlanAmount,creditPlanDates,creditPlanFirstDueDate,validCreditPlan} from "@/lib/credit-installment-plan";

export default function FinanceLoanRows({items,mode,canEdit=false,onSaved}:{items:readonly LoanInstallment[];mode?:string;canEdit?:boolean;onSaved?:()=>Promise<void>}){
 const [target,setTarget]=useState<LoanInstallment|null>(null),[amount,setAmount]=useState(""),[currency,setCurrency]=useState(""),[first,setFirst]=useState(""),[last,setLast]=useState(""),[count,setCount]=useState("");
 const dialog=useRef<HTMLElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 useEffect(()=>{if(target)return ()=>returnFocus.current?.focus();},[target]);
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 function open(item:LoanInstallment){
  returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setTarget(item);setAmount(item.bankAmount!=null?String(item.bankAmount):item.manualPlan?.amount??"");setCurrency(item.currency??item.manualPlan?.currency??"");
  const end=item.finalDueDate??item.manualPlan?.last_due_date??"";
  const quantity=item.bankTotalInstallments??(item.manualPlan?creditPlanDates(item.manualPlan,item.manualPlan.first_due_date,item.manualPlan.last_due_date).length:item.totalInstallments);
  setCount(quantity?String(quantity):"");setFirst(item.bankTotalInstallments&&item.finalDueDate?creditPlanFirstDueDate(end,item.bankTotalInstallments):item.manualPlan?.first_due_date??creditPlanFirstDueDate(end,quantity??0));setLast(end);setError("");
 }
 const plan={resource_id:target?.resourceId??target?.id??"",amount:creditPlanAmount(amount),currency,first_due_date:first,last_due_date:last};
 const dates=validCreditPlan(plan)?creditPlanDates(plan,first,last):[];
 async function save(event:React.FormEvent){
  event.preventDefault();if(!validCreditPlan(plan)){setError("Confira o valor e os vencimentos.");return;}
  setSaving(true);setError("");
  try{
   const response=await fetch(`/api/open-finance/credit-plan?mode=${encodeURIComponent(mode??"")}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(plan)});
   const body=await response.json();if(!response.ok)throw Error(body.error||"Não foi possível salvar.");
   try{await onSaved?.();setTarget(null);}catch{setError("Parcela salva. Atualize o extrato para ver os próximos meses.");}
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar.");}
  finally{setSaving(false);}
 }
 return <>
 {items.filter(item=>!item.recordedId).map(item=><div key={item.id} className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 hover:bg-surface-muted">
  <div className="flex min-w-0 items-start gap-3"><BankLogo institutionId={item.institutionId} size={32}/><div className="min-w-0"><p className="break-words text-sm font-medium text-ink">{item.category} · {item.bank}</p><p className="mt-1 text-[11px] text-muted">{item.name} · {item.month.slice(5)}/{item.month.slice(0,4)}</p><span className="mt-1 inline-block text-[10px] font-medium text-amber-ink">{item.dueDate?`Parcela prevista · ${item.bankAmount!=null?"valor informado pelo banco":"informada por você"} · vence em ${bankDate(item.dueDate)}`:"Parcela prevista · vencimento não informado"}</span><p className="mt-1 text-[10px] leading-5 text-muted">Pagas: {item.paidInstallments??"não informado"} · Faltam: {item.remainingInstallments??"não informado"}{item.totalInstallments!=null?` · Total: ${item.totalInstallments}`:""} · Última: {bankDate(item.finalDueDate??item.manualPlan?.last_due_date)}</p></div></div>
  <div className="shrink-0 max-w-[45%] text-right"><p className="text-sm font-bold text-amber-ink">{item.amount===null?"Valor não informado":bankMoney(item.amount,item.currency)}</p>
   {canEdit&&mode&&(item.bankAmount==null||item.bankTotalInstallments==null||!item.finalDueDate)&&<button type="button" onClick={()=>open(item)} className="mt-2 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-amber-ink hover:bg-surface-muted">{item.manualPlan?"Editar parcela":"Informar parcela"}</button>}
  </div>
 </div>)}
 {target&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={event=>{if(event.key==="Escape"&&!saving)setTarget(null);
   if(event.key==="Tab"){const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)');const first=controls?.[0],last=controls?.[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
  <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="credit-plan-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
   <h2 id="credit-plan-title" className="text-lg font-bold text-ink">{target.manualPlan?"Editar parcela":"Informar parcela"}</h2>
   <p className="mt-1 text-sm text-muted">{target.category} · {target.bank}</p>
   <form onSubmit={save} className="mt-5 space-y-4">
    <label className="block text-sm text-ink">Valor da parcela{currency?` (${currency})`:""}<input autoFocus readOnly={target.bankAmount!=null} required inputMode="decimal" placeholder="0,00" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5"/></label>
    {!target.currency&&<label className="block text-sm text-ink">Moeda<select required value={currency} disabled={!!target.currency} onChange={e=>setCurrency(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5"><option value="">Selecione</option>{[...new Set([target.currency,"BRL","USD","EUR"].filter(Boolean))].map(code=><option key={code} value={code!}>{code}</option>)}</select></label>}
    <label className="block text-sm text-ink">Quantidade total de parcelas<input readOnly={target.bankTotalInstallments!=null} required type="number" inputMode="numeric" min="1" max="600" step="1" value={count} onChange={e=>{setCount(e.target.value);setFirst(creditPlanFirstDueDate(last,Number(e.target.value)));}} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5"/></label>
    <label className="block text-sm text-ink">Último vencimento<input readOnly={!!target.finalDueDate} required type="date" min="1900-01-01" value={last} onChange={e=>{setLast(e.target.value);setFirst(creditPlanFirstDueDate(e.target.value,Number(count)));}} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5"/></label>
    {first&&<p className="text-sm text-muted">Primeiro vencimento calculado: <strong className="text-ink">{bankDate(first)}</strong></p>}
    <p className="text-xs text-muted">Os dados fornecidos pelo banco já vêm preenchidos. {dates.length?`${dates.length} parcelas mensais. `:""}Repetir este valor até o último vencimento. A primeira data é calculada pela quantidade total, incluindo os meses anteriores. Os pagamentos continuam sem confirmação.</p>
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    <div className="flex gap-3"><button type="button" disabled={saving} onClick={()=>setTarget(null)} className="flex-1 rounded-xl border border-line py-2.5 text-sm text-muted">Cancelar</button><button type="submit" disabled={saving||!dates.length} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">{saving?"Salvando...":"Salvar parcelas"}</button></div>
   </form>
  </section>
 </div>}
 </>;
}
