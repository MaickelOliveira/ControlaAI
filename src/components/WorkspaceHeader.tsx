"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import DashboardModeToggle from "./DashboardModeToggle";
import CompanySelector from "./CompanySelector";
import UiIcon from "./UiIcon";
import {isDashboardPageAvailable} from "@/lib/dashboard-mode-navigation";
const pages=[
  ["","Dashboard","Dashboard"],["financas","Finanças","Finanzas"],["contas","Contas","Cuentas"],["tarefas","Tarefas","Tareas"],
  ["metas","Metas","Metas"],["veiculos","Veículos","Vehículos"],["lembretes","Lembretes","Recordatorios"],["drive","Drive","Drive"],
  ["agenda","Agenda","Agenda"],["funcionarios","Funcionários","Empleados"],["clientes","Clientes","Clientes"],
  ["supermercado","Supermercado","Supermercado"],["contatos","Contatos","Contactos"],["recorrentes","Recorrentes","Recurrentes"],["configuracoes","Configurações","Configuración"],
];
const adminPages=[["","Visão geral"],["clientes","Clientes"],["faturamento","Faturamento"],["whatsapp","WhatsApp"],["inbox","Inbox"],["configuracoes","Configurações"]];
export default function WorkspaceHeader({name,mode,admin=false}:{name?:string;mode?:string;admin?:boolean}){
  const pathname=usePathname(),es=pathname.startsWith("/es/"),prefix=admin?"/admin":pathname.startsWith("/es/")?"/es/dashboard":pathname.startsWith("/pt/")?"/pt/dashboard":"/dashboard";
  const [open,setOpen]=useState(false),[query,setQuery]=useState("");
  const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const available=(admin?adminPages:pages.filter(([path])=>isDashboardPageAvailable(path,mode==="business"?"business":"personal"))).map(p=>({href:prefix+(p[0]?`/${p[0]}`:""),label:es?(p[2]??p[1]):p[1]}));
  const current=available.find(p=>p.href===pathname)?.label??(admin?"Admin":"Zelo");
  useEffect(()=>{
    function key(event:KeyboardEvent){if((event.ctrlKey||event.metaKey)&&event.key==="k"){event.preventDefault();setOpen(v=>!v);}if(event.key==="Escape")setOpen(false);}
    function outside(event:PointerEvent){if(root.current&&!root.current.contains(event.target as Node))setOpen(false);}
    document.addEventListener("keydown",key);document.addEventListener("pointerdown",outside);
    return()=>{document.removeEventListener("keydown",key);document.removeEventListener("pointerdown",outside);};
  },[]);
  useEffect(()=>{if(open)input.current?.focus();},[open]);
  return <header className="z-topbar">
    <div className="z-topbar-label">{admin?"Painel do dono":mode==="business"?"Empresa":es?"Personal":"Pessoal"}<strong>{current}</strong></div>
    <div className="z-search" ref={root}>
      <button type="button" className="z-search-trigger" aria-expanded={open} aria-controls="workspace-search" onClick={()=>setOpen(v=>!v)}><UiIcon name="search" className="h-4 w-4"/><span>{es?"Buscar una página…":"Buscar uma página…"}</span><kbd className="ml-auto hidden sm:block text-[10px]">⌘ K</kbd></button>
      {open&&<div id="workspace-search" className="z-search-dialog"><label className="sr-only" htmlFor="workspace-query">{es?"Nombre de la página":"Nome da página"}</label><input ref={input} id="workspace-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder={es?"Escribe para buscar":"Digite para buscar"}/><nav aria-label={es?"Resultados":"Resultados da busca"} className="max-h-72 overflow-y-auto mt-2">{available.filter(p=>p.label.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().includes(query.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase())).map(p=><Link key={p.href} href={p.href} onClick={()=>{setOpen(false);setQuery("");}}>{p.label}</Link>)}</nav></div>}
    </div>
    <div className="z-header-preferences">{!admin&&mode&&<DashboardModeToggle mode={mode} es={es}/>}{!admin&&mode==="business"&&<CompanySelector es={es}/>}<ThemeToggle es={es}/></div>
    {name&&<Link href={`${prefix}/configuracoes`} aria-label={es?"Mi perfil":"Meu perfil"} className="hidden sm:grid h-9 w-9 place-items-center rounded-full bg-ink text-surface text-xs font-semibold">{name.split(" ").slice(0,2).map(p=>p[0]).join("")}</Link>}
  </header>;
}
