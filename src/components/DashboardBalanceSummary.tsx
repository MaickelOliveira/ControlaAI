import {clsx} from "clsx";
import type {FinanceLedgerData} from "@/lib/finance-ledger";

export default function DashboardBalanceSummary({balance}:{balance:FinanceLedgerData["balance"]}) {
  return <>
    <p className="mt-4 text-xs font-semibold text-slate-400">Saldo do período</p>
    <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{balance.balance.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</h1>
      <span className={clsx("mb-1 rounded-full px-2.5 py-1 text-xs font-semibold",balance.balance>=0?"bg-emerald-400/15 text-emerald-300":"bg-rose-400/15 text-rose-300")}>
        {balance.balance===0?"Entradas e saídas equilibradas":balance.balance>0?"Entradas acima das saídas":"Saídas acima das entradas"}
      </span>
    </div>
    <p className="mt-2 text-xs text-slate-400">Entradas menos saídas no período selecionado</p>
    <p className="mt-2 text-[11px] text-slate-400">Conta, cartão, WhatsApp e plataforma · tudo no mesmo resumo</p>
  </>;
}
