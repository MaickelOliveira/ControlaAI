import {googleSettingsHttp,googleSettingsQuery,googleSettingsBody} from "@/lib/google-settings-http";
import {unlinkGoogleSettings} from "@/lib/google-settings-service";

export async function POST(request:Request){
 return googleSettingsHttp(request,async scope=>{
  googleSettingsQuery(request,[]);
  return unlinkGoogleSettings(scope,await googleSettingsBody(request,["workspaceKey","expectedBindingVersion"]));
 },true);
}
