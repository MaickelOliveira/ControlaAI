"use client";
import { useEffect, useRef, useState } from "react";
import UiIcon from "./UiIcon";
import {fetchCompanySnapshot} from "@/lib/companies-client";
type Company = { id: string; name: string };
export default function CompanySelector({ es = false }: { es?: boolean }) {
  const [companies, setCompanies] = useState<Company[]>([]), [active, setActive] = useState("");
  const [enabled, setEnabled] = useState(false), [open, setOpen] = useState(false), [creating, setCreating] = useState(false);
  const [name, setName] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [archived,setArchived]=useState<Company[]>([]),[removing,setRemoving]=useState<Company|null>(null),[confirmation,setConfirmation]=useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live=true;
    fetchCompanySnapshot().then(data=>{if(!live)return;setEnabled(data.enabled===true);if(data.enabled){setCompanies(data.companies);setActive(data.activeCompanyId??"");setArchived(data.archivedCompanies??[]);}}).catch(()=>{if(live){setEnabled(true);setError(es?"No se pudieron cargar las empresas":"Não foi possível carregar as empresas");}});
    return()=>{live=false;};
  }, [es]);
  useEffect(() => {
    function close(event: PointerEvent) { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, []);
  if (!enabled) return null;
  function label(company: Company, list=companies) {
    const matches = list.filter(item => item.name === company.name);
    return matches.length > 1 ? `${company.name} · ${matches.findIndex(item => item.id === company.id) + 1}` : company.name;
  }
  async function rename() {
    if (busy || !editing || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/companies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: editing, name: name.trim() }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      window.location.reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível renomear a empresa"); setBusy(false); }
  }
  async function choose(companyId?: string) {
    if (busy || (!companyId && !name.trim())) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/companies", { method: companyId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(companyId ? { companyId } : { name: name.trim() }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      window.location.reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível trocar de empresa"); setBusy(false); }
  }
  async function remove(){
    if(busy||!removing||confirmation!==removing.name)return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/companies",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyId:removing.id,confirmation})});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      if(data.mode==="personal")window.location.assign(es?"/es/dashboard":window.location.pathname.startsWith("/pt/")?"/pt/dashboard":"/dashboard");else window.location.reload();
    }catch(failure){setError(failure instanceof Error?failure.message:"Não foi possível excluir a empresa");setBusy(false);}
  }
  async function restore(companyId:string){
    if(busy)return;setBusy(true);setError("");
    try{const response=await fetch("/api/companies?action=restore",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyId})});const data=await response.json();if(!response.ok)throw Error(data.error);window.location.reload();}
    catch(failure){setError(failure instanceof Error?failure.message:"Não foi possível restaurar a empresa");setBusy(false);}
  }
  return <div className="z-company-selector" ref={root}>
    <button className="z-company-trigger" type="button" aria-expanded={open} aria-controls="z-company-menu" disabled={busy} onClick={() => setOpen(value => !value)}>
      <UiIcon name="business" className="h-4 w-4"/><span>{companies.find(company => company.id === active) ? label(companies.find(company => company.id === active)!) : (es ? "Empresas" : "Suas empresas")}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="z-company-menu" id="z-company-menu">
      <p>{es ? "Empresa activa" : "Empresa que você está vendo"}</p>
      <div className="z-company-options">{companies.map(company => <div className="z-company-option" key={company.id}><button type="button" disabled={busy} aria-pressed={active === company.id} onClick={() => choose(company.id)}><span>{label(company)}</span>{active === company.id && <span aria-hidden="true">✓</span>}</button><button type="button" className="z-company-rename" disabled={busy} aria-label={`${es ? "Renombrar" : "Renomear"} ${label(company)}`} onClick={() => { setEditing(company.id); setRemoving(null); setCreating(false); setName(company.name); setError(""); }}>{es ? "Editar" : "Renomear"}</button><button type="button" className="z-company-rename text-red-500" disabled={busy} aria-label={`${es?"Eliminar":"Excluir"} ${label(company)}`} onClick={()=>{setRemoving(company);setConfirmation("");setEditing(null);setCreating(false);setError("");}}><UiIcon name="trash" className="h-4 w-4"/></button></div>)}</div>
      {removing?<form onSubmit={event=>{event.preventDefault();void remove();}}>
        <strong>{es?"Eliminar":"Excluir"} {label(removing)}?</strong><p className="text-sm text-muted">{es?"El historial se conserva y puedes restaurar la empresa. Sus bancos se desconectarán; los otros no cambian.":"O histórico fica guardado e você pode restaurar a empresa. Os bancos dela serão desconectados; os demais continuam."}</p>
        {companies.length===1&&<small>{es?"Volverás al modo personal.":"Você voltará ao modo Pessoal."}</small>}
        <label htmlFor="company-remove">{es?"Escribe el nombre exacto":"Digite o nome exato"}: {removing.name}</label><input id="company-remove" autoFocus autoComplete="off" maxLength={100} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>
        <div className="z-company-editor-actions"><button type="button" disabled={busy} onClick={()=>setRemoving(null)}>Cancelar</button><button type="submit" className="z-primary" disabled={busy||confirmation!==removing.name}>{busy?"Aguarde…":es?"Confirmar eliminación":"Confirmar exclusão"}</button></div>
      </form>:editing ? <form onSubmit={event => { event.preventDefault(); void rename(); }}>
        <label htmlFor="company-rename">{es ? "Nuevo nombre" : "Novo nome da empresa"}</label><input id="company-rename" autoFocus maxLength={100} required value={name} onChange={event => setName(event.target.value)}/>
        <small>{es ? "Los registros y conexiones se mantienen." : "Seus registros e conexões serão mantidos."}</small>
        <div className="z-company-editor-actions"><button type="button" disabled={busy} onClick={() => { setEditing(null); setName(""); }}>{es ? "Cancelar" : "Cancelar"}</button><button type="submit" className="z-primary" disabled={busy || !name.trim()}>{busy ? "Salvando…" : es ? "Guardar nombre" : "Salvar nome"}</button></div>
      </form> : !creating ? <button type="button" className="z-company-add" onClick={() => { setCreating(true); setName(""); setError(""); }}>{es ? "+ Nueva empresa" : "+ Cadastrar empresa"}</button> : <form onSubmit={event => { event.preventDefault(); void choose(); }}>
        <label htmlFor="company-name">{es ? "Nombre de la empresa" : "Nome da empresa"}</label><input id="company-name" autoFocus maxLength={100} required value={name} onChange={event => setName(event.target.value)} />
        <small>{es ? "Una nueva empresa comienza sin registros." : "A nova empresa começa sem registros."}</small><button type="submit" className="z-primary" disabled={busy || !name.trim()}>{busy ? "Salvando…" : es ? "Crear empresa" : "Criar empresa"}</button>
      </form>}
      {!removing&&!editing&&archived.length>0&&<details className="mt-3 text-sm"><summary>{es?"Empresas archivadas":"Empresas arquivadas"} · {archived.length}</summary><p className="py-2 text-muted">{es?"Restaurar mantiene el historial. Para volver a usar un banco, conéctalo de nuevo.":"Restaurar recupera o histórico. Para voltar a usar um banco, conecte novamente."}</p>{archived.map(c=><div key={c.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 truncate">{label(c,archived)}</span><button type="button" className="z-company-rename" aria-label={`${es?"Restaurar":"Restaurar"} ${label(c,archived)}`} disabled={busy} onClick={()=>void restore(c.id)}>{es?"Restaurar":"Restaurar"}</button></div>)}</details>}
      {error && <p className="z-company-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
