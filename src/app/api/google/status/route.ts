import {googleSettingsHttp,googleSettingsQuery} from "@/lib/google-settings-http";
import {loadGoogleSettings} from "@/lib/google-settings-service";

export async function GET(request:Request){
 return googleSettingsHttp(request,async scope=>{googleSettingsQuery(request,[]);return loadGoogleSettings(scope);});
}
