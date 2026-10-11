import BankLogo from "./BankLogo";
import Link from "next/link";
import {bankMoney,type BankOverview} from "@/lib/open-finance-display";
import UiIcon from "./UiIcon";
export default function DashboardCredit({overview}:{overview:BankOverview|null}){
  const lines=overview?.limits.filter(line=>overview.resources.some(resource=>resource.id===line.resource_id&&resource.resource_type==="card"))??[];
  return <article className="z-card">
    <div className="z-card-heading"><h2>Crédito disponível</h2><UiIcon name="wallet" className="h-4 w-4 text-amber-ink"/></div>
    {lines.length?lines.slice(0,3).map((line,index)=>{
      const resource=overview!.resources.find(r=>r.id===line.resource_id),bank=overview!.connections.find(c=>c.id===resource?.connection_id);
      return <div key={line.id} className={index===0?"z-credit-card":"mt-3 border-t border-line pt-3"}>
        <p className="flex items-center gap-2 text-[11px]"><BankLogo institutionId={bank?.institution_id} size={30}/><span>{bank?.institution_name??"Cartão"} · {line.line_name||"Linha de crédito"}</span></p>
        <strong className={index===0?undefined:"mt-1 block text-lg font-semibold"}>{bankMoney(line.available_amount,line.currency)}</strong>
        <small className="text-[10px]">{line.consolidation_type??"Disponível nesta linha"}</small>
      </div>;
    }):<div className="z-empty">{overview?.resources.some(r=>r.resource_type==="card")?"O banco ainda não enviou limites.":"Conecte seus cartões para acompanhar o crédito disponível."}</div>}
    {lines.length>0&&<p className="mt-3 text-[10px] leading-5 text-subtle">Por linha, sem somar limites compartilhados. Crédito não é saldo em conta.</p>}
    <Link href="/dashboard/financas" className="mt-4 flex items-center justify-between rounded-full border border-line px-4 py-2.5 text-[11px] font-medium">Ver faturas<UiIcon name="arrow" className="h-4 w-4"/></Link>
  </article>;
}
