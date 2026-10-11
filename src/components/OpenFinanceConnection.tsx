import BankLogo from "./BankLogo";
import {BANK_CATEGORIES,BANK_STATUSES,bankDate,type BankAuthorization,type BankConnection} from "@/lib/open-finance-display";
import {canArchiveBankConnection,canDisconnectBank,type BankConnectionAction} from "@/lib/open-finance-connection-actions";
import {OpenFinanceAuthorization,OpenFinancePurposes} from "./OpenFinanceConnect";

export default function OpenFinanceConnection({connection:c,busy,connectAvailable,onAction,authorization}:{connection:BankConnection;busy:boolean;connectAvailable:boolean;onAction:(id:string,action:BankConnectionAction)=>void;authorization?:BankAuthorization}) {
  const removable=canArchiveBankConnection(c);
  const button="rounded-lg border bg-surface px-3 py-2 text-xs font-medium disabled:opacity-50";
  return <article aria-label={`Conexão ${c.institution_name}`} className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-center gap-3"><BankLogo institutionId={c.institution_id} size={36}/><div><h4 className="text-sm font-semibold text-ink">{c.institution_name}</h4><p className="mt-0.5 text-[11px] text-muted">Iniciada em {bankDate(c.created_at)}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c.status==="active"?"bg-emerald-soft text-emerald-ink":c.status==="pending"?"bg-amber-soft text-amber-ink":"bg-surface-muted text-muted"}`}>{BANK_STATUSES[c.status]||"Em verificação"}</span></div>
    <div className="flex flex-wrap gap-2 px-4 pb-4">
      {c.archived_at?<button type="button" disabled={busy} onClick={()=>onAction(c.id,"restore")} className={`${button} border-line text-ink hover:bg-surface-muted`}>Restaurar na lista</button>:<>
        {["active","pending"].includes(c.status)&&<button type="button" disabled={busy} onClick={()=>onAction(c.id,"refresh")} className={`${button} border-line text-ink hover:bg-surface-muted`}>Verificar agora</button>}
        {canDisconnectBank(c)&&<button type="button" disabled={busy} onClick={()=>onAction(c.id,"revoke")} className={`${button} border-line text-red-ink hover:bg-red-soft`}>{c.status==="revoking"?"Confirmar cancelamento":c.status==="pending"?"Cancelar autorização":"Desconectar banco"}</button>}
        {removable&&<button type="button" disabled={busy} onClick={()=>onAction(c.id,"remove")} className={`${button} border-line text-red-ink hover:bg-red-soft`}>{c.status==="revoking"?"Concluir remoção":c.has_imported_data?"Remover da lista":"Remover tentativa"}</button>}
        {["pending","expired","error"].includes(c.status)&&<button type="button" disabled={busy||!connectAvailable} onClick={()=>onAction(c.id,"recreate")} className={`${button} border-line text-violet-ink hover:bg-violet-soft`}>Gerar novo link de autorização</button>}
      </>}
    </div>
    <details className="border-t border-line bg-surface-muted/50"><summary className="cursor-pointer px-4 py-3 text-xs font-medium text-muted">Detalhes da autorização</summary><div className="space-y-3 px-4 pb-4 text-xs leading-5 text-muted"><p>Prazo: {c.consent_expires_at?`até ${bankDate(c.consent_expires_at)}`:"indeterminado — até você cancelar"}</p><p>Categorias: {c.scopes.map(s=>BANK_CATEGORIES[s]||s).join(", ")}</p><OpenFinancePurposes/><p>Última atualização concluída: {bankDate(c.last_successful_sync_at)}</p>{c.revoked_at&&<p>Cancelado em {bankDate(c.revoked_at)}</p>}{c.archived_at&&<p>Removida da lista em {bankDate(c.archived_at)}. Restaurar na lista mantém o compartilhamento cancelado.</p>}</div></details>
    {c.status==="pending"&&authorization&&<div className="p-4"><OpenFinanceAuthorization authorization={authorization}/></div>}
  </article>;
}
