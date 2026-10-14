import {googleEventsBody,googleEventsHttp,googleEventsQuery} from "@/lib/google-events-http";
import {inspectWorkspaceGoogleEventConflict,confirmWorkspaceGoogleEventConflict} from "@/lib/google-event-service";
import type {GoogleEventConflictConfirmation} from "@/lib/google-event-conflict";
type Context=Readonly<{params:Promise<{id:string}>}>;
export async function GET(request:Request,context:Context){return await googleEventsHttp(request,async scope=>{const query=googleEventsQuery(request,["expectedGoogleSyncVersion"]),{id}=await context.params;return await inspectWorkspaceGoogleEventConflict(scope,id,query.expectedGoogleSyncVersion);});}
export async function POST(request:Request,context:Context){return await googleEventsHttp(request,async scope=>{googleEventsQuery(request);const {id}=await context.params,body=await googleEventsBody(request,["clientMutationId","expectedGoogleSyncVersion","confirmOverwrite"]);if(body.confirmOverwrite!==true)throw Error("GOOGLE_EVENT_INPUT_INVALID");return await confirmWorkspaceGoogleEventConflict(scope,id,body as GoogleEventConflictConfirmation);},true);}
