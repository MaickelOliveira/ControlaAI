"use client";
import {useEffect,useMemo,useState} from "react";
import Image from "next/image";
import {createGoogleSettingsController,emptyGoogleClientState} from "@/lib/google-settings-client";
import {useGoogleSettingsWorkspace} from "./GoogleSettingsWorkspace";

type Locale="pt-BR"|"pt-PT"|"es";
const COPY={
 "pt-BR":{
  description:"Sincronize compromissos e crie reuniões no Google Meet diretamente pelo Zelo",
  privacy:"Ao conectar, você autoriza o Zelo a criar, editar e excluir eventos conforme seus comandos.",privacyLink:"Política de Privacidade",
  space:"Conexão deste espaço",connected:"Google conectado",choose:"Agenda usada pelo Zelo",loading:"Carregando suas agendas...",saved:"Agenda selecionada com sucesso.",
  connect:"Conectar Google",reconnect:"Reconectar Google",disconnect:"Desconectar deste espaço",unlinked:"Google desconectado deste espaço. O histórico foi preservado.",
  legacy:"Você tem uma conexão antiga que ainda não foi atribuída a um espaço. Escolha onde usá-la; os eventos antigos continuam guardados.",
  legacyButton:"Usar conexão antiga neste espaço",confirm:"Usar a conexão antiga em",confirmDetail:"Ela ficará atribuída somente a este espaço. Outros espaços poderão ter suas próprias conexões.",confirmButton:"Confirmar este espaço",cancel:"Cancelar",legacySaved:"Conexão antiga atribuída a este espaço.",
  unavailable:"Não foi possível carregar a conexão. Atualize a página ou tente novamente.",changed:"A conexão ou o espaço mudou. Confira os dados atualizados antes de tentar novamente.",auth:"Entre novamente na sua conta para continuar.",missing:"Conecte o Google neste espaço para continuar.",reload:"Atualizar página",retry:"Tentar novamente",primary:"principal",empty:"Nenhuma agenda com permissão de edição foi encontrada.",
 },
 "pt-PT":{
  description:"Sincronize compromissos e crie reuniões no Google Meet diretamente pelo Zelo",
  privacy:"Ao ligar, autoriza o Zelo a criar, editar e eliminar eventos conforme os seus comandos.",privacyLink:"Política de Privacidade",
  space:"Ligação deste espaço",connected:"Google ligado",choose:"Agenda utilizada pelo Zelo",loading:"A carregar as suas agendas...",saved:"Agenda selecionada com sucesso.",
  connect:"Ligar Google",reconnect:"Voltar a ligar Google",disconnect:"Desligar deste espaço",unlinked:"Google desligado deste espaço. O histórico foi preservado.",
  legacy:"Tem uma ligação antiga que ainda não foi atribuída a um espaço. Escolha onde utilizá-la; os eventos antigos continuam guardados.",
  legacyButton:"Utilizar ligação antiga neste espaço",confirm:"Utilizar a ligação antiga em",confirmDetail:"Ficará atribuída apenas a este espaço. Outros espaços poderão ter as suas próprias ligações.",confirmButton:"Confirmar este espaço",cancel:"Cancelar",legacySaved:"Ligação antiga atribuída a este espaço.",
  unavailable:"Não foi possível carregar a ligação. Atualize a página ou tente novamente.",changed:"A ligação ou o espaço mudou. Confira os dados atualizados antes de tentar novamente.",auth:"Entre novamente na sua conta para continuar.",missing:"Ligue o Google neste espaço para continuar.",reload:"Atualizar página",retry:"Tentar novamente",primary:"principal",empty:"Não foi encontrada uma agenda com permissão de edição.",
 },
 es:{
  description:"Sincroniza tus citas y crea reuniones de Google Meet directamente desde Zelo",
  privacy:"Al conectar, autorizas a Zelo a crear, editar y eliminar eventos según tus instrucciones.",privacyLink:"Política de Privacidad",
  space:"Conexión de este espacio",connected:"Google conectado",choose:"Calendario que usará Zelo",loading:"Cargando tus calendarios...",saved:"Calendario seleccionado correctamente.",
  connect:"Conectar Google",reconnect:"Volver a conectar Google",disconnect:"Desconectar de este espacio",unlinked:"Google desconectado de este espacio. El historial se conserva.",
  legacy:"Tienes una conexión antigua que todavía no está asignada a un espacio. Elige dónde usarla; los eventos anteriores se conservan.",
  legacyButton:"Usar conexión antigua en este espacio",confirm:"Usar la conexión antigua en",confirmDetail:"Quedará asignada solo a este espacio. Otros espacios podrán tener sus propias conexiones.",confirmButton:"Confirmar este espacio",cancel:"Cancelar",legacySaved:"Conexión antigua asignada a este espacio.",
  unavailable:"No se pudo cargar la conexión. Actualiza la página o vuelve a intentarlo.",changed:"La conexión o el espacio cambió. Revisa los datos actualizados antes de volver a intentarlo.",auth:"Vuelve a entrar en tu cuenta para continuar.",missing:"Conecta Google en este espacio para continuar.",reload:"Actualizar página",retry:"Volver a intentar",primary:"principal",empty:"No se encontró un calendario con permiso de edición.",
 },
} as const;

