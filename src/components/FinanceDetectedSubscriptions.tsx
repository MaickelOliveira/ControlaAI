"use client";
import type {DetectedSubscription} from "@/lib/detected-subscriptions";
import {bankMoney} from "@/lib/open-finance-display";
import {bankFilterLabel} from "@/lib/finance-bank-filter";

/** Contas mensais reconhecidas pelo histórico do cartão/conta. São previsões:
 * não entram nos gastos confirmados nem viram lançamentos. */
export default function FinanceDetectedSubscriptions({items}:{items:readonly DetectedSubscription[]}){
 return items.map(item=>{
  const date=item.date.split("-").reverse().join("/");
  return <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 hover:bg-surface-muted">
   <div className="flex min-w-0 items-start gap-3">
    <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-soft text-sm">🔁</span>
    <div className="min-w-0">
     <p className="break-words text-sm font-medium text-ink">{item.description} · {item.loan?"parcela de empréstimo":"conta mensal"}</p>
     <p className="mt-1 text-[11px] text-muted">{bankFilterLabel(item.institutionName)} · {item.resourceName} · previsto para {date} · {item.category}</p>
     <p className="mt-1 text-[10px] text-amber-ink">{item.loan?"Reconhecida pelos pagamentos dos últimos meses":"Reconhecida pelas cobranças dos últimos meses"} · previsão · fora dos gastos confirmados</p>
    </div>
   </div>
   <div className="shrink-0 max-w-[45%] text-right"><p className="text-sm font-bold tabular-nums text-amber-ink">{bankMoney(String(item.amount),"BRL")}</p></div>
  </div>;
 });
}
