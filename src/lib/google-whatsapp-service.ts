import "server-only";
import {createGoogleWhatsAppConsumer} from "./google-whatsapp-consumer";
import {captureGoogleWhatsAppWorkspace} from "./google-whatsapp-intent";
import {googleWorkspaceKey} from "./google-workspace-policy";
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
