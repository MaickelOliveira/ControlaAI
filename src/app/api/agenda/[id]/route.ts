import {googleEventsBody,googleEventsHttp,googleEventsQuery} from "@/lib/google-events-http";
import {cancelWorkspaceAppointment,getWorkspaceAppointment,updateWorkspaceAppointment,type GoogleEventExpectation,type WorkspaceAppointmentPatch} from "@/lib/google-event-service";
type Context=Readonly<{params:Promise<{id:string}>}>;
const EXPECTED=["clientMutationId","expectedGoogleSyncVersion"];
const PATCH_KEYS=[...EXPECTED,"title","description","location","startAt","endAt","allDay","repeat","attendees","status","ataGenerated","ataContent","ataNotifiedAt","reminderSentAt","reminder15MinSentAt"];
export async function GET(request:Request,context:Context){return await googleEventsHttp(request,async scope=>{
 googleEventsQuery(request);const {id}=await context.params,result=await getWorkspaceAppointment(scope,id);if(!result)throw Error("GOOGLE_EVENT_NOT_FOUND");return result;
});}
export async function PATCH(request:Request,context:Context){return await googleEventsHttp(request,async scope=>{
 googleEventsQuery(request);const {id}=await context.params,{clientMutationId,expectedGoogleSyncVersion,...patch}=await googleEventsBody(request,PATCH_KEYS,EXPECTED);
 return await updateWorkspaceAppointment(scope,id,patch as WorkspaceAppointmentPatch,{clientMutationId,expectedGoogleSyncVersion} as GoogleEventExpectation);
},true);}
export async function DELETE(request:Request,context:Context){return await googleEventsHttp(request,async scope=>{
 googleEventsQuery(request);const {id}=await context.params,expectation=await googleEventsBody(request,EXPECTED);
 return await cancelWorkspaceAppointment(scope,id,expectation as GoogleEventExpectation);
},true);}
