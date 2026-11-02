"use client";
import {useEffect,useRef,useState} from "react";
export type ForecastCategoryTarget={id:string;description:string;category:string;userCategory?:string|null};
export default function BankForecastCategoryDialog({target,mode,categories,onClose,onSaved}:{target:ForecastCategoryTarget;mode:string;categories:string[];onClose:()=>void;onSaved:()=>Promise<void>}){
 const options=[...new Set([...categories,target.category])];
 const [category,setCategory]=useState(target.category),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const dialog=useRef<HTMLFormElement>(null);
 useEffect(()=>{const previous=document.activeElement;return ()=>{if(previous instanceof HTMLElement)previous.focus();};},[]);
 async function save(value:string|null){
  setSaving(true);setError("");
  try{
   const response=await fetch(`/api/open-finance/schedules/category?mode=${encodeURIComponent(mode)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({scheduleId:target.id,category:value})});
   if(!response.ok){const body=await response.json();throw Error(body.error||"Não foi possível salvar.");}
   try{await onSaved();onClose();}catch{setError("Categoria salva. Atualize o extrato para ver a alteração.");}
  }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar.");}finally{setSaving(false);}
 }
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onKeyDown={e=>{
  if(e.key==="Escape"&&!saving)onClose();
  if(e.key==="Tab"){const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)');const first=controls?.[0],last=controls?.[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
  <form ref={dialog} role="dialog" aria-modal="true" aria-labelledby="forecast-category-title" onSubmit={e=>{e.preventDefault();void save(category);}} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
   <h2 id="forecast-category-title" className="text-lg font-bold text-ink">Alterar categoria</h2>
   <p className="mt-3 break-words text-sm text-muted">{target.description}</p>
   <p className="mt-2 text-xs text-muted">Sua escolha vale para esta cobrança e os próximos meses da mesma série. Valor e vencimento permanecem iguais.</p>
   <label htmlFor="forecast-category-select" className="mt-5 block text-sm font-medium text-ink">Categoria</label>
   <select autoFocus id="forecast-category-select" required value={category} disabled={saving} onChange={e=>setCategory(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-sm">{options.map(name=><option key={name}>{name}</option>)}</select>
   {error&&<p role="alert" className="mt-3 text-sm text-red-ink">{error}</p>}
   <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-muted">Cancelar</button><button disabled={saving||!category} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">{saving?"Salvando…":"Salvar categoria"}</button></div>
   {target.userCategory&&<button type="button" disabled={saving} onClick={()=>void save(null)} className="mt-3 text-xs text-muted underline">Voltar à categoria automática</button>}
  </form>
 </div>;
}
