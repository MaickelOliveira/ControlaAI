import BankLogo from "./BankLogo";
import OpenFinanceIcon from "./OpenFinanceIcon";
import {bankDashboardLoans,type BankLoanFilters} from "@/lib/bank-dashboard";
import {bankDate,bankMoney,type BankOverview} from "@/lib/open-finance-display";
import {VEHICLE_INSTALLMENT_CATEGORY} from "@/lib/bank-debt";

export default function BankLoanSummary({overview,filters,showEmpty=false}:{overview:BankOverview;filters?:BankLoanFilters;showEmpty?:boolean}) {
  const groups=bankDashboardLoans(overview,filters);
  if(!groups.length&&!showEmpty)return null;
  const count=groups.reduce((sum,group)=>sum+group.loans.length,0);
  const vehicleOnly=filters?.categories?.length===1&&filters.categories[0]===VEHICLE_INSTALLMENT_CATEGORY||groups.length>0&&groups.every(group=>group.category===VEHICLE_INSTALLMENT_CATEGORY);
  const title=vehicleOnly?VEHICLE_INSTALLMENT_CATEGORY:"Empréstimos e financiamentos";
  return <section aria-label={title} className="min-w-0 space-y-5 rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-12">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-soft p-3 text-amber-ink"><OpenFinanceIcon name="chart"/></span><div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-1 text-xs text-muted">{vehicleOnly?"Financiamentos de veículos recebidos dos bancos":"Crédito pessoal, consignado e financiamento de carro ou imóvel"}</p></div></div>
      <span className="rounded-full bg-amber-soft px-3 py-1 text-xs font-medium text-amber-ink">{count} contrato(s)</span>
    </header>
    {!groups.length&&<p className="py-6 text-center text-sm text-muted">Nenhum empréstimo ou financiamento recebido dos bancos nesta categoria.</p>}
    {groups.map(group=>{
      const maximum=Math.max(0,...group.loans.map(loan=>loan.amount??0));
      return <div key={`${group.category}:${group.currency??"unknown"}`} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold text-ink">{group.category}</h3><p className="mt-1 text-xs text-muted">Saldo devedor total · {group.currency??"moeda não informada"}</p><strong className="mt-1 block text-2xl text-ink">{bankMoney(group.total,group.currency)}</strong></div><p className="text-xs font-medium text-muted">Saldo devedor por contrato</p></div>
        <div className="max-h-[34rem] space-y-4 overflow-y-auto pr-1">
          {group.loans.map(loan=><article key={loan.id} className="rounded-xl border border-line p-4">
            <div className="flex min-w-0 items-start gap-2"><BankLogo institutionId={loan.institutionId} size={30}/><div className="min-w-0 flex-1"><h4 className="break-words text-sm font-semibold text-ink">{loan.name}</h4><p className="mt-1 text-xs text-muted">{loan.bank} · {loan.kind}{loan.historical?" · Histórico recebido":""}</p></div><strong className="shrink-0 text-sm text-ink">{bankMoney(loan.rawAmount,group.currency)}</strong></div>
            {group.currency&&loan.amount!==null&&<div role="img" aria-label={`${loan.bank} · ${loan.name}: saldo devedor ${bankMoney(loan.rawAmount,group.currency)}`} className="mt-3 h-3 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-amber-500" style={{width:`${maximum?loan.amount/maximum*100:0}%`}}/></div>}
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div><dt className="text-muted">Valor contratado</dt><dd className="mt-1 font-semibold text-ink">{bankMoney(loan.contractAmount,group.currency)}</dd></div>
              <div><dt className="text-muted">Próxima parcela informada</dt><dd className="mt-1 font-semibold text-ink">{bankMoney(loan.nextInstallment,group.currency)}</dd></div>
              <div><dt className="text-muted">Vencimento final do contrato</dt><dd className="mt-1 font-semibold text-ink">{bankDate(loan.finalDueDate)}</dd></div>
            </dl>
          </article>)}
        </div>
        {group.missing>0&&<p className="text-xs text-amber-ink">{group.missing} contrato(s) sem saldo devedor informado, fora do total e do gráfico.</p>}
      </div>;
    })}
    <p className="text-xs leading-5 text-subtle">Posição atual recebida dos bancos, independente do período do extrato. O saldo devedor e as parcelas previstas não são somados às despesas já registradas. O vencimento final não indica a data da próxima parcela; confira essa data no banco.</p>
    {overview.truncated&&<p role="status" className="text-xs text-amber-ink">Há mais contratos do que esta consulta consegue mostrar. O total considera somente os contratos recebidos nesta visão.</p>}
  </section>;
}
