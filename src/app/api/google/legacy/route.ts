import {googleSettingsHttp,googleSettingsQuery,googleSettingsBody} from "@/lib/google-settings-http";
import {assignLegacyGoogleSettings} from "@/lib/google-settings-actions";

export async function POST(request:Request){
 return googleSettingsHttp(request,async scope=>{
  googleSettingsQuery(request,[]);
  return assignLegacyGoogleSettings(scope,await googleSettingsBody(request,["workspaceKey","expectedBindingVersion","confirmTarget"]));
 },true);
}
