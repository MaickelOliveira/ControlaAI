import type {GoogleAgendaAppointment} from "@/lib/google-agenda-client-contract";
export default function GoogleAgendaSyncStatus({appointment,onRetry,busy=false,locale}:{appointment:GoogleAgendaAppointment;onRetry?:()=>void;busy?:boolean;locale:"pt-BR"|"pt-PT"|"es"}){
 const es=locale==="es",failed=appointment.googleSyncState==="failed",pending=["queued","running","waiting"].includes(appointment.googleSyncState);
 const message=failed?(es?"No se pudo confirmar en Google.":"Não foi possível confirmar no Google."):appointment.googleCancellationPending?(es?"Cancelación pendiente en Google.":"Cancelamento aguardando o Google."):appointment.googleMeetPending?(es?"Preparando enlace…":"Preparando link…"):pending?(es?"Actualizando Google…":"Atualizando o Google…"):null;
 if(!message)return null;
 return <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" role="status"><span className={failed?"text-red-ink":"text-amber-ink"}>{message}</span>{onRetry&&appointment.googleSyncVersion!==null&&<button type="button" disabled={busy||appointment.googleSyncState==="running"} onClick={event=>{event.stopPropagation();onRetry();}} className="font-semibold text-blue-ink underline disabled:opacity-50">{failed?(es?"Volver a intentar":"Tentar novamente"):(es?"Verificar de nuevo":"Verificar novamente")}</button>}</div>;
}
