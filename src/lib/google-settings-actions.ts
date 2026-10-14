import "server-only";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleOAuthBindingVersion} from "./google-oauth-state";
import {assertGoogleSettingsExpected,googleSettingsWorkspaceView,loadGoogleSettings,type GoogleSettings} from "./google-settings-service";
import {startGoogleWorkspaceAuthorization} from "./google-workspace-oauth";
import {assignLegacyGoogleConnection} from "./google-legacy-assignment";

const SAFE=["GOOGLE_SETTINGS_INPUT_INVALID","GOOGLE_SETTINGS_WORKSPACE_CHANGED","GOOGLE_SETTINGS_CONFLICT","GOOGLE_SETTINGS_STORAGE_INVALID","GOOGLE_SETTINGS_STORAGE_UNAVAILABLE","GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE","GOOGLE_STATE_CONFLICT","GOOGLE_AUTHORIZATION_INVALID","GOOGLE_LEGACY_ALREADY_ASSIGNED","GOOGLE_LEGACY_TARGET_CONNECTED","GOOGLE_LEGACY_MISSING","GOOGLE_LEGACY_CONFLICT","GOOGLE_LEGACY_STORAGE_UNAVAILABLE","GOOGLE_LEGACY_STORAGE_INVALID","GOOGLE_LEGACY_REAUTHORIZE_REQUIRED"];
function safe(error:unknown):Error{return Error(error instanceof Error&&SAFE.includes(error.message)?error.message:"GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE");}
function capture(scope:GoogleWorkspace):GoogleWorkspace{
 try{googleWorkspaceKey(scope);return Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null});}
 catch{throw Error("GOOGLE_SETTINGS_INPUT_INVALID");}
}
function input(value:unknown,kind:"connect"|"legacy"){
 try{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
  const keys=["workspaceKey","expectedBindingVersion",kind==="connect"?"locale":"confirmTarget"];
  if(Object.keys(row).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(row,key)))throw Error();
  if(typeof row.workspaceKey!=="string"||!/^[a-f0-9]{64}$/.test(row.workspaceKey))throw Error();
  const expectedBindingVersion=googleOAuthBindingVersion(row.expectedBindingVersion);
  if(kind==="connect"?!["pt-BR","pt-PT","es"].includes(row.locale as string):row.confirmTarget!==true)throw Error();
  return Object.freeze({expected:Object.freeze({workspaceKey:row.workspaceKey,expectedBindingVersion}),locale:row.locale as "pt-BR"|"pt-PT"|"es"});
 }catch{throw Error("GOOGLE_SETTINGS_INPUT_INVALID");}
}
/** Only the authenticated HTTP boundary provides scope and the raw session.
 * The submitted key/revision are correlation, never workspace authority. */
export async function connectGoogleSettings(scope:GoogleWorkspace,sessionId:string,value:unknown):Promise<Readonly<{authorizationUrl:string}>>{
 try{
  const selected=capture(scope),parsed=input(value,"connect");
  if(typeof sessionId!=="string"||!sessionId||sessionId.length>16384)throw Error("GOOGLE_SETTINGS_INPUT_INVALID");
  await assertGoogleSettingsExpected(selected,parsed.expected);
  const authorizationUrl=await startGoogleWorkspaceAuthorization(selected,sessionId,parsed.locale,parsed.expected.expectedBindingVersion);
  return Object.freeze({authorizationUrl});
 }catch(error){throw safe(error);}
}
/** Explicitly assigns one old connection. The adapter independently compares
 * the confirmed revision before decrypting or inspecting an old credential. */
export async function assignLegacyGoogleSettings(scope:GoogleWorkspace,value:unknown):Promise<GoogleSettings>{
 try{
  const selected=capture(scope),parsed=input(value,"legacy");await assertGoogleSettingsExpected(selected,parsed.expected);
  const saved=await assignLegacyGoogleConnection(selected,parsed.expected.expectedBindingVersion),status=await loadGoogleSettings(selected);
  if(status.workspace.workspaceKey!==googleSettingsWorkspaceView(selected).workspaceKey||!status.activated||!status.connected||status.bindingVersion!==saved.version
    ||status.selectedCalendar?.id!==saved.calendarId||status.selectedCalendar.name!==saved.calendarName)throw Error("GOOGLE_SETTINGS_CONFLICT");
  return status;
 }catch(error){throw safe(error);}
}
