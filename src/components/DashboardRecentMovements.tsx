"use client";
import Link from "next/link";
import {clsx} from "clsx";
import BankLogo from "./BankLogo";
import FinanceAuthor from "./FinanceAuthor";
import {financeOrigin,type LedgerEntry} from "@/lib/finance-ledger";
import {financeMovementDisplay} from "@/lib/finance-movement-display";

export default function DashboardRecentMovements({entries}:{entries:LedgerEntry[]}){
  return <article className="z-card z-activity-card">
    <div className="z-card-heading"><h2>Últimas movimentações</h2><Link href="/dashboard/financas">Ver todas →</Link></div>
    <div className="z-activity-list" tabIndex={0} role="region" aria-label="Últimas movimentações">
      {!entries.length?<div className="z-empty">Nenhuma movimentação neste período.</div>:entries.slice(0,6).map(transaction=>{
        const display=financeMovementDisplay(transaction),credit=display.direction==="credit",unknown=display.direction==="unknown";
        return <div key={transaction.id} className="z-transaction-row">
          <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-xl",unknown?"bg-surface-muted text-muted":credit?"bg-emerald-soft text-emerald-ink":"bg-red-soft text-red-ink")}>{unknown?"?":credit?"↗":"↘"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{transaction.description}</p><small>{transaction.category}</small>
            <span className="z-badge ml-1 inline-flex items-center gap-1.5">{transaction.bank&&<BankLogo institutionId={transaction.bank.institution_id} size={24}/>}<span>{financeOrigin(transaction)}</span></span>
            {display.note&&<small className="block">{display.note}</small>}
            <FinanceAuthor name={transaction.registeredByName}/>
          </div>
          <strong className={unknown?"text-muted":credit?"text-emerald-ink":"text-red-ink"}>{display.sign}{display.amount}</strong>
        </div>;
      })}
    </div>
  </article>;
}
