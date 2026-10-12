import BankLogo from "./BankLogo";
import Link from "next/link";
import {bankMoney,type BankOverview} from "@/lib/open-finance-display";
import UiIcon from "./UiIcon";
import { headlineCardLimit } from "@/lib/bank-card-limit";
export default function DashboardCredit({overview}:{overview:BankOverview|null}){
  const cards=overview?.resources.filter(resource=>resource.resource_type==="card")??[];
  return <article className="z-card">
    <div className="z-card-heading"><h2>Crédito disponível</h2><UiIcon name="wallet" className="h-4 w-4 text-amber-ink"/></div>
    {cards.length?<div className="max-h-[440px] overflow-y-auto pr-1" aria-label="Crédito de todos os cartões">{cards.map((resource,index)=>{
      const bank=overview!.connections.find(c=>c.id===resource.connection_id);
      const lines=overview!.limits.filter(line=>line.resource_id===resource.id),line=headlineCardLimit(lines);
      const historical=!!bank&&bank.status!=="active";
      return <div key={resource.id} className={index===0?"z-credit-card":"mt-3 border-t border-line pt-3"}>
        <p className="flex items-center gap-2 text-[11px]"><BankLogo institutionId={bank?.institution_id} size={30}/><span>{bank?.institution_name??"Cartão"} · {resource.name}{resource.identification_last4?` · final ${resource.identification_last4}`:""}</span></p>
        <strong className={index===0?undefined:"mt-1 block text-lg font-semibold"}>{bankMoney(line?.available_amount,line?.currency)}</strong>
        <small className="block text-[10px]">{line?line.line_name||"Linha do cartão":"O banco ainda não enviou limites"}{line?.consolidation_type?` · ${line.consolidation_type}`:""}{historical?" · Histórico, sem atualização":""}</small>
        {lines.length>1&&<details className="mt-2 text-[10px]"><summary className="cursor-pointer">Ver {lines.length} linhas de crédito</summary><div className="mt-2 space-y-2">{lines.map(other=><p key={other.id}>{other.line_name||"Linha de crédito"} · {bankMoney(other.available_amount,other.currency)}{other.consolidation_type?` · ${other.consolidation_type}`:""}</p>)}</div></details>}
      </div>;
    })}</div>:<div className="z-empty">Conecte seus cartões para acompanhar o crédito disponível.</div>}
    {cards.length>0&&<p className="mt-3 text-[10px] leading-5 text-subtle">Por linha, sem somar limites compartilhados. Crédito não é saldo em conta.</p>}
    <Link href="/dashboard/financas" className="mt-4 flex items-center justify-between rounded-full border border-line px-4 py-2.5 text-[11px] font-medium">Ver faturas<UiIcon name="arrow" className="h-4 w-4"/></Link>
  </article>;
}
