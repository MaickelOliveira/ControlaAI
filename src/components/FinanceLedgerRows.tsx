"use client";
import BankLogo from "./BankLogo";
import {clsx} from "clsx";
import {financeOrigin,type LedgerEntry} from "@/lib/finance-ledger";
import {bankMoney,bankResourceName} from "@/lib/open-finance-display";
import FinanceAuthor from "./FinanceAuthor";
import {creditPaymentAdjustment,isCardCreditOperation} from "@/lib/credit-funded-payment";
import {financeMovementDisplay} from "@/lib/finance-movement-display";
export default function FinanceLedgerRows({entries,selectMode,selectedIds,onToggle,onEdit,onDelete,onCategory,onCreditPix,displayDescription,displayDate}:{entries:LedgerEntry[];selectMode:boolean;selectedIds:Set<string>;onToggle:(id:string)=>void;onEdit:(entry:LedgerEntry)=>void;onDelete:(entry:LedgerEntry)=>void;onCategory?:(entry:LedgerEntry)=>void;onCreditPix?:(entry:LedgerEntry)=>void;displayDescription:(text:string)=>string;displayDate:(entry:LedgerEntry)=>string}){
  return entries.map(f=>{
    const bank=f.bank,display=financeMovementDisplay(f),credit=display.direction==="credit",unknownDirection=display.direction==="unknown",adjustment=bank?creditPaymentAdjustment(bank):null;
    return <div key={f.id} className="group flex items-start justify-between gap-2 rounded-xl px-3 py-3 transition hover:bg-surface-muted">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {selectMode&&!bank&&<input aria-label={`Selecionar ${f.description}`} type="checkbox" checked={selectedIds.has(f.id)} onChange={()=>onToggle(f.id)} className="mt-2 h-4 w-4 shrink-0 accent-slate-800"/>}
        <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold",unknownDirection?"bg-surface-muted text-muted":credit?"bg-emerald-soft text-emerald-ink":"bg-rose-soft text-rose-ink")}>{unknownDirection?"?":credit?"↗":"↘"}</span>
        <div className="min-w-0"><p className="break-words text-sm font-medium text-ink">{displayDescription(f.description)}</p><p className="mt-1 text-[11px] text-muted">{f.category} · {displayDate(f)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5"><span className={clsx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium",bank?"bg-violet-soft text-violet-ink":f.source==="whatsapp"?"bg-emerald-soft text-emerald-ink":"bg-surface-muted text-muted")}>{bank&&<BankLogo institutionId={bank.institution_id} size={24}/>}<span>{financeOrigin(f)}</span></span>{bank&&<span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10px] text-muted">{bankResourceName(bank.resource_name)}</span>}{!f.included&&<span className="rounded-md bg-amber-soft px-2 py-0.5 text-[10px] text-amber-ink">{bank?.kind==="excluded"?"Não altera o resultado":bank?.currency!=="BRL"?"Fora do resumo em reais":"Valor/direção não informados"}</span>}{f.possibleDuplicate&&<span className="rounded-md bg-amber-soft px-2 py-0.5 text-[10px] text-amber-ink" title="Há outro registro com mesmo valor, data e tipo. Confira se representam a mesma compra.">Possível repetição · conferir</span>}</div>
          {!bank&&<FinanceAuthor name={f.registeredByName}/>}
          {display.note&&<p className="mt-1 text-[11px] text-muted">{display.note}</p>}
          {bank&&f.categorySource&&<p className="mt-1 text-[10px] text-subtle">{adjustment?"Juros/taxas confirmados por você":f.categorySource==="user"?"Categoria escolhida por você":f.categorySource==="provider"?"Categoria recebida da Polp":f.categorySource==="description"?"Categoria sugerida · confira":f.categorySource==="default"?"Categoria automática":""}</p>}
          {bank?.installment_number&&<p className="mt-1 text-[11px] text-muted">Parcela {bank.installment_number}{bank.installment_count?` de ${bank.installment_count}`:""}{bank.bill_month?` · competência ${bank.bill_month.slice(5,7)}/${bank.bill_month.slice(0,4)}`:""}</p>}
          {adjustment&&<p className="mt-2 text-[11px] leading-5 text-amber-ink">Pix feito com dinheiro do cartão. Nos gastos entram apenas {bankMoney(adjustment.charges_amount,"BRL")} de juros/taxas aqui; o Pix de {bankMoney(adjustment.payment_amount,"BRL")} é contado na conta. A dívida no cartão permanece.</p>}
          {adjustment&&<p className="mt-1 text-[11px] text-muted">Cobrança no cartão: {bankMoney(bank!.amount,bank!.currency)} · valor original recebido do banco.</p>}
          {bank?.credit_reconciliation?.role==="payment"&&bank.credit_reconciliation.status==="active"&&<p className="mt-2 text-[11px] leading-5 text-muted">Pix feito com dinheiro do cartão · pagamento contado uma vez.</p>}
          {bank?.credit_reconciliation?.status==="review"&&<p className="mt-2 text-[11px] leading-5 text-amber-ink">O banco atualizou os dados. Confira este pagamento: o ajuste está suspenso.</p>}
        </div>
      </div>
      <div className="max-w-[40%] shrink-0 text-right"><p className={clsx("break-words text-sm font-bold tabular-nums",unknownDirection?"text-muted":credit?"text-emerald-ink":"text-rose-ink")}>{display.sign}{display.amount}</p>{bank?<><p className="mt-1 text-[10px] text-subtle">{adjustment?"Juros/taxas confirmados":"Recebido do banco"}</p>{bank.kind!=="excluded"&&!adjustment&&onCategory&&<button onClick={()=>onCategory(f)} className="mt-2 rounded-lg bg-violet-soft px-2 py-1.5 text-[11px] font-medium text-violet-ink hover:bg-violet-soft">Alterar categoria</button>}{onCreditPix&&(bank.credit_reconciliation||isCardCreditOperation(bank))&&<button onClick={()=>onCreditPix(f)} className="mt-2 block w-full rounded-lg border border-line px-2 py-1.5 text-[11px] font-medium text-muted">{bank.credit_reconciliation?"Ver confirmação":"Pix do cartão?"}</button>}</>:<div className="mt-1 flex justify-end gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><button onClick={()=>onEdit(f)} className="rounded-lg p-1.5 text-subtle hover:bg-blue-soft hover:text-blue-ink" title="Editar">✏️</button><button onClick={()=>onDelete(f)} className="rounded-lg p-1.5 text-subtle hover:bg-red-soft hover:text-red-ink" title="Excluir">🗑️</button></div>}</div>
    </div>;
  });
}
