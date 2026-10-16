"use client";
import {useEffect,useState} from "react";

type AccountOption={id:string;name:string;type:"bank"|"credit_card"};
type PreviewItem={id:string;description:string;amount:number;date:string;source:"web"|"whatsapp";accountId:string|null};
const money=(amount:number)=>amount.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");

export default function PlatformAccountMoveDialog({mode,accounts,onClose,onMoved}:{mode:string;accounts:AccountOption[];onClose:()=>void;onMoved:(count:number,accountName:string)=>void}){
 const [accountId,setAccountId]=useState("");
 const [count,setCount]=useState<number|null>(null);
 const [items,setItems]=useState<PreviewItem[]>([]);
 const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set());
 const [page,setPage]=useState(0);
 const [retry,setRetry]=useState(0);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const bankAccounts=accounts.filter(account=>account.type==="bank");

 useEffect(()=>{
  if(!mode||!accountId)return;
  const controller=new AbortController();
  const query=new URLSearchParams({mode,accountId,page:String(page)});
  fetch(`/api/finances/platform-account?${query}`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||"Não foi possível conferir os lançamentos.");return data as {count:number;items:PreviewItem[]};})
   .then(data=>{if(!controller.signal.aborted){setCount(data.count);setItems(current=>page===0?data.items:[...current,...data.items.filter(item=>!current.some(loaded=>loaded.id===item.id))]);setLoading(false);}})
   .catch(cause=>{if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:"Não foi possível conferir os lançamentos.");setLoading(false);}});
  return()=>controller.abort();
 },[mode,accountId,page,retry]);

 function chooseAccount(value:string){setAccountId(value);setCount(null);setItems([]);setSelectedIds(new Set());setPage(0);setError("");setLoading(!!value);}
 function toggle(id:string){setSelectedIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else if(next.size<500)next.add(id);return next;});}
 function toggleLoaded(){setSelectedIds(current=>{const allSelected=items.every(item=>current.has(item.id));const next=new Set(current);for(const item of items){if(allSelected)next.delete(item.id);else if(next.size<500)next.add(item.id);}return next;});}

 async function move(){
  if(!accountId||selectedIds.size===0||saving)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/api/finances/platform-account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,accountId,ids:[...selectedIds]})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Não foi possível organizar os lançamentos.");
   onMoved(data.moved,data.accountName);
  }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível organizar os lançamentos.");setSaving(false);}
 }

 return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
  <div role="dialog" aria-modal="true" aria-labelledby="move-platform-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
   <h2 id="move-platform-title" className="text-lg font-bold text-ink">Organizar lançamentos por conta</h2>
   <p className="mt-2 text-sm text-muted">Escolha a conta de destino e marque somente os lançamentos que deseja mudar. Os registros do WhatsApp podem entrar automaticamente na conta Dinheiro.</p>
   <label htmlFor="move-platform-account" className="mt-4 block text-sm font-semibold text-ink">Conta de destino</label>
   <select id="move-platform-account" value={accountId} disabled={saving} onChange={event=>chooseAccount(event.target.value)}
    className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink">
    <option value="">Selecione uma conta</option>
    {bankAccounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}
   </select>
   {bankAccounts.length===0&&<p className="mt-2 text-xs text-amber-ink">Crie uma conta em Contas para organizar os lançamentos.</p>}
   {loading&&<p role="status" className="mt-3 text-sm text-muted">Conferindo os lançamentos...</p>}
   {count!==null&&<div className="mt-4">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-ink">
     <p role="status">{count===0?"Nenhum lançamento precisa mudar para esta conta.":`${count} lançamento(s) disponíveis · ${selectedIds.size} selecionado(s)`}</p>
     {items.length>0&&<button type="button" onClick={toggleLoaded} disabled={saving} className="text-amber-ink underline">{items.every(item=>selectedIds.has(item.id))?"Desmarcar exibidos":"Marcar exibidos"}</button>}
    </div>
    {items.length>0&&<div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line">
     {items.map(item=><label key={item.id} className="flex cursor-pointer items-start gap-3 border-b border-line px-3 py-3 last:border-0 hover:bg-surface-muted">
      <input type="checkbox" aria-label={`Selecionar ${item.description}`} checked={selectedIds.has(item.id)} disabled={saving||selectedIds.size>=500&&!selectedIds.has(item.id)} onChange={()=>toggle(item.id)} className="mt-1 h-4 w-4 shrink-0 accent-amber-500"/>
      <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-ink">{item.description} · {money(item.amount)}</span><span className="mt-1 block text-xs text-muted">{date(item.date)} · {item.source==="whatsapp"?"WhatsApp":"Painel"} · {item.accountId?accounts.find(account=>account.id===item.accountId)?.name??"Conta anterior":"Sem conta"} → {accounts.find(account=>account.id===accountId)?.name}</span></span>
     </label>)}
    </div>}
    {items.length<count&&!error&&<button type="button" disabled={loading||saving} onClick={()=>{setLoading(true);setPage(current=>current+1);}} className="mt-2 text-sm font-medium text-amber-ink underline">Carregar mais lançamentos</button>}
    {count>500&&<p className="mt-2 text-xs text-muted">É possível selecionar até 500 lançamentos por vez.</p>}
   </div>}
   {error&&<p role="alert" className="mt-3 text-sm text-red-ink">{error} <button type="button" onClick={()=>{setError("");setLoading(true);setRetry(current=>current+1);}} className="underline">Atualizar lista</button></p>}
   <p className="mt-3 text-xs text-subtle">Só os lançamentos marcados serão reorganizados. Isso não transfere dinheiro, não altera valores ou datas e não mexe nas movimentações recebidas do banco.</p>
   <div className="mt-5 flex gap-3">
    <button type="button" disabled={saving} onClick={onClose} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm">Cancelar</button>
    <button type="button" disabled={!accountId||selectedIds.size===0||loading||saving} onClick={move} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">{saving?"Salvando...":`Vincular ${selectedIds.size} selecionado(s)`}</button>
   </div>
  </div>
 </div>;
}
