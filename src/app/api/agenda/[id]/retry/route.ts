import {googleEventsBody,googleEventsHttp,googleEventsQuery} from "@/lib/google-events-http";
import {retryWorkspaceGoogleEvent,type GoogleEventExpectation} from "@/lib/google-event-service";
type Context=Readonly<{params:Promise<{id:string}>}>;
export async function POST(request:Request,context:Context){return await googleEventsHttp(request,async scope=>{
 googleEventsQuery(request);const {id}=await context.params,expectation=await googleEventsBody(request,["clientMutationId","expectedGoogleSyncVersion"]);
 return await retryWorkspaceGoogleEvent(scope,id,expectation as GoogleEventExpectation);
},true);}
