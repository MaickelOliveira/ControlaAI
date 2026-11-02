"use client";
import {useState} from "react";

export function CategoryCreator({type,onCreated,disabled=false}:{type:"expense"|"income";onCreated:(name:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false),[name,setName]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");
 async function create(){
  if(!name.trim()||saving)return;setSaving(true);setError("");
  try{
   const response=await fetch("/api/categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,name:name.trim()})});
   const result=await response.json();if(!response.ok)throw Error(result.error||"Não foi possível cadastrar a categoria.");
   onCreated(result.name);setName("");setOpen(false);
  }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível cadastrar a categoria.");}finally{setSaving(false);}
 }
 return <div className="min-w-0 max-w-full">{!open?<button type="button" disabled={disabled} onClick={()=>setOpen(true)} className="mt-2 text-xs font-semibold text-amber-ink">+ Cadastrar nova categoria</button>:<div className="mt-2 space-y-2 rounded-xl border border-line p-3">
  <label className="block text-xs text-muted">Nome da nova categoria<input aria-label="Nome da nova categoria" autoFocus maxLength={100} value={name} disabled={saving} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void create();}}} className="mt-1 w-full min-w-0 rounded-lg border border-line bg-surface p-2 text-sm"/></label>
  {error&&<p role="alert" className="text-xs text-red-ink">{error}</p>}
  <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={()=>{setOpen(false);setError("");}} className="rounded-lg border border-line px-3 py-2 text-xs">Cancelar cadastro</button><button type="button" disabled={saving||!name.trim()} onClick={()=>void create()} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary">{saving?"Cadastrando…":"Cadastrar e selecionar"}</button></div>
 </div>}</div>;
}

export default function FinanceCategorySelect({value,onChange,categories,type,id,required=false,disabled=false,className,placeholder="Escolha uma categoria",onCreated}:{value:string;onChange:(name:string)=>void;categories:readonly string[];type:"expense"|"income";id?:string;required?:boolean;disabled?:boolean;className?:string;placeholder?:string;onCreated?:(name:string)=>void}){
 const [added,setAdded]=useState<{name:string;type:"expense"|"income"}[]>([]);
 const options=[...new Set([...categories,...added.filter(item=>item.type===type).map(item=>item.name),...(value?[value]:[])])];
 return <div className="min-w-0 w-full"><select id={id} aria-label={id?undefined:"Categoria"} value={value} required={required} disabled={disabled} onChange={e=>onChange(e.target.value)} className={className??"w-full rounded-xl border border-line bg-surface p-3 text-sm"}><option value="">{placeholder}</option>{options.map(name=><option key={name}>{name}</option>)}</select><CategoryCreator type={type} disabled={disabled} onCreated={name=>{setAdded(old=>[...old,{name,type}]);onChange(name);onCreated?.(name);}}/></div>;
}
