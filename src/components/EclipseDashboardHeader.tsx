"use client";
import Link from "next/link";
import WorkspaceHeader from "./WorkspaceHeader";
import type {BankSyncStatus} from "@/lib/bank-sync-status";
import UiIcon from "./UiIcon";

export default function EclipseDashboardHeader({name,mode,monthLabel,bankStatus,es=false,prefix="/dashboard"}:{name:string;mode:string;monthLabel:string;bankStatus?:BankSyncStatus|null;es?:boolean;prefix?:string}){
  return <header className="z-dashboard-header">
    <div className="z-dashboard-greeting"><p className="z-client-greeting">{es?"Hola":"Olá"}, <strong>{name.trim().split(/\s+/)[0]}</strong> 👋</p><h1>{es?"Tu día, bajo control.":"Seu dia, sob controle."}</h1><p>{es?"Gestión financiera y operativa en un solo lugar.":"Gestão financeira e operacional em um só lugar."}</p></div>
    <div className="z-dashboard-controls"><WorkspaceHeader name={name} mode={mode}/><div className="z-dashboard-actions">
      <span className="z-date-pill"><UiIcon name="calendar" className="h-4 w-4"/>{monthLabel}</span>
      {bankStatus&&<Link href={`${prefix}/contas`} className="z-bank-sync" aria-label={`${bankStatus.title}. ${bankStatus.detail}`}><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${bankStatus.state==="updated"?"bg-emerald-500":bankStatus.state==="failed"||bankStatus.state==="authorization"?"bg-red-500":"bg-amber-500"}`}/><span>{bankStatus.title}<small>{bankStatus.detail}</small></span></Link>}
      <Link href={`${prefix}/financas`} className="z-primary">+ {es?"Movimiento":"Movimentação"}</Link>
    </div></div>
  </header>;
}
