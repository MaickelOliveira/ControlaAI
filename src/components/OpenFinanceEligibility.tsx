"use client";
import {useState} from "react";
import OpenFinanceIcon from "./OpenFinanceIcon";
export default function OpenFinanceEligibility({mode,onEnabled}:{mode:"personal"|"business";onEnabled:()=>Promise<void>}){
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function enable(){
    if(!confirmed||busy)return;setBusy(true);setError("");
    try{
      const response=await fetch(`/api/open-finance/eligibility?mode=${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({countryCode:"BR",confirmed:true})});
      const result=await response.json();if(!response.ok)throw Error(result.error||"Tente novamente.");await onEnabled();
    }catch(e){setError(e instanceof Error?e.message:"Tente novamente.");}finally{setBusy(false);}
  }
  return <section className="space-y-4 rounded-3xl border border-violet-100 bg-white p-6 shadow-sm" aria-label="Conectar bancos brasileiros">
    <div className="flex items-center gap-3"><OpenFinanceIcon name="bank" className="h-6 w-6 text-violet-700"/><h2 className="text-xl font-semibold text-slate-900">Seus bancos junto da sua Zelo</h2></div>
    <p className="text-sm leading-6 text-slate-600">Conecte suas contas {mode==="personal"?"pessoais":"empresariais"} para acompanhar saldos, movimentações, cartões e investimentos. O Open Finance está disponível para contas bancárias do Brasil.</p>
    <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>Confirmo que vou conectar contas bancárias do Brasil.</label>
    <p className="text-xs leading-5 text-slate-500">Você escolhe cada banco e autoriza diretamente nele. A Zelo nunca pede sua senha bancária.</p>
    <button type="button" disabled={!confirmed||busy} onClick={()=>void enable()} className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?"Preparando…":"Escolher meu banco"}</button>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
