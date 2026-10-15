"use client";
import {useEffect,useState} from "react";

type AccountOption={id:string;name:string;type:"bank"|"credit_card"};

export default function PlatformAccountMoveDialog({mode,accounts,onClose,onMoved}:{mode:string;accounts:AccountOption[];onClose:()=>void;onMoved:(count:number,accountName:string)=>void}){
 const [accountId,setAccountId]=useState("");
 const [count,setCount]=useState<number|null>(null);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const bankAccounts=accounts.filter(account=>account.type==="bank");

 useEffect(()=>{
  if(!mode||!accountId)return;
  const controller=new AbortController();
  const query=new URLSearchParams({mode,accountId});
  fetch(`/api/finances/platform-account?${query}`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||"Não foi possível conferir os lançamentos.");return data;})
   .then(data=>{if(!controller.signal.aborted){setCount(data.count);setLoading(false);}})
   .catch(cause=>{if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:"Não foi possível conferir os lançamentos.");setLoading(false);}});
  return()=>controller.abort();
 },[mode,accountId]);

 async function move(){
  if(!accountId||!count||saving)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/api/finances/platform-account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,accountId})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Não foi possível organizar os lançamentos.");
   onMoved(data.moved,data.accountName);
  }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível organizar os lançamentos.");setSaving(false);}
 }

 return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
  <div role="dialog" aria-modal="true" aria-labelledby="move-platform-title" className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
   <h2 id="move-platform-title" className="text-lg font-bold text-ink">Organizar lançamentos da plataforma</h2>
   <p className="mt-2 text-sm text-muted">Escolha uma conta criada na Zelo. Os lançamentos feitos diretamente na plataforma serão vinculados a ela, inclusive os de meses anteriores.</p>
   <label htmlFor="move-platform-account" className="mt-4 block text-sm font-semibold text-ink">Conta de destino</label>
   <select id="move-platform-account" value={accountId} disabled={saving} onChange={event=>{setAccountId(event.target.value);setCount(null);setError("");setLoading(!!event.target.value);}}
    className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink">
    <option value="">Selecione uma conta</option>
    {bankAccounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}
   </select>
   {bankAccounts.length===0&&<p className="mt-2 text-xs text-amber-ink">Crie uma conta em Contas para organizar os lançamentos.</p>}
   {loading&&<p role="status" className="mt-3 text-sm text-muted">Conferindo todos os meses...</p>}
   {count!==null&&!loading&&<p role="status" className="mt-3 text-sm font-semibold text-ink">{count===0?"Nenhum lançamento precisa mudar de conta.":`${count} lançamento(s) serão vinculados à conta escolhida.`}</p>}
   {error&&<p role="alert" className="mt-3 text-sm text-red-ink">{error}</p>}
   <p className="mt-3 text-xs text-subtle">Isso apenas organiza os registros. Não transfere dinheiro, não altera valores ou datas e não mexe nas movimentações recebidas do banco.</p>
   <div className="mt-5 flex gap-3">
    <button type="button" disabled={saving} onClick={onClose} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm">Cancelar</button>
    <button type="button" disabled={!accountId||!count||loading||saving} onClick={move} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">{saving?"Salvando...":"Vincular lançamentos"}</button>
   </div>
  </div>
 </div>;
}
