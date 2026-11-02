"use client";
import type {BankInstallmentProjection} from "@/lib/bank-installment-projections";
import {bankMoney} from "@/lib/open-finance-display";
import {bankFilterLabel} from "@/lib/finance-bank-filter";
import {installmentEndMonth} from "@/lib/installment-progress";
import BankLogo from "./BankLogo";

export default function FinanceInstallmentProjections({items,onCategory}:{items:readonly BankInstallmentProjection[];onCategory?:(item:BankInstallmentProjection)=>void}){
 return items.map(item=>{
  const month=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${item.month}-01T12:00:00Z`));
  return <div key={`${item.id}:${item.month}`} className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 hover:bg-surface-muted">
   <div className="flex min-w-0 items-start gap-3">
    <BankLogo institutionId={item.institution_id} size={32}/>
    <div className="min-w-0">
     <p className="break-words text-sm font-medium text-ink">{item.description} · parcela {item.position} de {item.total}</p>
     <p className="mt-1 text-[11px] text-muted">{bankFilterLabel(item.institution_name)} · {month} · dia do vencimento não informado</p>
     <p className="mt-1 text-[10px] text-muted">Pagas: não confirmado · Restam após esta: {item.total-item.position} previstas · Última prevista: {installmentEndMonth(item.month,item.position,item.total)??"não informada"} (dia não informado)</p>
     <p className="mt-1 text-[10px] text-amber-ink">{item.observed?"Identificada pelo banco":"Previsão"} · pagamento não confirmado · fora dos gastos confirmados</p>
    </div>
   </div>
   <div className="shrink-0 max-w-[45%] text-right"><p className="text-sm font-bold tabular-nums text-amber-ink">{bankMoney(item.amount,item.currency)}</p>{onCategory&&<button type="button" onClick={()=>onCategory(item)} className="mt-2 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-amber-ink">Alterar categoria</button>}</div>
  </div>;
 });
}
