import "server-only";
import type * as Service from "./google-event-service";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {captureGoogleWhatsAppWorkspace,type GoogleWhatsAppIntent} from "./google-whatsapp-intent";
import {commitGoogleWhatsAppIntents,type GoogleWhatsAppEffects,type GoogleWhatsAppReceipt} from "./google-whatsapp-commit";
import {safeGoogleMeetHref} from "./google-agenda-client-contract";
import {todayStrBR,formatDateTimeBR} from "./date-br";
import {replyAgendaCreated,replyAgendaUpdated,replyMeetCreated} from "./bot-replies";

export type GoogleWhatsAppRecord=Service.WorkspaceAppointment|Service.WorkspaceMeet;
export type GoogleWhatsAppServiceApi=Pick<typeof Service,"listWorkspaceAppointments"|"getWorkspaceAppointment"|"getWorkspaceMeet"|"createWorkspaceAppointment"|"createWorkspaceMeet"|"updateWorkspaceAppointment"|"cancelWorkspaceAppointment"|"addWorkspaceAppointmentMeet"|"retryWorkspaceGoogleEvent">;
async function confirmedRead<T>(userId:string,read:(scope:GoogleWorkspace)=>Promise<T>):Promise<T>{
 const scope=captureGoogleWhatsAppWorkspace(userId),value=await read(scope);
 if(googleWorkspaceKey(scope)!==googleWorkspaceKey(captureGoogleWhatsAppWorkspace(userId)))throw Error("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");return value;
}
/** Factory keeps tests effect-free. Production must supply only the scoped
 * service; no legacy OAuth/calendar function is accepted or called here. */
export function createGoogleWhatsAppConsumer(api:GoogleWhatsAppServiceApi){
 const effects:GoogleWhatsAppEffects<GoogleWhatsAppRecord>={
  async execute(scope,intent){
   const expectation:Service.GoogleEventExpectation={clientMutationId:intent.clientMutationId,expectedGoogleSyncVersion:intent.expectedGoogleSyncVersion};let result:GoogleWhatsAppRecord|null;
   switch(intent.operation){
    case "create_appointment":result=await api.createWorkspaceAppointment(scope,intent.clientMutationId,intent.payload as Service.WorkspaceEventInput,"whatsapp");break;
    case "create_meet":result=await api.createWorkspaceMeet(scope,intent.clientMutationId,intent.payload as Service.WorkspaceMeetInput,"whatsapp");break;
    case "update_appointment":result=await api.updateWorkspaceAppointment(scope,intent.appointmentId!,intent.payload,expectation);break;
    case "cancel_appointment":result=await api.cancelWorkspaceAppointment(scope,intent.appointmentId!,expectation);break;
    case "add_meet":result=await api.addWorkspaceAppointmentMeet(scope,intent.appointmentId!,expectation);break;
    case "retry":result=await api.retryWorkspaceGoogleEvent(scope,intent.appointmentId!,expectation);break;
    default:throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
   }
   if(!result)throw Error("GOOGLE_EVENT_ORIGIN_MISSING");return result;
  },
  read:(scope,intent,id)=>intent.operation==="create_meet"?api.getWorkspaceMeet(scope,id):api.getWorkspaceAppointment(scope,id),
 };
 const appointments=(userId:string)=>confirmedRead(userId,scope=>api.listWorkspaceAppointments(scope));
 return Object.freeze({
  commit:(userId:string,phone:string,intents:readonly GoogleWhatsAppIntent[],receipts:readonly GoogleWhatsAppReceipt[]=[])=>commitGoogleWhatsAppIntents(userId,phone,intents,effects,receipts),
  appointment:(userId:string,id:string)=>confirmedRead(userId,scope=>api.getWorkspaceAppointment(scope,id)),
  appointments,
  async byKeyword(userId:string,keyword:string){const lower=keyword.toLowerCase();return (await appointments(userId)).filter(row=>row.status==="scheduled"&&(row.title.toLowerCase().includes(lower)||row.description?.toLowerCase().includes(lower)||row.location?.toLowerCase().includes(lower)));},
  async upcoming(userId:string,days=7){
   if(!Number.isInteger(days)||days<1||days>365)throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
   const start=new Date(`${todayStrBR()}T00:00:00-03:00`),end=new Date(start);end.setDate(end.getDate()+days);
   return (await appointments(userId)).filter(row=>row.status==="scheduled"&&Date.parse(row.startAt)>=start.getTime()&&Date.parse(row.startAt)<end.getTime());
  },
  async inRange(userId:string,from:string,to:string){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
   const start=new Date(`${from}T00:00:00-03:00`),end=new Date(`${to}T00:00:00-03:00`);end.setDate(end.getDate()+1);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
   return (await appointments(userId)).filter(row=>row.status==="scheduled"&&Date.parse(row.startAt)>=start.getTime()&&Date.parse(row.startAt)<end.getTime());
  },
 });
}
const localized=(locale:string|undefined,pt:string,es:string,ptPt=pt)=>locale==="es"?es:locale==="pt-PT"?ptPt:pt;
export function googleWhatsAppReadyMeetLink(record:GoogleWhatsAppRecord):string|null{
 return record.googleSyncState==="succeeded"&&record.googleMeetPending===false?safeGoogleMeetHref(record.meetLink):null;
}
/** Confirm the saved Zelo row separately from pending Google work. This function
 * never sends messages or claims invitations were delivered. */
