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
    if(name==="remove"&&!confirm("Remover esta conexão da lista? Se ainda houver compartilhamento, ele será cancelado antes da remoção. As transações e demais dados recebidos serão mantidos, e o registro ficará em Histórico de conexões."))return;
    if(name==="recreate"&&!confirm("Gerar uma nova autorização com as mesmas categorias e condições já aceitas? Você precisará autorizar novamente no banco."))return;
    setBusy(id);setError("");setAuthorizations(previous=>({...previous,[id]:{authorizationUrl:null}}));
    try {
      const response=await fetch(`/api/open-finance/connections/${id}/${name}?mode=${mode}`,{method:"POST",...(name==="recreate"?{headers:{"Content-Type":"application/json"},body:JSON.stringify({acceptedTerms:true,journeyVersion:"celcoin-2026-10"})}:{})});const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível concluir.");
      setAuthorizations(previous=>({...previous,[id]:result.status==="pending"?result:{authorizationUrl:null}}));await load();
    }catch(e){setError(e instanceof Error?e.message:"Tente novamente.");if(name==="revoke"||name==="remove")await load().catch(()=>{});}finally{setBusy("");}
  }
  if(!data)return (error||updatesError)?<p role="alert" className="rounded-xl border border-line bg-red-soft p-4 text-sm text-red-ink">{error||updatesError}</p>:null;
  if(data.eligibilityRequired)return <OpenFinanceEligibility key={mode} mode={mode} onEnabled={load}/>;
  const current = data.connections.filter(c => !c.archived_at);
  const pending = current.filter(c => c.status !== "active");
  const active = current.filter(c => c.status === "active");
  const archived = data.connections.filter(c => c.archived_at);
  const renderConnection = (c: BankOverview["connections"][number]) => <OpenFinanceConnection key={c.id} connection={c} busy={!!busy} connectAvailable={!!data.connectAvailable && !c.archived_at} onAction={(id,name)=>void action(id,name)} authorization={authorizations[c.id]}/>;
  return <section aria-label="Bancos conectados" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Bancos conectados</h2><p className="mt-1 flex items-center gap-2 text-xs text-muted"><span className={`h-1.5 w-1.5 rounded-full ${updatesError?"bg-amber-500":"bg-emerald-500"}`}/>{updatesError?"Atualização em nova tentativa":"Atualização automática"} · {mode==="personal"?"PF":"PJ"}</p></div>
      {data.connectAvailable&&<button onClick={()=>setConnecting(true)} className="z-primary"><OpenFinanceIcon name="plus" className="h-4 w-4"/>Conectar banco</button>}</div>
    {!data.connectAvailable&&<p role="status" className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">Novas conexões aguardam a conclusão da configuração.</p>}
    {(error||updatesError)&&<p role="alert" className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">{error||updatesError}</p>}
    {connecting&&<OpenFinanceConnect mode={mode} contactEmail={data.contactEmail} onClose={()=>{setConnecting(false);void load();}}/>}
    <OpenFinanceResources data={data} mode={mode} busy={!!busy} onDisconnect={id=>void action(id,"revoke")} onRemove={id=>void action(id,"remove")}/>
    {pending.length>0&&<section className="z-card"><h3 className="text-sm font-semibold">Conexões em andamento e tentativas</h3><p className="mt-1 text-xs text-muted">Continue a autorização ou remova uma tentativa que não concluiu.</p>{pending.map(renderConnection)}</section>}
    {(active.length>0||archived.length>0)&&<details className="z-finance-details"><summary>Permissões e histórico de conexões <span className="text-xs font-normal text-muted">{active.length} ativa(s)</span></summary><div className="mt-3 rounded-2xl border border-line bg-surface p-4"><p className="text-xs leading-5 text-muted">Consulte as autorizações e o histórico. Desconectar interrompe o compartilhamento e preserva os dados recebidos.</p>{active.map(renderConnection)}
      {archived.length>0&&<details className="mt-4 rounded-xl border border-line bg-surface-muted p-4"><summary className="cursor-pointer text-xs font-semibold">Conexões removidas · {archived.length}</summary>{archived.map(renderConnection)}</details>}
    </div></details>}
  </section>;
}
