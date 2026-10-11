"use client";
import {clsx} from "clsx";
import {financeOrigin,type LedgerEntry} from "@/lib/finance-ledger";
import {bankMoney,bankResourceName} from "@/lib/open-finance-display";
export default function FinanceLedgerRows({entries,selectMode,selectedIds,onToggle,onEdit,onDelete,onCategory,displayDescription,displayDate}:{entries:LedgerEntry[];selectMode:boolean;selectedIds:Set<string>;onToggle:(id:string)=>void;onEdit:(entry:LedgerEntry)=>void;onDelete:(entry:LedgerEntry)=>void;onCategory?:(entry:LedgerEntry)=>void;displayDescription:(text:string)=>string;displayDate:(entry:LedgerEntry)=>string}){
  return entries.map(f=>{
    const bank=f.bank,credit=bank?bank.direction==="credit":f.type==="income",unknownDirection=bank?.direction==="unknown";
    const amount=bank?bankMoney(bank.amount,bank.currency):f.amount.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
    return <div key={f.id} className="group flex items-start justify-between gap-2 rounded-xl px-3 py-3 transition hover:bg-surface-muted">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {selectMode&&!bank&&<input aria-label={`Selecionar ${f.description}`} type="checkbox" checked={selectedIds.has(f.id)} onChange={()=>onToggle(f.id)} className="mt-2 h-4 w-4 shrink-0 accent-slate-800"/>}
        <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold",unknownDirection?"bg-surface-muted text-muted":credit?"bg-emerald-soft text-emerald-ink":"bg-rose-soft text-rose-ink")}>{unknownDirection?"?":credit?"↗":"↘"}</span>
        <div className="min-w-0"><p className="break-words text-sm font-medium text-ink">{displayDescription(f.description)}</p><p className="mt-1 text-[11px] text-muted">{f.category} · {displayDate(f)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5"><span className={clsx("rounded-md px-2 py-0.5 text-[10px] font-medium",bank?"bg-violet-soft text-violet-ink":f.source==="whatsapp"?"bg-emerald-soft text-emerald-ink":"bg-surface-muted text-muted")}>{financeOrigin(f)}</span>{bank&&<span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10px] text-muted">{bankResourceName(bank.resource_name)}</span>}{!f.included&&<span className="rounded-md bg-amber-soft px-2 py-0.5 text-[10px] text-amber-ink">{bank?.kind==="excluded"?"Não altera o resultado":bank?.currency!=="BRL"?"Fora do resumo em reais":"Valor/direção não informados"}</span>}{f.possibleDuplicate&&<span className="rounded-md bg-amber-soft px-2 py-0.5 text-[10px] text-amber-ink" title="Há outro registro com mesmo valor, data e tipo. Confira se representam a mesma compra.">Possível repetição · conferir</span>}</div>
          {bank&&f.categorySource&&<p className="mt-1 text-[10px] text-subtle">{f.categorySource==="user"?"Categoria escolhida por você":f.categorySource==="provider"?"Categoria recebida da Polp":f.categorySource==="description"?"Categoria sugerida · confira":f.categorySource==="default"?"Categoria automática":""}</p>}
          {bank?.installment_number&&<p className="mt-1 text-[11px] text-muted">Parcela {bank.installment_number}{bank.installment_count?` de ${bank.installment_count}`:""}{bank.bill_month?` · competência ${bank.bill_month.slice(5,7)}/${bank.bill_month.slice(0,4)}`:""}</p>}
        </div>
      </div>
      <div className="max-w-[40%] shrink-0 text-right"><p className={clsx("break-words text-sm font-bold tabular-nums",unknownDirection?"text-muted":credit?"text-emerald-ink":"text-rose-ink")}>{!unknownDirection&&(bank?.amount!=null||!bank)?(credit?"+":"−"):""}{amount}</p>{bank?<><p className="mt-1 text-[10px] text-subtle">Recebido do banco</p>{bank.kind!=="excluded"&&onCategory&&<button onClick={()=>onCategory(f)} className="mt-2 rounded-lg bg-violet-soft px-2 py-1.5 text-[11px] font-medium text-violet-ink hover:bg-violet-soft">Alterar categoria</button>}</>:<div className="mt-1 flex justify-end gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><button onClick={()=>onEdit(f)} className="rounded-lg p-1.5 text-subtle hover:bg-blue-soft hover:text-blue-ink" title="Editar">✏️</button><button onClick={()=>onDelete(f)} className="rounded-lg p-1.5 text-subtle hover:bg-red-soft hover:text-red-ink" title="Excluir">🗑️</button></div>}</div>
    </div>;
  });
}