export function googleWhatsAppConfirmation(intent:GoogleWhatsAppIntent,result:GoogleWhatsAppRecord|null,locale?:string):string{
 if(!result)return localized(locale,"O pedido já foi confirmado. Confira o resultado na Agenda.","El pedido ya fue confirmado. Consulta el resultado en Agenda.");
 const link=googleWhatsAppReadyMeetLink(result),display={...result,meetLink:link??undefined};let text:string;
 if(intent.operation==="cancel_appointment"){
  text=localized(locale,`Cancelado na Zelo.\n\n📅 *${result.title}*`,`Cancelado en Zelo.\n\n📅 *${result.title}*`);
  return result.googleCancellationPending?text+localized(locale,"\n\nO cancelamento no Google ainda precisa ser concluído. Confira na Agenda.","\n\nLa cancelación en Google aún debe completarse. Consulta Agenda."):text;
 }
 if(intent.operation==="update_appointment"&&intent.payload.status==="done")return localized(locale,`✅ Marquei como realizado.\n\n📅 ${result.title}`,`✅ La marqué como realizada.\n\n📅 ${result.title}`);
 if(intent.operation==="create_meet"||intent.operation==="create_appointment"&&intent.payload.withMeet===true)text=replyMeetCreated(display,undefined,locale);
 else if(intent.operation==="create_appointment")text=replyAgendaCreated(display as Service.WorkspaceAppointment,locale);
 else if(intent.operation==="update_appointment")text=replyAgendaUpdated(display as Service.WorkspaceAppointment,locale);
 else text=localized(locale,`Pedido salvo na Agenda.\n\n📅 *${result.title}*\n🕒 ${formatDateTimeBR(result.startAt)}${link?`\n🔗 ${link}`:""}`,`Pedido guardado en Agenda.\n\n📅 *${result.title}*\n🕒 ${formatDateTimeBR(result.startAt)}${link?`\n🔗 ${link}`:""}`);
 if(result.googleSyncState==="failed")return text+localized(locale,"\n\nNão foi possível concluir a ação no Google. Abra a Agenda para conferir e tentar novamente.","\n\nNo se pudo completar la acción en Google. Abre Agenda para consultar e intentarlo de nuevo.");
 if(result.googleMeetPending&&!link)return text+localized(locale,"\n\n⏳ Preparando link do Google Meet. A reunião já está salva na Agenda.","\n\n⏳ Preparando el enlace de Google Meet. La reunión ya está guardada en Agenda.","\n\n⏳ A preparar a ligação do Google Meet. A reunião já está guardada na Agenda.");
 if(["queued","running","waiting"].includes(result.googleSyncState))return text+localized(locale,"\n\n⏳ A atualização no Google está em andamento. Confira na Agenda.","\n\n⏳ La actualización en Google está en curso. Consulta Agenda.");return text;
}
