"use client";
import Link from "next/link";
import WorkspaceHeader from "./WorkspaceHeader";
import {bankDate} from "@/lib/open-finance-display";
import UiIcon from "./UiIcon";

export default function EclipseDashboardHeader({name,mode,monthLabel,syncAt,updating,es=false,prefix="/dashboard"}:{name:string;mode:string;monthLabel:string;syncAt?:string|null;updating?:boolean;es?:boolean;prefix?:string}){
  return <header className="z-dashboard-header">
    <div className="z-dashboard-greeting"><p className="z-client-greeting">{es?"Hola":"Olá"}, <strong>{name.trim().split(/\s+/)[0]}</strong> 👋</p><h1>{es?"Tu día, bajo control.":"Seu dia, sob controle."}</h1><p>{es?"Gestión financiera y operativa en un solo lugar.":"Gestão financeira e operacional em um só lugar."}</p></div>
    <div className="z-dashboard-controls"><WorkspaceHeader name={name} mode={mode}/><div className="z-dashboard-actions">
      <span className="z-date-pill"><UiIcon name="calendar" className="h-4 w-4"/>{monthLabel}</span>
      {syncAt&&<Link href={`${prefix}/contas`} className="z-bank-sync"><span className={`h-2 w-2 rounded-full ${updating?"bg-amber-500":"bg-emerald-500"}`}/><span>{es?"Bancos actualizados":"Bancos atualizados"}<small>{updating?(es?"Actualizando…":"Atualizando…"):bankDate(syncAt)}</small></span></Link>}
      <Link href={`${prefix}/financas`} className="z-primary">+ {es?"Movimiento":"Movimentação"}</Link>
    </div></div>
  </header>;
}
