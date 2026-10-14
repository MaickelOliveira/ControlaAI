import {googleEventsBody,googleEventsHttp,googleEventsQuery} from "@/lib/google-events-http";
import {createWorkspaceMeet,listWorkspaceMeets,type WorkspaceMeetInput} from "@/lib/google-event-service";
const KEYS=["clientMutationId","title","description","startAt","endAt","attendees"];
export async function GET(request:Request){return await googleEventsHttp(request,async scope=>{googleEventsQuery(request);return await listWorkspaceMeets(scope);});}
export async function POST(request:Request){return await googleEventsHttp(request,async scope=>{
 googleEventsQuery(request);const {clientMutationId,...input}=await googleEventsBody(request,KEYS,["clientMutationId","title","startAt","endAt"]);
 if(typeof clientMutationId!=="string")throw Error("GOOGLE_EVENT_INPUT_INVALID");
 return await createWorkspaceMeet(scope,clientMutationId,input as WorkspaceMeetInput,"web");
},true,201);}
