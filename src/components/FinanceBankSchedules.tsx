import BankLogo from "./BankLogo";
import {bankAmountWithoutCurrency,bankDate,bankMoney,type BankOverview} from "@/lib/open-finance-display";
import type {BankAgendaItem} from "@/lib/open-finance-schedules";
export default function FinanceBankSchedules({items,overview}:{items:BankAgendaItem[];overview:BankOverview}){
 if(!items.length)return null;
 return <section aria-label="Recorrências e parcelas bancárias" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
  <h4 className="px-3 text-xs font-semibold text-muted">Recorrências e parcelas dos bancos · {items.length}</h4>
  <p className="px-3 py-2 text-[11px] leading-5 text-subtle">Previsões e parcelas observadas. Não confirmam pagamento e não são somadas às compras do extrato. Itens sem vencimento não podem ser associados a um mês.</p>
  {items.slice(0,4).map(renderItem)}
  {items.length>4&&<details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-amber-ink">Ver mais {items.length-4} previsão(ões)</summary><div className="mt-3 max-h-[400px] overflow-y-auto">{items.slice(4).map(renderItem)}</div></details>}
 </section>;

 function renderItem(item:BankAgendaItem){return <div key={`${item.kind}:${item.id}`} className="my-2 rounded-xl border border-dashed border-line px-3 py-3">
   <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-medium text-ink">{item.description}</p><strong className="text-sm text-ink">{item.currency?bankMoney(item.amount,item.currency):`${bankAmountWithoutCurrency(item.amount)} · moeda não informada`}</strong></div>
   <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted"><BankLogo size={24} institutionId={overview.connections.find(c=>c.id===overview.resources.find(r=>r.id===item.resource_id)?.connection_id)?.institution_id}/><span>{item.institution_name} · {item.resource_name}</span><span className="rounded-full bg-amber-soft px-2 py-1 text-amber-ink">{item.kind==="recurring"?"Recorrência estimada":"Parcela observada"}</span></p>
   <p className="mt-2 text-xs text-muted">{item.kind==="recurring"?`Próxima cobrança estimada: ${bankDate(item.due_date)}`:`${item.observed_installments??"?"}/${item.total_installments??"?"} parcelas observadas · vencimento ${bankDate(item.due_date)}`}</p>
  </div>;}
}
