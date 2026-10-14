import {cookies} from "next/headers";
import {googleSettingsHttp,googleSettingsQuery,googleSettingsBody} from "@/lib/google-settings-http";
import {connectGoogleSettings} from "@/lib/google-settings-actions";

export async function POST(request:Request){
 return googleSettingsHttp(request,async scope=>{
  googleSettingsQuery(request,[]);
  const body=await googleSettingsBody(request,["workspaceKey","expectedBindingVersion","locale"]);
  const session=(await cookies()).get("ca_session")?.value;
  if(!session)throw Error("GOOGLE_SETTINGS_AUTH_REQUIRED");
  return connectGoogleSettings(scope,session,body);
 },true);
}
