import Image from "next/image";
import BankLogo from "./BankLogo";
import {BANK_STATUSES,type BankConnection} from "@/lib/open-finance-display";
import {bankFilterLabel} from "@/lib/finance-bank-filter";

export default function BankConnectionMap({connections,now=new Date().toISOString()}:{connections:readonly BankConnection[];now?:string}){
  const banks=new Map<string,{name:string;institutionId?:string;connected:boolean;status:string}>();
  for(const connection of connections.filter(c=>!c.archived_at)){
    const key=connection.institution_id??connection.institution_name;
    const connected=connection.status==="active"&&!connection.revoked_at&&(!connection.consent_expires_at||Date.parse(connection.consent_expires_at)>Date.parse(now));
    const previous=banks.get(key);
    if(!previous?.connected)banks.set(key,{name:connection.institution_name,institutionId:connection.institution_id,connected,status:connected?"Conectado":connection.status==="active"?"Autorização expirada":BANK_STATUSES[connection.status]??"Em verificação"});
  }
  return <div aria-label="Conexão da Zelo com seus bancos" className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 sm:p-8">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{backgroundImage:"radial-gradient(currentColor 1px, transparent 1px)",backgroundSize:"20px 20px"}}/>
    <div className="relative flex items-center gap-4 sm:gap-10">
      <div className="relative flex w-20 shrink-0 flex-col items-center gap-3 after:absolute after:-right-2 after:top-1/2 after:h-px after:w-2 after:bg-amber-500 sm:w-36 sm:after:-right-5 sm:after:w-5"><div className="grid h-20 w-20 place-items-center rounded-full border border-amber-500/40 bg-amber-soft shadow-[0_0_36px_rgba(245,158,11,0.14)] sm:h-28 sm:w-28"><Image src="/brand/zelo-icon.png" alt="Zelo" width={64} height={64} className="h-12 w-12 object-contain sm:h-16 sm:w-16"/></div><span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Sua conexão</span></div>
      <ul className="relative min-w-0 flex-1 space-y-3 before:absolute before:-left-2 before:bottom-8 before:top-8 before:w-px before:bg-line sm:before:-left-5" aria-label="Situação dos bancos">
        {[...banks].map(([key,bank])=><li key={key} className="relative flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 sm:gap-4 sm:px-5">
          <span aria-hidden="true" className={`absolute -left-4 top-1/2 h-px w-4 sm:-left-10 sm:w-10 ${bank.connected?"bg-emerald-500":"bg-red-500"}`}/>
          <BankLogo institutionId={bank.institutionId} size={36}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-ink">{bankFilterLabel(bank.name)}</p><p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${bank.connected?"text-emerald-ink":"text-red-ink"}`}><span className={`h-1.5 w-1.5 rounded-full ${bank.connected?"bg-emerald-500":"bg-red-500"}`}/>{bank.connected?"Conectado":"Desconectado"}</p>{!bank.connected&&bank.status!=="Cancelado"&&<p className="mt-1 text-[10px] text-muted">{bank.status}</p>}</div>
          <span aria-hidden="true" className={`hidden h-2 w-2 shrink-0 rounded-full sm:block ${bank.connected?"bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]":"bg-red-500"}`}/>
        </li>)}
        {!banks.size&&<li className="py-8 text-sm text-muted">Conecte um banco para começar.</li>}
      </ul>
    </div>
    <p className="relative mt-6 text-center text-xs text-muted">Verde: conectado · Vermelho: desconectado</p>
  </div>;
}
