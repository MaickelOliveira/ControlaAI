"use client";
import {useEffect,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {fetchCompanySnapshot} from "@/lib/companies-client";
import WorkspaceHeader from "./WorkspaceHeader";
export default function CompanyWorkspaceGate({mode,name,children}:{mode?:string;name?:string;children:ReactNode}){
 const [empty,setEmpty]=useState(false),path=usePathname();
 useEffect(()=>{let live=true;if(mode!=="business")return;fetchCompanySnapshot().then(data=>{if(live)setEmpty(data.enabled&&data.companies.length===0);}).catch(()=>{});return()=>{live=false;};},[mode]);
 if(mode!=="business"||!empty)return children;
 const es=path.startsWith("/es/");
 return <>{/\/dashboard$/.test(path)&&<WorkspaceHeader name={name} mode="business"/>}<section className="rounded-3xl border border-line bg-surface p-8"><h1 className="text-xl font-semibold">{es?"Ninguna empresa activa":"Nenhuma empresa ativa"}</h1><p className="mt-3 text-muted">{es?"Registra o restaura una empresa en el selector de arriba. Tu historial se mantiene.":"Cadastre ou restaure uma empresa no seletor acima. Seu histórico continua guardado."}</p></section></>;
}
