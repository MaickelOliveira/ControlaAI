import BankLogo from "./BankLogo";
import {bankMoney} from "@/lib/open-finance-display";
import type {LoanInstallment} from "@/lib/finance-loan-installments";

export default function FinanceLoanRows({items}:{items:readonly LoanInstallment[]}){
 return items.filter(item=>!item.recordedId).map(item=><div key={item.id} className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 hover:bg-surface-muted">
  <div className="flex min-w-0 items-start gap-3"><BankLogo institutionId={item.institutionId} size={32}/><div className="min-w-0"><p className="break-words text-sm font-medium text-ink">{item.category} · {item.bank}</p><p className="mt-1 text-[11px] text-muted">{item.name} · {item.month.slice(5)}/{item.month.slice(0,4)}</p><span className="mt-1 inline-block text-[10px] font-medium text-amber-ink">Parcela prevista · vencimento não informado</span></div></div>
  <p className="shrink-0 text-right text-sm font-bold text-amber-ink">{item.amount===null?"Valor não informado":bankMoney(item.amount,item.currency)}</p>
 </div>);
}
