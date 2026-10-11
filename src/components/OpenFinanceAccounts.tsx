"use client";
import {useCallback,useState} from "react";
import {useBankUpdates} from "./useBankUpdates";
import OpenFinanceIcon from "./OpenFinanceIcon";
import OpenFinanceResources from "./OpenFinanceResources";
import OpenFinanceEligibility from "./OpenFinanceEligibility";
import OpenFinanceConnect from "./OpenFinanceConnect";
import OpenFinanceConnection from "./OpenFinanceConnection";
import {type BankConnectionAction} from "@/lib/open-finance-connection-actions";
import {type BankAuthorization,type BankOverview} from "@/lib/open-finance-display";
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
  async function action(id:string,name:BankConnectionAction) {
    if(busy)return;
    if(name==="revoke"&&!confirm("Desconectar este banco? O compartilhamento de dados com a Zelo será cancelado. O histórico recebido permanecerá disponível."))return;
    if(name==="remove"&&!confirm("Remover esta tentativa da lista? Uma autorização pendente será cancelada antes da remoção. O registro continuará disponível em Histórico de conexões."))return;
    if(name==="recreate"&&!confirm("Gerar uma nova autorização com as mesmas categorias e condições já aceitas? Você precisará autorizar novamente no banco."))return;
    setBusy(id);setError("");setAuthorizations(previous=>({...previous,[id]:{authorizationUrl:null}}));
    try {
      const response=await fetch(`/api/open-finance/connections/${id}/${name}?mode=${mode}`,{method:"POST",...(name==="recreate"?{headers:{"Content-Type":"application/json"},body:JSON.stringify({acceptedTerms:true,journeyVersion:"celcoin-2026-10"})}:{})});const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível concluir.");
      setAuthorizations(previous=>({...previous,[id]:result.status==="pending"?result:{authorizationUrl:null}}));await load();
    }catch(e){setError(e instanceof Error?e.message:"Tente novamente.");if(name==="revoke"||name==="remove")await load().catch(()=>{});}finally{setBusy("");}
  }
  if(!data)return (error||updatesError)?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error||updatesError}</p>:null;
  if(data.eligibilityRequired)return <OpenFinanceEligibility key={mode} mode={mode} onEnabled={load}/>;
  return <section aria-label="Bancos conectados" className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-100 bg-gradient-to-r from-violet-50/80 via-white to-white px-5 py-6 sm:px-7"><div><div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-violet-700"><OpenFinanceIcon name="bank" className="h-4 w-4"/>Open Finance · Brasil</div><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Seus bancos, em um só lugar.</h2><p className="mt-2 text-sm text-slate-500">{mode==="personal"?"Contas pessoais (PF)":"Contas da sua empresa (PJ)"} · conexão feita diretamente com o banco</p></div>
      {data.connectAvailable&&<button onClick={()=>setConnecting(true)} className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"><OpenFinanceIcon name="plus" className="h-4 w-4"/>Conectar banco</button>}</div>
    <div className="space-y-5 p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${updatesError?"bg-amber-500":"bg-emerald-500"}`}/>{updatesError?"Atualização em nova tentativa":"Atualização automática do painel"}</span><span className="flex items-center gap-1.5"><OpenFinanceIcon name="shield" className="h-3.5 w-3.5"/>Autorização no seu banco</span></div>
      {!data.connectAvailable&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Novas conexões aguardam a conclusão da configuração.</p>}
      {(error||updatesError)&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error||updatesError}</p>}
      {connecting&&<OpenFinanceConnect mode={mode} contactEmail={data.contactEmail} onClose={()=>{setConnecting(false);void load();}}/>}
      <OpenFinanceResources data={data} mode={mode} busy={!!busy} onDisconnect={id=>void action(id,"revoke")}/>
      <div className="border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold text-slate-900">Conexões e permissões</h3><p className="mt-1 text-xs leading-5 text-slate-500">A autorização feita no celular aparece aqui automaticamente. Você pode consultar ou cancelar o compartilhamento quando quiser.</p>
        {data.connections.filter(c=>!c.archived_at).map(c=><OpenFinanceConnection key={c.id} connection={c} busy={!!busy} connectAvailable={!!data.connectAvailable} onAction={(id,name)=>void action(id,name)} authorization={authorizations[c.id]}/>)}
        {data.connections.some(c=>c.archived_at)&&<details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Histórico de conexões · {data.connections.filter(c=>c.archived_at).length} removida(s)</summary><p className="mt-2 text-xs leading-5 text-slate-500">Autorizações e tentativas removidas da lista. Você pode consultar os detalhes ou restaurar a exibição.</p>{data.connections.filter(c=>c.archived_at).map(c=><OpenFinanceConnection key={c.id} connection={c} busy={!!busy} connectAvailable={false} onAction={(id,name)=>void action(id,name)}/>)}</details>}
      </div><p className="text-[11px] leading-5 text-slate-500">Dados recebidos do banco. Em Finanças, contas, cartões e seus lançamentos aparecem no mesmo extrato, com a origem identificada.</p>
    </div>
  </section>;
}
