"use client";
import { useEffect, useRef, useState } from "react";
import UiIcon from "./UiIcon";
type Company = { id: string; name: string };
export default function CompanySelector({ es = false }: { es?: boolean }) {
  const [companies, setCompanies] = useState<Company[]>([]), [active, setActive] = useState("");
  const [enabled, setEnabled] = useState(false), [open, setOpen] = useState(false), [creating, setCreating] = useState(false);
  const [name, setName] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/companies", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) { setEnabled(true); throw Error(); }
      const data = await response.json(); setEnabled(data.enabled === true);
      if (data.enabled) { setCompanies(data.companies); setActive(data.activeCompanyId); }
    }).catch(() => { if (!controller.signal.aborted) setError(es ? "No se pudieron cargar las empresas" : "Não foi possível carregar as empresas"); });
    return () => controller.abort();
  }, [es]);
  useEffect(() => {
    function close(event: PointerEvent) { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, []);
  if (!enabled) return null;
  async function choose(companyId?: string) {
    if (busy || (!companyId && !name.trim())) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/companies", { method: companyId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(companyId ? { companyId } : { name: name.trim() }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      window.location.reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível trocar de empresa"); setBusy(false); }
  }
  return <div className="z-company-selector" ref={root}>
    <button className="z-company-trigger" type="button" aria-expanded={open} aria-controls="z-company-menu" disabled={busy} onClick={() => setOpen(value => !value)}>
      <UiIcon name="business" className="h-4 w-4"/><span>{companies.find(company => company.id === active)?.name || (es ? "Empresas" : "Suas empresas")}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="z-company-menu" id="z-company-menu">
      <p>{es ? "Empresa activa" : "Empresa que você está vendo"}</p>
      <div className="z-company-options">{companies.map(company => <button type="button" key={company.id} disabled={busy} aria-pressed={active === company.id} onClick={() => choose(company.id)}><span>{company.name}</span>{active === company.id && <span aria-hidden="true">✓</span>}</button>)}</div>
      {!creating ? <button type="button" className="z-company-add" onClick={() => setCreating(true)}>{es ? "+ Nueva empresa" : "+ Cadastrar empresa"}</button> : <form onSubmit={event => { event.preventDefault(); void choose(); }}>
        <label htmlFor="company-name">{es ? "Nombre de la empresa" : "Nome da empresa"}</label><input id="company-name" autoFocus maxLength={100} required value={name} onChange={event => setName(event.target.value)} />
        <small>{es ? "Una nueva empresa comienza sin registros." : "A nova empresa começa sem registros."}</small><button type="submit" className="z-primary" disabled={busy || !name.trim()}>{busy ? "Salvando…" : es ? "Crear empresa" : "Criar empresa"}</button>
      </form>}
      {error && <p className="z-company-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
