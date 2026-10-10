"use client";
import {useCallback,useState} from "react";
import {useBankUpdates} from "./useBankUpdates";
import OpenFinanceIcon from "./OpenFinanceIcon";
import OpenFinanceResources from "./OpenFinanceResources";
import OpenFinanceConnect,{OpenFinanceAuthorization,OpenFinancePurposes} from "./OpenFinanceConnect";
import {BANK_CATEGORIES,BANK_STATUSES,bankDate,type BankAuthorization,type BankOverview} from "@/lib/open-finance-display";
async function fetchBankOverview(mode:"personal"|"business",signal?:AbortSignal):Promise<BankOverview|null> {
  const response=await fetch(`/api/open-finance?mode=${mode}`,{cache:"no-store",signal});
  if(response.status===401||response.status===404)return null;
  if(!response.ok)throw new Error("Não foi possível atualizar seus bancos.");
  return response.json();
}
export default function OpenFinanceAccounts({mode}:{mode:"personal"|"business"}) {
  const loader=useCallback((signal:AbortSignal)=>fetchBankOverview(mode,signal),[mode]);
  const {data,setData,error:updatesError}=useBankUpdates(loader);
  const [error,setError]=useState(""),[connecting,setConnecting]=useState(false),[busy,setBusy]=useState("");
  const [authorizations,setAuthorizations]=useState<Record<string,BankAuthorization>>({});
  async function load(){setData(await fetchBankOverview(mode));}
  async function action(id:string,name:"refresh"|"revoke") {
    if(name==="revoke"&&!confirm("Cancelar o compartilhamento? O banco deixará de enviar novos dados. O histórico recebido permanecerá na Zelo."))return;
    setBusy(id);setError("");setAuthorizations(previous=>({...previous,[id]:{authorizationUrl:null}}));
    try {
      const response=await fetch(`/api/open-finance/connections/${id}/${name}?mode=${mode}`,{method:"POST"});const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível concluir.");
      setAuthorizations(previous=>({...previous,[id]:result.status==="pending"?result:{authorizationUrl:null}}));await load();
    }catch(e){setError(e instanceof Error?e.message:"Tente novamente.");if(name==="revoke")await load().catch(()=>{});}finally{setBusy("");}
  }
  if(!data)return (error||updatesError)?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error||updatesError}</p>:null;
  return <section aria-label="Bancos conectados" className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-100 bg-gradient-to-r from-violet-50/80 via-white to-white px-5 py-6 sm:px-7"><div><div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-violet-700"><OpenFinanceIcon name="bank" className="h-4 w-4"/>Open Finance · Brasil</div><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Seus bancos, em um só lugar.</h2><p className="mt-2 text-sm text-slate-500">{mode==="personal"?"Contas pessoais (PF)":"Contas da sua empresa (PJ)"} · conexão feita diretamente com o banco</p></div>
      {data.connectAvailable&&<button onClick={()=>setConnecting(true)} className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"><OpenFinanceIcon name="plus" className="h-4 w-4"/>Conectar banco</button>}</div>
    <div className="space-y-5 p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${updatesError?"bg-amber-500":"bg-emerald-500"}`}/>{updatesError?"Atualização em nova tentativa":"Atualização automática do painel"}</span><span className="flex items-center gap-1.5"><OpenFinanceIcon name="shield" className="h-3.5 w-3.5"/>Autorização no seu banco</span></div>
      {!data.connectAvailable&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Novas conexões aguardam a conclusão da configuração.</p>}
      {(error||updatesError)&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error||updatesError}</p>}
      {connecting&&<OpenFinanceConnect mode={mode} contactEmail={data.contactEmail} onClose={()=>{setConnecting(false);void load();}}/>}
      <OpenFinanceResources data={data}/>
      <div className="border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold text-slate-900">Conexões e permissões</h3><p className="mt-1 text-xs leading-5 text-slate-500">A autorização feita no celular aparece aqui automaticamente. Você pode consultar ou cancelar o compartilhamento quando quiser.</p>
        {data.connections.map(c=><details key={c.id} className="group mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><OpenFinanceIcon name="bank" className="h-4 w-4"/></span><span className="truncate">{c.institution_name}</span></span><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${c.status==="active"?"bg-emerald-50 text-emerald-700":c.status==="pending"?"bg-amber-50 text-amber-800":"bg-slate-100 text-slate-600"}`}>{BANK_STATUSES[c.status]||"Em verificação"}</span><span aria-hidden="true" className="text-slate-400 transition group-open:rotate-180">⌄</span></summary>
          <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-4 text-xs leading-5 text-slate-600"><p>Prazo: {c.consent_expires_at?`até ${bankDate(c.consent_expires_at)}`:"indeterminado — até você cancelar"}</p><p>Categorias: {c.scopes.map(s=>BANK_CATEGORIES[s]||s).join(", ")}</p><OpenFinancePurposes/><p>Última atualização concluída: {bankDate(c.last_successful_sync_at)}</p>{c.revoked_at&&<p>Cancelado em {bankDate(c.revoked_at)}</p>}
            {!["revoked","expired","error"].includes(c.status)&&<div className="flex flex-wrap gap-2">{c.status!=="revoking"&&<button disabled={busy===c.id} onClick={()=>void action(c.id,"refresh")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><OpenFinanceIcon name="refresh" className="h-3.5 w-3.5"/>Verificar agora</button>}<button disabled={busy===c.id} onClick={()=>void action(c.id,"revoke")} className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">{c.status==="revoking"?"Tentar confirmar cancelamento":"Cancelar compartilhamento"}</button></div>}
            {c.status==="pending"&&authorizations[c.id]&&<OpenFinanceAuthorization authorization={authorizations[c.id]}/>}
          </div></details>)}
      </div><p className="text-[11px] leading-5 text-slate-500">Dados recebidos do banco. Seus lançamentos manuais continuam separados, para evitar duplicação.</p>
    </div>
  </section>;
}
