import {googleSettingsHttp,googleSettingsQuery,googleSettingsBody} from "@/lib/google-settings-http";
import {listGoogleSettingsCalendars,selectGoogleSettingsCalendar} from "@/lib/google-settings-service";

export async function GET(request:Request){
 return googleSettingsHttp(request,scope=>listGoogleSettingsCalendars(scope,googleSettingsQuery(request,["workspaceKey","expectedBindingVersion"])));
}
export async function PUT(request:Request){
 return googleSettingsHttp(request,async scope=>{
  googleSettingsQuery(request,[]);
  return selectGoogleSettingsCalendar(scope,await googleSettingsBody(request,["workspaceKey","expectedBindingVersion","calendarId"]));
 },true);
}
