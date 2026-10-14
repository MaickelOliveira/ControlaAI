import type {GoogleAgendaAppointment} from "@/lib/google-agenda-client-contract";
import type {GoogleAgendaConflictActions} from "@/lib/google-agenda-client";
export default function GoogleAgendaSyncStatus({appointment,onRetry,conflictActions,busy=false,locale}:{appointment:GoogleAgendaAppointment;onRetry?:()=>void;conflictActions?:GoogleAgendaConflictActions;busy?:boolean;locale:"pt-BR"|"pt-PT"|"es"}){
 const choice=conflictActions?.choice?.appointmentId===appointment.id?conflictActions.choice:null;
 const es=locale==="es",ptPt=locale==="pt-PT",failed=appointment.googleSyncState==="failed",pending=["queued","running","waiting"].includes(appointment.googleSyncState),conflicted=choice!==null||failed&&appointment.googleSyncFailureCode==="ETAG_CONFLICT";
 const warning=choice?.cancellation??appointment.googleCancellationPending
  ?(es?"Esta reunión cambió en Google. Confirmar la cancelación puede borrar también esa versión en Google.":"Esta reunião foi alterada no Google. Confirmar o cancelamento pode apagar também essa versão no Google.")
  :(es?"Esta reunión cambió en Google. Aplicar el cambio que hiciste en Zelo puede reemplazar ese cambio.":ptPt?"Esta reunião foi alterada no Google. Aplicar a alteração que fez na Zelo pode substituir essa mudança.":"Esta reunião foi alterada no Google. Aplicar a alteração que você fez na Zelo pode substituir essa mudança.");
 const message=conflicted?(choice?.canOverwrite?warning:es?"Esta reunión cambió en Google.":"Esta reunião foi alterada no Google."):failed?(es?"No se pudo confirmar en Google.":"Não foi possível confirmar no Google."):appointment.googleCancellationPending?(es?"Cancelación pendiente en Google.":"Cancelamento aguardando o Google."):appointment.googleMeetPending?(es?"Preparando enlace…":"Preparando link…"):pending?(es?"Actualizando Google…":"Atualizando o Google…"):null;
 if(!message)return null;
 const button="font-semibold text-blue-ink underline disabled:opacity-50";
 return <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" role="status" onClick={event=>event.stopPropagation()}>
  <span className={failed?"text-red-ink":"text-amber-ink"}>{message}</span>
  {conflicted&&conflictActions&&(choice!==null||appointment.googleSyncVersion!==null)&&(choice?<>
   {choice.canOverwrite===null&&<span>{es?"Comprobando el cambio…":"Conferindo a alteração…"}</span>}
   {choice.canOverwrite===false&&<span>{es?"No se puede aplicar este pedido. Consulta Agenda y Google.":"Não é possível aplicar este pedido. Confira a Agenda e o Google."}</span>}
   {choice.canOverwrite===true&&<button type="button" disabled={busy} className={button} onClick={()=>void conflictActions.confirm(choice)}>Confirmar</button>}
   <button type="button" disabled={busy&&choice.canOverwrite!==null} className={button} onClick={conflictActions.cancel}>{es?"Volver":"Voltar"}</button>
  </>:<button type="button" disabled={busy} className={button} onClick={()=>void conflictActions.check(appointment)}>{es?"Revisar el cambio":"Revisar alteração"}</button>)}
  {!conflicted&&onRetry&&appointment.googleSyncVersion!==null&&<button type="button" disabled={busy||appointment.googleSyncState==="running"} onClick={onRetry} className={button}>{failed?(es?"Volver a intentar":"Tentar novamente"):(es?"Verificar de nuevo":"Verificar novamente")}</button>}
 </div>;
}