export default function GoogleCalendarIntegration({locale}:{locale:Locale}){
 const copy=COPY[locale],target=useGoogleSettingsWorkspace(),[state,setState]=useState(emptyGoogleClientState),[confirmation,setConfirmation]=useState<string|null>(null);
 const controller=useMemo(()=>createGoogleSettingsController({fetch:(url,init)=>fetch(url,init),navigate:url=>window.location.assign(url),changed:setState}),[]);
 useEffect(()=>{void controller.setTarget(target);return()=>controller.clear(false);},[controller,target]);
 useEffect(()=>{const clear=()=>controller.clear();window.addEventListener("pagehide",clear);window.addEventListener("beforeunload",clear);return()=>{window.removeEventListener("pagehide",clear);window.removeEventListener("beforeunload",clear);};},[controller]);
 const privacyHref=locale==="es"?"/es/privacidad":locale==="pt-PT"?"/pt/privacidade":"/privacidade";
 const busy=state.busy||state.loading,available=state.target!==null&&state.status!==null;
 const legacy=available&&state.status!.legacy.exists&&!state.status!.legacy.assigned,canAssignLegacy=legacy&&!state.status!.connected;
 const confirming=canAssignLegacy&&confirmation===state.target!.workspaceKey;
 const displayLabel=state.target?.mode==="personal"?(locale==="es"?"Personal":"Pessoal"):state.target?.label;
 const error=state.errorCode==="GOOGLE_SETTINGS_AUTH_REQUIRED"?copy.auth:state.errorCode==="GOOGLE_SETTINGS_NOT_CONNECTED"?copy.missing:["GOOGLE_SETTINGS_CONFLICT","GOOGLE_SETTINGS_WORKSPACE_CHANGED"].includes(state.errorCode??"")?copy.changed:copy.unavailable;
 return <div className="flex flex-col gap-4 p-4 rounded-xl border border-line bg-surface-muted sm:flex-row sm:items-start sm:justify-between">
  <div className="flex min-w-0 items-start gap-3">
   <div className="w-10 h-10 rounded-xl bg-white border border-line flex items-center justify-center shadow-sm shrink-0"><Image src="/brand/google-calendar.png" alt="Google Agenda" width={30} height={30}/></div>
   <div className="min-w-0">
    <p className="text-sm font-semibold text-ink">Google Calendar / Meet</p><p className="text-xs text-subtle mt-0.5">{copy.description}</p>
    <p className="mt-1 max-w-xl text-[11px] leading-4 text-subtle">{copy.privacy} <a href={privacyHref} className="font-semibold text-blue-ink underline">{copy.privacyLink}</a>.</p>
    {displayLabel&&<p className="mt-2 text-xs font-semibold text-ink">{copy.space}: {displayLabel}</p>}
    {state.status?.connected&&<p className="text-xs text-amber-ink mt-1 font-medium">✓ {copy.connected}{state.status.selectedCalendar?.name?` · ${state.status.selectedCalendar.name}`:""}</p>}
    {state.loading&&<p className="mt-3 text-xs text-muted" role="status">{copy.loading}</p>}
    {state.status?.connected&&!state.loading&&<div className="mt-3 max-w-md">
     {state.calendars.length>0?<label className="block text-xs font-semibold text-muted">{copy.choose}<select value={state.status.selectedCalendar?.id??""} onChange={event=>void controller.chooseCalendar(event.target.value)} disabled={busy} className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-blue-400 disabled:opacity-60">
      {!state.calendars.some(item=>item.id===state.status!.selectedCalendar?.id)&&<option value={state.status.selectedCalendar?.id??""}>{state.status.selectedCalendar?.name??state.status.selectedCalendar?.id}</option>}
      {state.calendars.map(calendar=><option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.primary?` (${copy.primary})`:""}</option>)}
     </select></label>:!state.errorCode&&<p className="text-xs text-muted">{copy.empty}</p>}
    </div>}
    {legacy&&<div className="mt-3 max-w-xl rounded-lg border border-line bg-surface p-3 text-xs">
     <p className="text-muted">{copy.legacy}</p>
     {confirming?<div role="group" aria-label={`${copy.confirm} ${displayLabel}`} className="mt-2 space-y-2"><p className="font-semibold text-ink">{copy.confirm} <strong>{displayLabel}</strong>?</p><p className="text-muted">{copy.confirmDetail}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>{const confirmed=confirmation;setConfirmation(null);if(confirmed)void controller.assignLegacy(confirmed);}} className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">{copy.confirmButton}</button><button type="button" disabled={busy} onClick={()=>setConfirmation(null)} className="rounded-lg border border-line px-3 py-1.5">{copy.cancel}</button></div></div>:canAssignLegacy&&<button type="button" disabled={busy} onClick={()=>setConfirmation(state.target!.workspaceKey)} className="mt-2 font-semibold text-blue-ink underline disabled:opacity-50">{copy.legacyButton}</button>}
    </div>}
    {(state.errorCode||!target)&&!state.loading&&<p className="mt-2 max-w-xl text-xs text-red-ink" role="alert">{error}</p>}
    {state.notice&&<p className="mt-2 text-xs text-emerald-ink" role="status">{state.notice==="saved"?copy.saved:state.notice==="legacy"?copy.legacySaved:copy.unlinked}</p>}
    {state.errorCode&&!busy&&<button type="button" onClick={()=>state.status?void controller.reload():window.location.reload()} className="mt-2 text-xs font-semibold text-blue-ink underline">{state.status?copy.retry:copy.reload}</button>}
   </div>
  </div>
  <div className="flex shrink-0 flex-wrap gap-2">
   {available&&<button type="button" disabled={busy} onClick={()=>void controller.connect(locale)} className="text-xs bg-blue-600 text-white font-semibold rounded-lg px-4 py-1.5 disabled:opacity-50">{state.status!.connected?copy.reconnect:copy.connect}</button>}
   {state.status?.connected&&<button type="button" disabled={busy} onClick={()=>void controller.unlink()} className="text-xs border border-line text-red-500 hover:bg-red-soft rounded-lg px-3 py-1.5 transition disabled:opacity-50">{copy.disconnect}</button>}
  </div>
 </div>;
}
