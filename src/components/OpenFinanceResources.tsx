import { bankMoney, bankDate, bankResourceName, type BankOverview } from "@/lib/open-finance-display";
import OpenFinanceIcon from "./OpenFinanceIcon";
const labels={account:"Conta bancária",card:"Cartão de crédito",investment:"Investimento",loan:"Empréstimo",financing:"Financiamento",reserve:"Reserva de saldo"};
export default function OpenFinanceResources({ data }: { data: BankOverview }) {
  if(!data.resources.length)return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-9 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm"><OpenFinanceIcon name="bank"/></span><h3 className="mt-4 font-semibold text-slate-900">Seu próximo banco começa aqui</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Conecte uma conta e autorize no aplicativo do banco. A Zelo reconhece a autorização automaticamente; os dados podem levar alguns minutos para chegar.</p></div>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {data.resources.map(resource=>{
      const bank=data.connections.find(c=>c.id===resource.connection_id)?.institution_name;
      return <article key={resource.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className={`flex items-center gap-3 p-5 ${resource.resource_type==="card"?"bg-gradient-to-br from-violet-700 to-indigo-800 text-white":"text-slate-900"}`}>
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${resource.resource_type==="card"?"bg-white/15":"bg-violet-50 text-violet-700"}`}><OpenFinanceIcon name={resource.resource_type==="card"?"card":resource.resource_type==="investment"?"chart":"bank"}/></span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{bank}</p><p className={`mt-0.5 text-xs ${resource.resource_type==="card"?"text-violet-100":"text-slate-500"}`}>{labels[resource.resource_type]}{resource.identification_last4?` · final ${resource.identification_last4}`:""}</p></div>
        </div>
        <div className="flex-1 px-5 pb-5"><h3 className="text-sm font-medium text-slate-500">{bankResourceName(resource.name)}</h3>
          {["account","reserve"].includes(resource.resource_type)&&<div className="mt-5"><p className="text-xs font-medium text-slate-500">Saldo disponível</p><p className="mt-1 break-words text-3xl font-semibold tracking-tight text-slate-950">{bankMoney(resource.available_amount,resource.currency)}</p></div>}
          {resource.resource_type==="investment"&&<div className="mt-4"><p className="text-xs text-slate-500">Saldo líquido</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{bankMoney(resource.net_amount,resource.currency)}</p><div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>Bruto: {bankMoney(resource.gross_amount,resource.currency)}</span><span>Posição: {bankDate(resource.valuation_date)}</span></div></div>}
          {resource.resource_type==="card"&&<div className="mt-4 space-y-3">
            {!data.limits.some(l=>l.resource_id===resource.id)&&<p className="text-sm text-slate-500">O banco ainda não informou os limites.</p>}
            {data.limits.filter(l=>l.resource_id===resource.id).map(limit=><div key={limit.id} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">{limit.line_name||"Linha de crédito"}{limit.consolidation_type?` · ${limit.consolidation_type}`:""}</p><p className="mt-2 text-xs text-slate-500">Limite disponível</p><p className="mt-1 text-2xl font-semibold text-slate-950">{bankMoney(limit.available_amount,limit.currency)}</p><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><p className="text-slate-500">Total<span className="mt-1 block font-medium text-slate-700">{bankMoney(limit.total_amount,limit.currency)}</span></p><p className="text-slate-500">Utilizado<span className="mt-1 block font-medium text-slate-700">{bankMoney(limit.used_amount,limit.currency)}</span></p></div>{limit.is_flexible&&<p className="mt-3 text-xs text-slate-500">Limite flexível, sujeito à análise do banco.</p>}</div>)}
            <p className="text-xs leading-5 text-slate-500">Linhas e limites compartilhados são exibidos separadamente, sem somar valores.</p>
          </div>}
          {data.credit.filter(d=>d.resource_id===resource.id).map(credit=><div key={credit.resource_id} className="mt-4 space-y-2 text-sm"><p className="text-xs text-slate-500">Saldo devedor</p><p className="text-2xl font-semibold text-slate-950">{bankMoney(credit.outstanding_amount,credit.currency)}</p><p className="text-slate-500">Contratado: {bankMoney(credit.contract_amount,credit.currency)}</p><p className="text-slate-500">Próxima parcela: {bankMoney(credit.next_installment_amount,credit.currency)}</p><p className="text-xs text-slate-500">Vencimento final: {bankDate(credit.due_date)}</p></div>)}
        </div>
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500"><OpenFinanceIcon name="clock" className="h-3.5 w-3.5"/>Recebido em {bankDate(resource.synced_at)} · atualização pelo banco</div>
      </article>;
    })}
  </div>;
}
