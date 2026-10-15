import "server-only";
import {createGoogleWhatsAppConsumer} from "./google-whatsapp-consumer";
import {captureGoogleWhatsAppWorkspace} from "./google-whatsapp-intent";
import {currentCompanyContext} from "./company-context";
import {googleWorkspaceFromContext,googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {loadGoogleSettings} from "./google-settings-service";

/** Lazy server-only wiring; the factory's dependencies remain injectable in
 * effect-free handler/slot tests. No shared mutable workspace is cached. */
export async function loadGoogleWhatsAppConsumer(){
 return createGoogleWhatsAppConsumer(await import("./google-event-service"));
}
/** Provider-free scoped status; never probe the user's old global connection. */
export async function loadGoogleWhatsAppConnected(userId:string):Promise<boolean>{
 const scope=captureGoogleWhatsAppWorkspace(userId),settings=await loadGoogleSettings(scope);
 if(googleWorkspaceKey(scope)!==googleWorkspaceKey(captureGoogleWhatsAppWorkspace(userId)))throw Error("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");return settings.connected;
}

/** Read connection status only for the verified WhatsApp participant and mode. */
export async function loadGoogleWhatsAppConnectionStatus(userId:string,requestedMode?:GoogleWorkspace["mode"]):Promise<{mode:GoogleWorkspace["mode"];connected:boolean}>{
 const original=captureGoogleWhatsAppWorkspace(userId);
 const context=currentCompanyContext();
 if(!context)throw Error("GOOGLE_WHATSAPP_SCOPE_DENIED");
 const scope=googleWorkspaceFromContext(userId,{...context,mode:requestedMode??context.mode});
 const settings=await loadGoogleSettings(scope);
 if(googleWorkspaceKey(original)!==googleWorkspaceKey(captureGoogleWhatsAppWorkspace(userId)))throw Error("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");
 const current=currentCompanyContext();
 if(!current||googleWorkspaceKey(scope)!==googleWorkspaceKey(googleWorkspaceFromContext(userId,{...current,mode:requestedMode??current.mode})))throw Error("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");
 return {mode:scope.mode,connected:settings.connected};
}
