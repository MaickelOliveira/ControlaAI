import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {google} from "googleapis";
const deps=vi.hoisted(()=>({load:vi.fn(),claim:vi.fn(),finish:vi.fn(),runtime:vi.fn(),binding:vi.fn(),active:vi.fn(),localLease:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("./google-event-creation-store",()=>({loadGoogleEventCreation:deps.load,claimGoogleEventCreation:deps.claim,finishGoogleEventCreation:deps.finish}));
vi.mock("./google-workspace-runtime",()=>({withGoogleWorkspaceClient:deps.runtime}));vi.mock("./google-binding-store",()=>({loadGoogleBinding:deps.binding}));
vi.mock("./google-event-local-store",()=>({assertGoogleLocalEventActive:deps.active,assertGoogleLocalEventLease:deps.localLease}));
import {googleEventCreationPayload} from "./google-event-payload";
import {googleEventRetryIdentity} from "./google-event-policy";
import {googleEventProviderMarkers} from "./google-event-marker";
import type {GoogleEventCreation,GoogleEventCreationOutcome} from "./google-event-creation-store";
import {synchronizeGoogleEventCreation} from "./google-event-creation-sync";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",clientId="fixture.apps.googleusercontent.com",now=Date.parse("2026-10-13T20:00:00Z");
const binding={id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc1",workspace:scope,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd1",version:"7",calendarId:"new-current-choice",calendarName:null,unlinkedAt:null};
const intent={workspace:scope,eventId,bindingId:binding.id,grantId:binding.grantId,bindingVersion:"7",calendarId:"original-fixture-calendar",...googleEventRetryIdentity(scope,eventId)};
const payload=googleEventCreationPayload({summary:"Fixture",description:"",location:"",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"weekly",attendees:[{email:"guest@example.test",displayName:"Fixture guest"}],withMeet:true});
type TransportOptions=NonNullable<Parameters<InstanceType<typeof google.auth.OAuth2>["transporter"]["request"]>[0]>;
const transport=vi.fn<(options:TransportOptions)=>Promise<unknown>>();
let current:GoogleEventCreation,auth:InstanceType<typeof google.auth.OAuth2>;
function owned(status="success"){return {id:intent.remoteEventId,status:"confirmed",etag:'"fixture-etag"',extendedProperties:{private:googleEventProviderMarkers(intent,current.payloadFingerprint,current.payload.withMeet)},conferenceData:{createRequest:{requestId:intent.conferenceRequestId,status:{statusCode:status}},conferenceSolution:{key:{type:"hangoutsMeet"}},entryPoints:status==="success"?[{entryPointType:"video",uri:"https://meet.google.com/abc-defg-hij"}]:[]}};}
function failure(status:number){return Object.assign(Error("fictitious hidden provider diagnostic"),{response:{status,config:{data:null}}});}
function response(data:unknown,options:unknown){return {data,status:200,statusText:"OK",headers:new Headers(),config:options};}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-sync-marker-key-only");
 current={intent,payload,payloadFingerprint:"a".repeat(64),state:"queued",attemptVersion:"0",roundAttempts:0,authorizedBindingVersion:"7",lease:null,wasAttempted:false,remoteKnown:false,etag:null,meetLink:null,failureCode:null};
 auth=new google.auth.OAuth2(clientId);auth.setCredentials({access_token:"fictitious-test-access",expiry_date:now+3600_000});auth.eagerRefreshThresholdMillis=0;auth.forceRefreshOnFailure=false;
 transport.mockReset().mockImplementation(async options=>response(owned(),options));vi.spyOn(auth.transporter,"request").mockImplementation(transport as never);
 deps.load.mockReset().mockImplementation(async()=>current);deps.binding.mockReset().mockResolvedValue(binding);
 deps.active.mockReset().mockResolvedValue(undefined);deps.localLease.mockReset().mockResolvedValue(undefined);
 deps.runtime.mockReset().mockImplementation(async(_scope,_reference,callback)=>callback(auth,binding));
 deps.claim.mockReset().mockImplementation(async()=>{current={...current,state:"running",attemptVersion:String(BigInt(current.attemptVersion)+BigInt(1)),roundAttempts:current.roundAttempts+1,wasAttempted:true,lease:{id:"ffffffff-ffff-4fff-8fff-fffffffffff1",expiresAt:new Date(now+60_000).toISOString(),bindingVersion:"7",insertAllowed:current.authorizedBindingVersion==="7"&&!current.remoteKnown}};return current;});
 deps.finish.mockReset().mockImplementation(async(_scope,_id,_binding,_client,_version,_lease,outcome:GoogleEventCreationOutcome)=>{current={...current,state:outcome.result==="retry"?"queued":outcome.result,lease:null,remoteKnown:current.remoteKnown||outcome.remoteKnown,etag:outcome.etag??current.etag,meetLink:outcome.meetLink,failureCode:outcome.failureCode};return current;});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
it("uses the real SDK to GET then insert stable IDs/original calendar with one authorized invitation",async()=>{
 transport.mockImplementation(async options=>{if(options.method==="GET")throw failure(404);return response(owned(),options) as never;});
 const result=await synchronizeGoogleEventCreation(scope,eventId);
 expect(result).toEqual({eventId,state:"succeeded",meetLink:"https://meet.google.com/abc-defg-hij",failureCode:null});expect(Object.isFrozen(result)).toBe(true);
 expect(transport).toHaveBeenCalledTimes(2);
 const options=transport.mock.calls[1][0],url=new URL(String(options.url)),body=options.data as Record<string,unknown>;
 expect(url.pathname).toContain("original-fixture-calendar/events");expect(options.params).toMatchObject({sendUpdates:"all",conferenceDataVersion:1});
 expect(body).toMatchObject({id:intent.remoteEventId,start:{dateTime:payload.startAt,timeZone:"America/Sao_Paulo"},end:{dateTime:payload.endAt,timeZone:"America/Sao_Paulo"},recurrence:["RRULE:FREQ=WEEKLY"],attendees:payload.attendees,conferenceData:{createRequest:{requestId:intent.conferenceRequestId}}});
 for(const [request] of transport.mock.calls){expect(request.retry).toBe(false);expect(request.timeout).toBe(15000);expect(String(request.url)).not.toContain(binding.calendarId);}
 expect(JSON.stringify(result)).not.toContain("fixture");expect(deps.finish).toHaveBeenCalledTimes(1);
});
it("reconciles an already signed event without another insert/conference/invitation",async()=>{
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("succeeded");expect(transport).toHaveBeenCalledTimes(1);expect(transport.mock.calls[0][0].method).toBe("GET");
});
it("accepts409 only after a new GET verifies the exact signed original event",async()=>{
 let calls=0;transport.mockImplementation(async options=>{calls++;if(calls===1)throw failure(404);if(calls===2)throw failure(409);return response(owned(),options) as never;});
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("succeeded");expect(transport.mock.calls.map(([v])=>v.method)).toEqual(["GET","POST","GET"]);
});
it.each([false,true])("refuses an unsigned/foreign event even when preceded by409 (%s)",async conflict=>{
 let count=0;transport.mockImplementation(async options=>{count++;if(conflict&&count===1)throw failure(404);if(conflict&&count===2)throw failure(409);return response({...owned(),extendedProperties:{private:{zeloOrigin:"0".repeat(64),zeloCreation:"0".repeat(64)}}},options) as never;});
 expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("FOREIGN_EVENT");expect(transport).toHaveBeenCalledTimes(conflict?3:1);
});
it("recovers an ambiguous insert on a later attempt with GET only and the same first conference ID",async()=>{
 let remote:ReturnType<typeof owned>|null=null;
 transport.mockImplementation(async options=>{if(options.method==="GET"){if(!remote)throw failure(404);return response(remote,options) as never;}remote=owned();throw Error("fictitious-network-failure-after-create");});
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("queued");expect(current.wasAttempted).toBe(true);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("succeeded");expect(transport.mock.calls.filter(([v])=>v.method==="POST")).toHaveLength(1);
});
it("polls pending conference through GET alone and keeps known creation until success",async()=>{
 transport.mockImplementation(async options=>response(owned("pending"),options) as never);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("waiting");expect(current.remoteKnown).toBe(true);
 transport.mockImplementation(async options=>response(owned(),options) as never);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("succeeded");expect(transport.mock.calls.every(([v])=>v.method==="GET")).toBe(true);
});
it("keeps definitive conference failure terminal without regenerating or patching it",async()=>{
 transport.mockImplementation(async options=>response(owned("failure"),options) as never);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("CONFERENCE_FAILED");
 await synchronizeGoogleEventCreation(scope,eventId);expect(transport).toHaveBeenCalledTimes(1);expect(deps.runtime).toHaveBeenCalledTimes(1);
});
it.each([404,410])("never recreates a known removed event (%s)",async status=>{
 current={...current,wasAttempted:true,remoteKnown:true,etag:'"previous-etag"'};transport.mockRejectedValue(failure(status));
 expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("REMOTE_MISSING");expect(transport).toHaveBeenCalledTimes(1);
});
it("does only reconciliation when a changed binding has not explicitly authorized another insert",async()=>{
 current={...current,authorizedBindingVersion:"6",wasAttempted:true};transport.mockRejectedValue(failure(404));
 expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("CONNECTION_CHANGED");expect(transport).toHaveBeenCalledTimes(1);
});
it.each([401,403])("fails safely on denied provider access without sending an invitation (%s)",async code=>{
 transport.mockRejectedValue(failure(code));expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("CONNECTION_CHANGED");expect(transport).toHaveBeenCalledTimes(1);
});
it("makes zero provider calls for missing provenance, changed/unlinked binding or missing signing key",async()=>{
 deps.load.mockResolvedValueOnce(null);await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");
 deps.binding.mockResolvedValue(null);await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");
 current={...current,state:"queued",lease:null};
 deps.binding.mockResolvedValue(binding);vi.stubEnv("DATA_ENCRYPTION_KEY","");await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).not.toHaveBeenCalled();
});
it("rechecks unlink/lease expiry after GET and before any insert",async()=>{
 transport.mockImplementation(async()=>{deps.binding.mockResolvedValue(null);throw failure(404);});
 await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).toHaveBeenCalledTimes(1);expect(deps.finish).not.toHaveBeenCalled();
});
it("refuses a superseded lease or insufficient time before provider work",async()=>{
 deps.load.mockImplementation(async()=>current.state==="running"?{...current,lease:{...current.lease!,id:"ffffffff-ffff-4fff-8fff-fffffffffff2"}}:current);
 await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).not.toHaveBeenCalled();
 deps.load.mockImplementation(async()=>{if(current.state==="running")vi.setSystemTime(now+45_000);return current;});
 current={...current,state:"queued",lease:null};await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).not.toHaveBeenCalled();
});
it("preserves all-day exclusive dates and none invitation setting with no guests",async()=>{
 current={...current,payload:googleEventCreationPayload({...payload,allDay:true,startAt:"2070-01-01",endAt:"2070-01-02",attendees:[],withMeet:false})};
 transport.mockImplementation(async options=>{if(options.method==="GET")throw failure(404);return response(owned(),options) as never;});
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("succeeded");
 const options=transport.mock.calls[1][0];expect(options.params).toMatchObject({sendUpdates:"none",conferenceDataVersion:0});expect(options.data).toMatchObject({start:{date:"2070-01-01"},end:{date:"2070-01-02"}});expect(options.data).not.toHaveProperty("conferenceData");
});
it("exposes only a fixed failure for invalid provider Meet URLs, no raw diagnostics",async()=>{
 transport.mockImplementation(async options=>response({...owned(),conferenceData:{...owned().conferenceData,entryPoints:[{entryPointType:"video",uri:"https://evil.example/raw"}]}},options) as never);
 const result=await synchronizeGoogleEventCreation(scope,eventId);expect(result.failureCode).toBe("TEMPORARY");expect(result.state).toBe("queued");expect(JSON.stringify(result)).not.toContain("evil");expect(result.meetLink).toBeNull();
});
it("never inserts after a200 null response, which is not an authorized404",async()=>{
 transport.mockImplementation(async options=>response(options.method==="GET"?null:owned(),options) as never);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("FOREIGN_EVENT");expect(transport.mock.calls.map(([v])=>v.method)).toEqual(["GET"]);
});
it.each(["malformed",[null]])("keeps verified known creation when conference entry points are malformed (%s)",async points=>{
 transport.mockImplementation(async options=>response({...owned(),conferenceData:{...owned().conferenceData,entryPoints:points}},options) as never);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("TEMPORARY");expect(current.remoteKnown).toBe(true);expect(current.etag).toBe('"fixture-etag"');
 transport.mockRejectedValue(failure(404));await synchronizeGoogleEventCreation(scope,eventId);expect(transport.mock.calls.filter(([v])=>v.method==="POST")).toHaveLength(0);
});
it("accepts a completed signed Google Meet when the provider omits optional createRequest",async()=>{
 const complete=owned(),conferenceData={conferenceSolution:complete.conferenceData.conferenceSolution,entryPoints:complete.conferenceData.entryPoints};
 transport.mockImplementation(async options=>response({...complete,conferenceData},options) as never);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("succeeded");expect(transport).toHaveBeenCalledTimes(1);
});
it.each(["missing","mismatched_failure","unknown_status"])("keeps ambiguous creation conference %s recoverable with original IDs and no new invitation",async variant=>{
 const event=owned(),conferenceData=variant==="missing"?null:{...event.conferenceData,createRequest:{requestId:variant==="mismatched_failure"?"other-fictitious-request":intent.conferenceRequestId,status:{statusCode:variant==="mismatched_failure"?"failure":"unrecognized"}}};
 transport.mockImplementation(async options=>response({...event,conferenceData},options) as never);
 expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("TEMPORARY");expect(current.state).toBe("queued");expect(current.remoteKnown).toBe(true);expect(current.etag).toBe('"fixture-etag"');
 transport.mockRejectedValue(failure(404));expect((await synchronizeGoogleEventCreation(scope,eventId)).failureCode).toBe("REMOTE_MISSING");expect(transport.mock.calls.every(([v])=>v.method==="GET")).toBe(true);
});
it("denies a known cancelled/missing local record before credential runtime, claiming or provider work",async()=>{
 deps.active.mockRejectedValue(Error("GOOGLE_EVENT_LOCAL_INACTIVE"));
 await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");
 expect(deps.runtime).not.toHaveBeenCalled();expect(deps.claim).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();expect(deps.finish).not.toHaveBeenCalled();
});
it("requires private local leased authorization before every Calendar GET/insert/reconciliation",async()=>{
 let calls=0;transport.mockImplementation(async options=>{calls++;expect(deps.localLease).toHaveBeenCalledTimes(calls);if(calls===1)throw failure(404);if(calls===2)throw failure(409);return response(owned(),options) as never;});
 expect((await synchronizeGoogleEventCreation(scope,eventId)).state).toBe("succeeded");expect(deps.active).toHaveBeenCalledWith(scope,eventId);expect(deps.localLease).toHaveBeenCalledTimes(3);
 for(const [selected,claimed,runtime,configured] of deps.localLease.mock.calls){expect(selected).toEqual(scope);expect(claimed.intent.calendarId).toBe(intent.calendarId);expect(runtime).toEqual(binding);expect(configured).toBe(clientId);}
});
it("stops before insert when local cancellation occurs after the first GET",async()=>{
 transport.mockImplementation(async()=>{deps.localLease.mockRejectedValue(Error("GOOGLE_EVENT_LOCAL_INACTIVE"));throw failure(404);});
 await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).toHaveBeenCalledTimes(1);expect(deps.finish).not.toHaveBeenCalled();
});
it("does not turn a refused local preflight into a provider failure or another invitation",async()=>{
 deps.localLease.mockRejectedValue(Error("GOOGLE_EVENT_LOCAL_CONFLICT"));
 await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).not.toHaveBeenCalled();expect(deps.finish).not.toHaveBeenCalled();
});
it("does not report provider success after local cancellation refuses the atomic finish",async()=>{
 deps.finish.mockRejectedValue(Error("GOOGLE_EVENT_LOCAL_INACTIVE"));
 await expect(synchronizeGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_SYNC_UNAVAILABLE");expect(transport).toHaveBeenCalledTimes(1);expect(deps.finish).toHaveBeenCalledTimes(1);
});
