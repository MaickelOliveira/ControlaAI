import {BANK_CATEGORIES,BANK_STATUSES,bankDate,type BankAuthorization,type BankConnection} from "@/lib/open-finance-display";
import {canArchiveBankConnection,canDisconnectBank,type BankConnectionAction} from "@/lib/open-finance-connection-actions";
import {OpenFinanceAuthorization,OpenFinancePurposes} from "./OpenFinanceConnect";
import OpenFinanceIcon from "./OpenFinanceIcon";

export default function OpenFinanceConnection({connection:c,busy,connectAvailable,onAction,authorization}:{connection:BankConnection;busy:boolean;connectAvailable:boolean;onAction:(id:string,action:BankConnectionAction)=>void;authorization?:BankAuthorization}) {
  const removable=canArchiveBankConnection(c);
  const button="rounded-lg border bg-white px-3 py-2 text-xs font-medium disabled:opacity-50";
  return <article aria-label={`Conexão ${c.institution_name}`} className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><OpenFinanceIcon name="bank" className="h-4 w-4"/></span><div><h4 className="text-sm font-semibold text-slate-900">{c.institution_name}</h4><p className="mt-0.5 text-[11px] text-slate-500">Iniciada em {bankDate(c.created_at)}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c.status==="active"?"bg-emerald-50 text-emerald-700":c.status==="pending"?"bg-amber-50 text-amber-800":"bg-slate-100 text-slate-600"}`}>{BANK_STATUSES[c.status]||"Em verificação"}</span></div>
    <div className="flex flex-wrap gap-2 px-4 pb-4">
      {c.archived_at?<button type="button" disabled={busy} onClick={()=>onAction(c.id,"restore")} className={`${button} border-slate-200 text-slate-700 hover:bg-slate-50`}>Restaurar na lista</button>:<>
        {["active","pending"].includes(c.status)&&<button type="button" disabled={busy} onClick={()=>onAction(c.id,"refresh")} className={`${button} border-slate-200 text-slate-700 hover:bg-slate-50`}>Verificar agora</button>}
        {canDisconnectBank(c)&&<button type="button" disabled={busy} onClick={()=>onAction(c.id,"revoke")} className={`${button} border-red-200 text-red-700 hover:bg-red-50`}>{c.status==="revoking"?"Confirmar cancelamento":c.status==="pending"?"Cancelar autorização":"Desconectar banco"}</button>}
        {removable&&<button type="button" disabled={busy} onClick={()=>onAction(c.id,"remove")} className={`${button} border-red-200 text-red-700 hover:bg-red-50`}>{c.status==="revoking"?"Concluir remoção":c.has_imported_data?"Remover da lista":"Remover tentativa"}</button>}
        {["pending","expired","error"].includes(c.status)&&<button type="button" disabled={busy||!connectAvailable} onClick={()=>onAction(c.id,"recreate")} className={`${button} border-violet-200 text-violet-700 hover:bg-violet-50`}>Gerar novo link de autorização</button>}
      </>}
    </div>
    <details className="border-t border-slate-100 bg-slate-50/50"><summary className="cursor-pointer px-4 py-3 text-xs font-medium text-slate-600">Detalhes da autorização</summary><div className="space-y-3 px-4 pb-4 text-xs leading-5 text-slate-600"><p>Prazo: {c.consent_expires_at?`até ${bankDate(c.consent_expires_at)}`:"indeterminado — até você cancelar"}</p><p>Categorias: {c.scopes.map(s=>BANK_CATEGORIES[s]||s).join(", ")}</p><OpenFinancePurposes/><p>Última atualização concluída: {bankDate(c.last_successful_sync_at)}</p>{c.revoked_at&&<p>Cancelado em {bankDate(c.revoked_at)}</p>}{c.archived_at&&<p>Removida da lista em {bankDate(c.archived_at)}. Restaurar na lista mantém o compartilhamento cancelado.</p>}</div></details>
    {c.status==="pending"&&authorization&&<div className="p-4"><OpenFinanceAuthorization authorization={authorization}/></div>}
  </article>;
}
