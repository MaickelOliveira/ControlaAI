"use client";
import {useState} from "react";
import type {LedgerEntry} from "@/lib/finance-ledger";
export default function BankCategoryDialog({entry,mode,categories,onClose,onSaved}:{entry:LedgerEntry;mode:string;categories:string[];onClose:()=>void;onSaved:()=>void}){
  const [category,setCategory]=useState(categories.includes(entry.category)?entry.category:"");
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  async function save(value:string|null){
    setSaving(true);setError("");
    try{
      const response=await fetch(`/api/open-finance/movements/category?mode=${mode}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({movementId:entry.bank?.id,category:value})});
      if(!response.ok){const body=await response.json();throw Error(body.error||"Não foi possível salvar a categoria.");}
      onSaved();
    }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar a categoria.");}finally{setSaving(false);}
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
    <form role="dialog" aria-modal="true" aria-labelledby="bank-category-heading" onSubmit={e=>{e.preventDefault();void save(category);}} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
      <h2 id="bank-category-heading" className="text-lg font-bold text-slate-900">Categoria da movimentação</h2>
      <p className="mt-3 break-words text-sm text-slate-600">{entry.description}</p>
      <p className="mt-2 text-xs text-slate-500">Sua escolha organiza o extrato e os gráficos da Zelo. Valor, data e descrição recebidos do banco permanecem iguais.</p>
      <label htmlFor="bank-category-select" className="mt-5 block text-sm font-medium text-slate-700">Categoria</label>
      <select id="bank-category-select" required value={category} disabled={saving} onChange={e=>setCategory(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="" disabled>Escolha uma categoria</option>{categories.map(name=><option key={name}>{name}</option>)}</select>
      {entry.categorySource==="description"&&<p className="mt-2 text-xs text-amber-700">Categoria sugerida pela descrição. Confira se corresponde ao pagamento.</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-500">Cancelar</button><button disabled={saving||!category} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?"Salvando…":"Salvar categoria"}</button></div>
      {entry.bank?.user_category&&<button type="button" disabled={saving} onClick={()=>void save(null)} className="mt-3 text-xs text-slate-500 underline">Voltar à categoria automática</button>}
    </form>
  </div>;
}
