import {googleEventsBody,googleEventsHttp,googleEventsQuery} from "@/lib/google-events-http";
import {createWorkspaceAppointment,listWorkspaceAppointments,type WorkspaceEventInput} from "@/lib/google-event-service";
const KEYS=["clientMutationId","title","description","location","startAt","endAt","allDay","repeat","withMeet","attendees"];
export async function GET(request:Request){return await googleEventsHttp(request,async scope=>{googleEventsQuery(request);return await listWorkspaceAppointments(scope);});}
export async function POST(request:Request){return await googleEventsHttp(request,async scope=>{
 googleEventsQuery(request);const {clientMutationId,...input}=await googleEventsBody(request,KEYS,["clientMutationId","title","startAt"]);
 if(typeof clientMutationId!=="string")throw Error("GOOGLE_EVENT_INPUT_INVALID");
 return await createWorkspaceAppointment(scope,clientMutationId,input as WorkspaceEventInput,"web");
},true,201);}
