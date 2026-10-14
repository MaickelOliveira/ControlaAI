import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {google} from "googleapis";
const deps=vi.hoisted(()=>({load:vi.fn(),head:vi.fn(),claim:vi.fn(),finish:vi.fn(),active:vi.fn(),lease:vi.fn(),binding:vi.fn(),runtime:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("./google-event-command-store",()=>({loadGoogleEventCommand:deps.load,loadGoogleEventCommandHead:deps.head,claimGoogleEventCommand:deps.claim,finishGoogleEventCommand:deps.finish,assertGoogleEventCommandActive:deps.active,assertGoogleEventCommandLease:deps.lease}));
vi.mock("./google-binding-store",()=>({loadGoogleBinding:deps.binding}));vi.mock("./google-workspace-runtime",()=>({withGoogleWorkspaceClient:deps.runtime}));
import {googleEventChangePayload,googleEventChangeBody,googleEventCommandIdentity} from "./google-event-command-policy";
import {googleEventProviderMarkers,googleEventCommandMarker} from "./google-event-marker";
import {googleEventRetryIdentity} from "./google-event-policy";
import type {GoogleEventCommand,GoogleEventCommandOutcome} from "./google-event-command-store";
import {synchronizeGoogleEventCommand} from "./google-event-command-sync";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",operationId="ffffffff-ffff-4fff-8fff-fffffffffff1",clientId="fixture.apps.googleusercontent.com",now=Date.parse("2026-10-13T20:00:00Z");
const binding={id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc1",workspace:scope,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd1",version:"7",calendarId:"new-current-choice",calendarName:null,unlinkedAt:null};
const intent={workspace:scope,eventId,bindingId:binding.id,grantId:binding.grantId,bindingVersion:"5",calendarId:"original-fixture-calendar",...googleEventRetryIdentity(scope,eventId)};
const payload=googleEventChangePayload({summary:"Desired edit",description:"",location:"",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"weekly",attendees:[{email:"guest@example.test",displayName:"Fixture guest"}]});
type TransportOptions=NonNullable<Parameters<InstanceType<typeof google.auth.OAuth2>["transporter"]["request"]>[0]>;
const transport=vi.fn<(options:TransportOptions)=>Promise<unknown>>();let current:GoogleEventCommand,auth:InstanceType<typeof google.auth.OAuth2>;
function owned(applied=false,conferenceStatus="success"){
 const event={id:intent.remoteEventId,status:"confirmed",etag:applied?'"after"':'"before"',...googleEventChangeBody(payload),
  extendedProperties:{private:{...googleEventProviderMarkers(intent,current.creationFingerprint,current.creationWithMeet),...(applied?{zeloCommand:googleEventCommandMarker(intent,current)}:{})}}};
 return current.kind==="conference"?{...event,conferenceData:{createRequest:{requestId:current.conferenceRequestId,status:{statusCode:conferenceStatus}},conferenceSolution:{key:{type:"hangoutsMeet"}},entryPoints:conferenceStatus==="success"?[{entryPointType:"video",uri:"https://meet.google.com/abc-defg-hij"}]:[]}}:event;
}
function failure(status:number){return Object.assign(Error("hidden fictitious provider diagnostic"),{response:{status,config:{data:null}}});}
function response(data:unknown,options:unknown){return {data,status:200,statusText:"OK",headers:new Headers(),config:options};}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-command-sync-marker-key-only");
 current={intent,creationFingerprint:"a".repeat(64),creationWithMeet:false,operationId,headVersion:"1",kind:"update",payload,localAttendees:[],payloadFingerprint:"b".repeat(64),expectedEtag:'"before"',conferenceRequestId:null,authorizedBindingVersion:"7",state:"queued",attemptVersion:"0",roundAttempts:0,lease:null,wasAttempted:false,etag:null,meetLink:null,failureCode:null};
 auth=new google.auth.OAuth2(clientId);auth.setCredentials({access_token:"fictitious-command-access",expiry_date:now+3600_000});auth.eagerRefreshThresholdMillis=0;auth.forceRefreshOnFailure=false;
 transport.mockReset().mockImplementation(async options=>response(options.method==="GET"?owned():owned(true),options));vi.spyOn(auth.transporter,"request").mockImplementation(transport as never);
 deps.load.mockReset().mockImplementation(async()=>current);deps.head.mockReset().mockImplementation(async()=>({eventId,version:current.headVersion,operationId,etag:'"before"',deleted:false}));deps.binding.mockReset().mockResolvedValue(binding);
 deps.active.mockReset().mockResolvedValue(undefined);deps.lease.mockReset().mockResolvedValue(undefined);deps.runtime.mockReset().mockImplementation(async(_scope,_reference,callback)=>callback(auth,binding));
 deps.claim.mockReset().mockImplementation(async()=>{current={...current,state:"running",attemptVersion:String(BigInt(current.attemptVersion)+BigInt(1)),roundAttempts:current.roundAttempts+1,wasAttempted:true,lease:{id:"12345678-aaaa-4aaa-8aaa-aaaaaaaaaaa1",expiresAt:new Date(now+60_000).toISOString(),bindingVersion:"7",mutationAllowed:true}};return current;});
 deps.finish.mockReset().mockImplementation(async(_scope,_event,_operation,_binding,_client,_version,_lease,outcome:GoogleEventCommandOutcome)=>{current={...current,state:outcome.result==="retry"?"queued":outcome.result,lease:null,etag:outcome.etag??current.etag,meetLink:outcome.meetLink,failureCode:outcome.failureCode};return current;});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
it("uses actual SDK GET then conditional PATCH on original calendar, retaining creation markers",async()=>{
 const result=await synchronizeGoogleEventCommand(scope,eventId,operationId);expect(result).toEqual({eventId,operationId,state:"succeeded",meetLink:null,failureCode:null});expect(Object.isFrozen(result)).toBe(true);
 expect(transport.mock.calls.map(([v])=>v.method)).toEqual(["GET","PATCH"]);const options=transport.mock.calls[1][0],body=options.data as Record<string,unknown>;
 expect(new URL(String(options.url)).pathname).toContain("original-fixture-calendar/events/");expect(new Headers(options.headers).get("If-Match")).toBe('"before"');expect(options.params).toMatchObject({sendUpdates:"all",conferenceDataVersion:1});
 expect(body).toMatchObject(googleEventChangeBody(payload));expect(body).not.toHaveProperty("id");expect(body).not.toHaveProperty("conferenceData");expect(body.extendedProperties).toEqual({private:{...googleEventProviderMarkers(intent,current.creationFingerprint,false),zeloCommand:googleEventCommandMarker(intent,current)}});
 for(const [request] of transport.mock.calls){expect(request.retry).toBe(false);expect(request.timeout).toBe(15000);expect(String(request.url)).not.toContain(binding.calendarId);}
 expect(deps.lease).toHaveBeenCalledTimes(2);expect(JSON.stringify(result)).not.toContain("fictitious");
});
it("reconciles applied edit via its marker plus normalized controlled payload without another invitation",async()=>{
 transport.mockImplementation(async options=>response({...owned(true),attendees:[{email:"GUEST@example.test",displayName:"Google enrichment",responseStatus:"accepted"}]},options));
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("succeeded");expect(transport).toHaveBeenCalledTimes(1);
});
it.each([false,true])("blocks changed ETag or412 without adopting a fresh snapshot (%s)",async precondition=>{
 transport.mockImplementation(async options=>{if(options.method==="PATCH")throw failure(412);return response({...owned(),etag:precondition?'"before"':'"external-change"'},options);});
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("ETAG_CONFLICT");expect(transport).toHaveBeenCalledTimes(precondition?2:1);expect(deps.finish.mock.calls[0][7]).toMatchObject({etag:null});
});
it("rejects copied command marker whose controlled payload was edited afterward",async()=>{
 transport.mockImplementation(async options=>response({...owned(true),summary:"Changed externally"},options));expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("ETAG_CONFLICT");expect(transport).toHaveBeenCalledTimes(1);
});
it("recovers ambiguous PATCH with GET only and one operation/invitation",async()=>{
 let applied=false;transport.mockImplementation(async options=>{if(options.method==="GET")return response(owned(applied),options);applied=true;throw Error("fictitious lost response");});
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("queued");expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("succeeded");expect(transport.mock.calls.filter(([v])=>v.method==="PATCH")).toHaveLength(1);
});
it("performs conditional DELETE and reconciles ambiguous404 without another delete",async()=>{
 current={...current,kind:"delete",payload:null,localAttendees:null};let removed=false;
 transport.mockImplementation(async options=>{if(options.method==="GET"){if(removed)throw failure(404);return response(owned(),options);}removed=true;throw Error("fictitious lost delete response");});
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("queued");expect(new Headers(transport.mock.calls.find(([v])=>v.method==="DELETE")![0].headers).get("If-Match")).toBe('"before"');
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("succeeded");expect(transport.mock.calls.filter(([v])=>v.method==="DELETE")).toHaveLength(1);
});
it.each([404,410])("treats delete missing%d as idempotent but never recreates an update",async code=>{
 transport.mockRejectedValue(failure(code));expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("REMOTE_MISSING");current={...current,kind:"delete",payload:null,localAttendees:null,state:"queued",failureCode:null};expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("succeeded");expect(transport.mock.calls.every(([v])=>v.method==="GET")).toBe(true);
});
it("creates only the persisted explicit conference ID and polls pending without another PATCH",async()=>{
 current={...current,kind:"conference",payload:null,localAttendees:null,conferenceRequestId:googleEventCommandIdentity(scope,eventId,operationId)};let applied=false,pending=true;
 transport.mockImplementation(async options=>{if(options.method==="PATCH"){const body=options.data as {conferenceData:{createRequest:{requestId:string}}};expect(body.conferenceData.createRequest.requestId).toBe(current.conferenceRequestId);applied=true;}return response(owned(applied,pending?"pending":"success"),options);});
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("waiting");expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("waiting");pending=false;expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).meetLink).toBe("https://meet.google.com/abc-defg-hij");expect(transport.mock.calls.filter(([v])=>v.method==="PATCH")).toHaveLength(1);
});
it("retains observed pending evidence through a stale GET without another conference PATCH",async()=>{
 current={...current,kind:"conference",payload:null,localAttendees:null,conferenceRequestId:googleEventCommandIdentity(scope,eventId,operationId)};
 transport.mockImplementation(async options=>response(owned(options.method==="PATCH","pending"),options));
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("waiting");expect(current.etag).toBe('"after"');
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("queued");expect(current.etag).toBe('"after"');
 expect(transport.mock.calls.map(([v])=>v.method)).toEqual(["GET","PATCH","GET"]);
});
it("retains an ambiguous conference request ID and terminal definitive failure",async()=>{
 current={...current,kind:"conference",payload:null,localAttendees:null,conferenceRequestId:googleEventCommandIdentity(scope,eventId,operationId)};let applied=false;
 transport.mockImplementation(async options=>{if(options.method==="GET")return response(owned(applied,"failure"),options);applied=true;throw Error("fictitious lost conference response");});
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).state).toBe("queued");expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("CONFERENCE_FAILED");const count=transport.mock.calls.length;await synchronizeGoogleEventCommand(scope,eventId,operationId);expect(transport).toHaveBeenCalledTimes(count);
});
it.each([null,{},[]])("never treats malformed successful response as missing or effect authority",async value=>{
 transport.mockImplementation(async options=>response(value,options));expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("FOREIGN_EVENT");expect(transport).toHaveBeenCalledTimes(1);
});
it("denies unowned original markers before all writes even with a matching command property",async()=>{
 transport.mockImplementation(async options=>response({...owned(true),extendedProperties:{private:{zeloOrigin:"0".repeat(64),zeloCreation:"0".repeat(64),zeloCommand:googleEventCommandMarker(intent,current)}}},options));expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("FOREIGN_EVENT");expect(transport).toHaveBeenCalledTimes(1);
});
it("checks local current-head activity before credentials and rechecks before every HTTP effect",async()=>{
 deps.active.mockRejectedValue(Error("GOOGLE_EVENT_LOCAL_INACTIVE"));await expect(synchronizeGoogleEventCommand(scope,eventId,operationId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(deps.runtime).not.toHaveBeenCalled();expect(deps.claim).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
});
it("supersession/cancellation between GET and PATCH causes zero write or failure publication",async()=>{
 deps.lease.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("GOOGLE_EVENT_COMMAND_CONFLICT"));await expect(synchronizeGoogleEventCommand(scope,eventId,operationId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport.mock.calls.map(([v])=>v.method)).toEqual(["GET"]);expect(deps.finish).not.toHaveBeenCalled();
});
it("rejects stale head before HTTP without publishing a failure",async()=>{
 deps.head.mockResolvedValue({eventId,version:"2",operationId:"ffffffff-ffff-4fff-8fff-fffffffffff2",etag:'"other"',deleted:false});await expect(synchronizeGoogleEventCommand(scope,eventId,operationId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).not.toHaveBeenCalled();expect(deps.finish).not.toHaveBeenCalled();
});
it("never reports success when a post-provider completion loses its local/head CAS",async()=>{
 deps.finish.mockRejectedValue(Error("GOOGLE_EVENT_COMMAND_CONFLICT"));await expect(synchronizeGoogleEventCommand(scope,eventId,operationId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport.mock.calls.map(([v])=>v.method)).toEqual(["GET","PATCH"]);
});
it("reconciles a changed binding revision but refuses any new mutation",async()=>{
 deps.claim.mockImplementation(async()=>{current={...current,state:"running",attemptVersion:"1",roundAttempts:1,wasAttempted:true,lease:{id:"12345678-aaaa-4aaa-8aaa-aaaaaaaaaaa1",expiresAt:new Date(now+60_000).toISOString(),bindingVersion:"7",mutationAllowed:false}};return current;});
 expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("CONNECTION_CHANGED");expect(transport).toHaveBeenCalledTimes(1);
});
it.each([401,403])("keeps provider authorization%d fixed and terminal without retrying a write",async code=>{
 transport.mockImplementation(async options=>{if(options.method==="PATCH")throw failure(code);return response(owned(),options);});expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("CONNECTION_CHANGED");expect(transport).toHaveBeenCalledTimes(2);
});
it("fails without a configured marker key before runtime/claim and returns only fixed errors",async()=>{
 vi.stubEnv("DATA_ENCRYPTION_KEY","");await expect(synchronizeGoogleEventCommand(scope,eventId,operationId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(deps.runtime).not.toHaveBeenCalled();expect(deps.claim).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
});
it("stops automatic recovery at the bounded attempt limit",async()=>{
 current={...current,roundAttempts:10,attemptVersion:"10",wasAttempted:true};expect((await synchronizeGoogleEventCommand(scope,eventId,operationId)).failureCode).toBe("ATTEMPTS_EXHAUSTED");expect(deps.runtime).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
});
