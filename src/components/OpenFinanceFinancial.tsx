"use client";
import BankLogo from "./BankLogo";
import {bankDate,bankMoney,bankResourceName} from "@/lib/open-finance-display";
import type {BankFinancialData} from "@/lib/open-finance-report";
import OpenFinanceIcon from "./OpenFinanceIcon";
export default function OpenFinanceFinancial({data,resourceId}:{mode:"personal"|"business";data:BankFinancialData;resourceId?:string}) {
  if(!data.overview.connections.length)return null;
  const bills=data.overview.bills.filter(b=>!resourceId||b.resource_id===resourceId);
  return <section aria-label="Faturas e consultas dos bancos" className="space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-7">
    <div><h2 className="text-lg font-semibold text-ink">Detalhes dos bancos</h2><p className="mt-1 text-xs text-muted">As movimentações já estão no extrato acima. Aqui você consulta faturas, limites e investimentos.</p></div>
      <details className="group rounded-2xl border border-line bg-surface"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><OpenFinanceIcon name="card" className="h-4 w-4 text-violet-ink"/>Faturas recebidas<span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">{bills.length}</span></span><span aria-hidden="true" className="text-subtle transition group-open:rotate-180">⌄</span></summary><div className="border-t border-line px-5 pb-5"><p className="mt-3 text-xs leading-5 text-muted">O vencimento da fatura e a data da compra são informações diferentes. O total da fatura não é somado às compras.</p>{bills.map(b=><div key={b.id} className="mt-3 rounded-xl bg-surface-muted p-4 text-sm"><p className="flex items-center gap-2 font-medium"><BankLogo institutionId={data.overview.connections.find(c=>c.id===data.overview.resources.find(r=>r.id===b.resource_id)?.connection_id)?.institution_id} size={30}/>{bankResourceName(data.overview.resources.find(r=>r.id===b.resource_id)?.name||"Cartão")} · vence em {bankDate(b.due_date)}</p><p className="mt-2">Total: {bankMoney(b.total_amount,b.currency)} · mínimo: {bankMoney(b.minimum_payment_amount,b.currency)}</p><p className="mt-1 text-xs text-muted">Situação de pagamento: {b.status==="unknown"?"não informada pelo banco":b.status}</p></div>)}{!bills.length&&<p className="mt-4 text-sm text-muted">O banco ainda não enviou faturas.</p>}</div></details>
      {data.overview.truncated&&<p className="text-xs text-amber-ink">Há mais registros do que esta visão consegue mostrar. O resumo de contas e faturas está limitado.</p>}
      <p className="flex items-center gap-1.5 text-[11px] text-muted"><OpenFinanceIcon name="clock" className="h-3.5 w-3.5"/>Última atualização concluída: {bankDate(data.report.last_successful_sync_at)}</p>
  </section>;
}
