"use client";
import { useEffect, useState } from "react";
import OpenFinanceResources from "./OpenFinanceResources";
import OpenFinanceConnect, { OpenFinancePurposes } from "./OpenFinanceConnect";
import { BANK_CATEGORIES, BANK_STATUSES, bankDate, type BankOverview } from "@/lib/open-finance-display";

async function fetchBankOverview(mode:"personal"|"business",signal?:AbortSignal):Promise<BankOverview|null> {
  const response=await fetch(`/api/open-finance?mode=${mode}`,{cache:"no-store",signal});
  if(response.status===401||response.status===404)return null;
  if(!response.ok)throw new Error("Não foi possível atualizar seus bancos.");
  return response.json();
}
export default function OpenFinanceAccounts({ mode }: { mode: "personal" | "business" }) {
  const [data,setData]=useState<BankOverview|null>(null), [error,setError]=useState(""), [connecting,setConnecting]=useState(false), [busy,setBusy]=useState("");
  async function load(signal?:AbortSignal) {
    setData(await fetchBankOverview(mode,signal));
  }
  useEffect(()=>{
    const controller=new AbortController();
    void fetchBankOverview(mode,controller.signal).then(setData).catch(e=>{if(e.name!=="AbortError")setError(e.message);});
    return ()=>controller.abort();
  },[mode]);
  async function action(id:string, name:"refresh"|"revoke") {
    if(name==="revoke"&&!confirm("Cancelar o compartilhamento? O banco deixará de enviar novos dados. O histórico recebido permanecerá na Zelo."))return;
    setBusy(id);setError("");
    try {
      const response=await fetch(`/api/open-finance/connections/${id}/${name}?mode=${mode}`,{method:"POST"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível concluir.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Tente novamente.");}finally{setBusy("");}
  }
  if(!data)return null;
  return <section aria-label="Bancos conectados" className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Bancos conectados</h2><p className="text-sm text-slate-600">Open Finance Brasil · prévia privada</p></div>
      {data.connectAvailable&&<button onClick={()=>setConnecting(true)} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white">Conectar banco</button>}</div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {connecting&&<OpenFinanceConnect mode={mode} contactEmail={data.contactEmail} onClose={()=>{setConnecting(false);void load();}}/>}
    <OpenFinanceResources data={data}/>
    <div className="border-t border-indigo-100 pt-4"><h3 className="font-semibold text-slate-900">Compartilhamentos e histórico</h3>
      <p className="mt-1 text-sm text-slate-600">Você pode consultar e cancelar suas autorizações aqui, a qualquer momento.</p>
      {data.connections.map(c=><details key={c.id} className="mt-3 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">{c.institution_name} · {BANK_STATUSES[c.status]||"Em verificação"}</summary>
        <div className="mt-3 space-y-2 text-sm text-slate-700"><p>Prazo: {c.consent_expires_at?`até ${bankDate(c.consent_expires_at)}`:"indeterminado — até você cancelar"}</p><p>Categorias: {c.scopes.map(s=>BANK_CATEGORIES[s]||s).join(", ")}</p><OpenFinancePurposes/><p>Última importação concluída: {bankDate(c.last_successful_sync_at)}</p>{c.revoked_at&&<p>Cancelado em {bankDate(c.revoked_at)}</p>}
          {!["revoked","expired","error"].includes(c.status)&&<div className="flex flex-wrap gap-2">{c.status!=="revoking"&&<button disabled={busy===c.id} onClick={()=>void action(c.id,"refresh")} className="rounded-lg border border-indigo-200 px-3 py-2 text-indigo-800 disabled:opacity-50">Voltei do banco / verificar conexão</button>}<button disabled={busy===c.id} onClick={()=>void action(c.id,"revoke")} className="rounded-lg border border-red-200 px-3 py-2 text-red-800 disabled:opacity-50">{c.status==="revoking"?"Tentar confirmar cancelamento":"Cancelar compartilhamento"}</button></div>}
        </div></details>)}
    </div>
    <p className="text-xs text-slate-600">Os dados bancários são exibidos com sua origem. Eles não são somados automaticamente aos lançamentos manuais para evitar duplicação.</p>
  </section>;
}
