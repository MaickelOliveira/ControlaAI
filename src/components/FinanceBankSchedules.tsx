import BankLogo from "./BankLogo";
import {bankAmountWithoutCurrency,bankDate,bankMoney,type BankOverview} from "@/lib/open-finance-display";
import {bankInstallmentPosition,bankInstallmentProgress,groupBankAgenda,type BankAgendaItem,type BankAgendaGroup} from "@/lib/open-finance-schedules";
export default function FinanceBankSchedules({items,overview}:{items:BankAgendaItem[];overview:BankOverview}){
 if(!items.length)return null;
 return <section aria-label="Recorrências e parcelas bancárias" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
  <h4 className="text-sm font-semibold text-ink">Recorrências e parcelas dos bancos · {items.length}</h4>
  <p className="mt-2 text-xs leading-5 text-muted">O banco informa a parcela mais recente identificada, não quantas foram pagas. As previsões não são somadas às compras do extrato. Vencimentos ausentes continuam não informados.</p>
  {groupBankAgenda(items).map(renderGroup)}
 </section>;

 function renderGroup(group:BankAgendaGroup){
  if(group.key==="last")return <details key={group.key} className="mt-4 border-t border-line pt-4">
    <summary className="cursor-pointer text-sm font-semibold text-muted">{group.title} · {group.items.length}</summary>
    <p className="mt-2 text-xs leading-5 text-muted">A sequência chegou à última parcela no histórico recebido. Pagamento desta compra não confirmado; confira a fatura no banco.</p>
    <div className="mt-3 max-h-[400px] overflow-y-auto">{group.items.map(renderItem)}</div>
   </details>;
  return <div key={group.key} className="mt-5">
   <h5 className="text-sm font-semibold text-ink">{group.title} · {group.items.length}</h5>
   {group.items.slice(0,4).map(renderItem)}
   {group.items.length>4&&<details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-amber-ink">Ver mais {group.items.length-4} item(ns)</summary><div className="mt-3 max-h-[400px] overflow-y-auto">{group.items.slice(4).map(renderItem)}</div></details>}
  </div>;
 }

 function renderItem(item:BankAgendaItem){
  const progress=bankInstallmentProgress(item);
  const connection=overview.connections.find(c=>c.id===overview.resources.find(r=>r.id===item.resource_id)?.connection_id);
  const tag=item.kind==="recurring"?"Cobrança estimada":item.kind==="bill"?"Fatura recebida":progress?.stage==="last"?"Última parcela no histórico":"Parcela identificada";
  return <div key={`${item.kind}:${item.id}`} className="mt-3 rounded-xl border border-line bg-soft px-3 py-3 sm:px-4">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-ink">{item.description}</p>
     <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted"><BankLogo size={24} institutionId={connection?.institution_id}/><span className="break-words">{item.institution_name} · {item.resource_name}</span></p>
    </div>
    <div className="text-right"><strong className="block text-sm text-ink">{item.currency?bankMoney(item.amount,item.currency):bankAmountWithoutCurrency(item.amount)}</strong><span className="text-[11px] text-muted">{item.currency?"":"Moeda não informada · "}{item.kind==="installment"?"por parcela":item.kind==="recurring"?"valor estimado":"valor da fatura"}</span></div>
   </div>
   <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-xs text-muted">
    {item.kind==="installment"?<>
     <p>{progress?<>Última parcela identificada: <strong className="text-ink">{progress.current} de {progress.total}</strong></>:bankInstallmentPosition(item)}</p>
     <p>{progress?progress.remaining? <><strong className="text-amber-ink">{progress.remaining} parcela{progress.remaining===1?"":"s"} prevista{progress.remaining===1?"":"s"}</strong> após essa parcela</>:"Sem novas parcelas previstas nesta sequência":"Quantidade restante não informada"}</p>
     <p>Próximo vencimento: {bankDate(item.due_date)}</p>
    </>:<p>{item.kind==="recurring"?"Próxima cobrança estimada":"Vencimento da fatura"}: {bankDate(item.due_date)}</p>}
   </div>
   <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted"><span className="rounded-full bg-amber-soft px-2 py-1 text-amber-ink">{tag}</span>{item.kind==="installment"&&<span>Pagamento não confirmado</span>}</p>
  </div>;
 }
}
