import {afterEach,beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),load:vi.fn(),reserve:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("./supabase",()=>({getSupabase:()=>deps}));
vi.mock("./google-oauth",()=>({getAuthClient:deps.auth}));
vi.mock("./google-event-origin-store",()=>({loadGoogleEventIntent:deps.load,reserveGoogleEventIntent:deps.reserve}));
import {googleEventRetryIdentity} from "./google-event-policy";
import {googleEventCreationPayload} from "./google-event-payload";
import {claimGoogleEventCreation,finishGoogleEventCreation,loadGoogleEventCreation,prepareGoogleEventCreation,retryGoogleEventCreation} from "./google-event-creation-store";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",clientId="fixture.apps.googleusercontent.com";
const binding={id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc1",workspace:scope,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd1",version:"7",calendarId:"fixture-calendar",calendarName:null,unlinkedAt:null};
const intent={workspace:scope,eventId,bindingId:binding.id,grantId:binding.grantId,bindingVersion:"7",calendarId:binding.calendarId,...googleEventRetryIdentity(scope,eventId)};
const payload=googleEventCreationPayload({summary:"Fixture",description:"",location:"",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"none",attendees:[],withMeet:false});
const lease={id:"ffffffff-ffff-4fff-8fff-fffffffffff1",expiresAt:"2070-01-01T12:00:00Z",bindingVersion:"7",insertAllowed:true};
function row(patch:Record<string,unknown>={}){return {event_id:eventId,payload,payload_fingerprint:"a".repeat(64),with_meet:false,state:"queued",attempt_version:"0",round_attempts:0,authorized_binding_version:"7",lease_id:null,lease_until:null,lease_binding_version:null,insert_allowed:null,was_attempted:false,remote_known:false,etag:null,meet_link:null,failure_code:null,...patch};}
function running(patch:Record<string,unknown>={}){return row({state:"running",attempt_version:"1",round_attempts:1,was_attempted:true,lease_id:lease.id,lease_until:lease.expiresAt,lease_binding_version:lease.bindingVersion,insert_allowed:true,...patch});}
beforeEach(()=>{deps.rpc.mockReset().mockResolvedValue({data:row(),error:null});deps.auth.mockReset().mockResolvedValue({_clientId:clientId});deps.load.mockReset().mockResolvedValue(intent);deps.reserve.mockReset().mockResolvedValue(intent);});
afterEach(()=>vi.restoreAllMocks());
it("loads allowlisted frozen private history without Google configuration/credentials/legacy",async()=>{
 deps.rpc.mockResolvedValue({data:row({raw_diagnostic:"fictitious-hidden",access_ciphertext:"fictitious-hidden"}),error:null});
 const result=await loadGoogleEventCreation(scope,eventId);expect(result?.payload).toEqual(payload);expect(result?.intent).toEqual(intent);
 expect(Object.isFrozen(result)&&Object.isFrozen(result?.payload)&&Object.isFrozen(result?.payload.attendees)).toBe(true);
 expect(JSON.stringify(result)).not.toContain("fictitious-hidden");expect(deps.auth).not.toHaveBeenCalled();expect(deps.reserve).not.toHaveBeenCalled();
});
it("does not assign an origin to missing historical rows",async()=>{deps.load.mockResolvedValue(null);expect(await loadGoogleEventCreation(scope,eventId)).toBeNull();expect(deps.rpc).not.toHaveBeenCalled();expect(deps.reserve).not.toHaveBeenCalled();});
it("prepares copied intent before any provider call and rejects different returned payload",async()=>{
 const result=await prepareGoogleEventCreation(scope,eventId,payload);expect(result.payload).toEqual(payload);expect(deps.reserve).toHaveBeenCalledWith(scope,eventId);
 expect(deps.rpc.mock.calls[0]).toEqual(["zelo_google_event_creation_prepare",expect.objectContaining({p_payload:payload,p_with_meet:false,p_binding_version:"7",p_event_id:eventId})]);
 deps.rpc.mockResolvedValue({data:row({payload:{...payload,summary:"Changed"}}),error:null});await expect(prepareGoogleEventCreation(scope,eventId,payload)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it("captures scope/payload before configuration and ignores later changes",async()=>{
 const selected={...scope},input={...payload};deps.reserve.mockImplementation(async()=>{selected.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";input.summary="Changed";return intent;});
 expect((await prepareGoogleEventCreation(selected,eventId,input)).payload.summary).toBe("Fixture");expect(deps.rpc.mock.calls[0][1].p_company_id).toBe(scope.companyId);
});
it("claims only the exact persisted origin with the runtime's captured account and revision",async()=>{
 deps.rpc.mockResolvedValue({data:running(),error:null});
 const claimed=await claimGoogleEventCreation(scope,eventId,binding,clientId,"0");expect(claimed.lease).toEqual(lease);expect(claimed.attemptVersion).toBe("1");
 for(const changed of [{...binding,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"},{...binding,unlinkedAt:"2070-01-01T00:00:00Z"}]){
  deps.rpc.mockClear();await expect(claimGoogleEventCreation(scope,eventId,changed,clientId,"0")).rejects.toThrow("GOOGLE_EVENT_ACCESS_DENIED");expect(deps.rpc).not.toHaveBeenCalled();
 }
});
it("captures runtime metadata and exact attempt before asynchronous origin retrieval",async()=>{
 const current={...binding};deps.load.mockImplementation(async()=>{current.version="8";return intent;});deps.rpc.mockResolvedValue({data:running(),error:null});
 await claimGoogleEventCreation(scope,eventId,current,clientId,"0");expect(deps.rpc.mock.calls[0][1].p_binding_version).toBe("7");
});
it("keeps the original calendar across a later selection while explicit retry captures current revision",async()=>{
 deps.rpc.mockResolvedValue({data:row({attempt_version:"2",authorized_binding_version:"8",was_attempted:true}),error:null});
 const result=await retryGoogleEventCreation(scope,eventId,{...binding,version:"8",calendarId:"new-choice"},clientId,"1");
 expect(result.intent.calendarId).toBe("fixture-calendar");expect(result.authorizedBindingVersion).toBe("8");expect(result.wasAttempted).toBe(true);
});
it("finishes with only fixed outcome fields and the original lease revision",async()=>{
 deps.rpc.mockResolvedValue({data:row({state:"succeeded",attempt_version:"1",round_attempts:1,was_attempted:true,remote_known:true,etag:'"fixture-etag"'}),error:null});
 const result=await finishGoogleEventCreation(scope,eventId,binding,clientId,"1",lease,{result:"succeeded",remoteKnown:true,etag:'"fixture-etag"',meetLink:null,failureCode:null});
 expect(result.state).toBe("succeeded");expect(deps.rpc.mock.calls[0][1]).toMatchObject({p_lease_id:lease.id,p_attempt_version:"1",p_binding_version:"7",p_result:"succeeded"});
 deps.rpc.mockClear();await expect(finishGoogleEventCreation(scope,eventId,{...binding,version:"8"},clientId,"1",lease,{result:"succeeded",remoteKnown:true,etag:'"fixture-etag"',meetLink:null,failureCode:null})).rejects.toThrow("GOOGLE_EVENT_ATTEMPT_CONFLICT");expect(deps.rpc).not.toHaveBeenCalled();
});
it("publishes completion through the linked atomic finish RPC instead of only private lifecycle state",async()=>{
 deps.rpc.mockResolvedValue({data:row({state:"succeeded",attempt_version:"1",round_attempts:1,was_attempted:true,remote_known:true,etag:'"fixture-etag"'}),error:null});
 await finishGoogleEventCreation(scope,eventId,binding,clientId,"1",lease,{result:"succeeded",remoteKnown:true,etag:'"fixture-etag"',meetLink:null,failureCode:null});
 expect(deps.rpc.mock.calls[0][0]).toBe("zelo_google_event_local_finish");
});
it.each(["GOOGLE_EVENT_LOCAL_INACTIVE","GOOGLE_EVENT_LOCAL_CONFLICT"])("keeps a denied linked completion fixed without retry or fallback: %s",async message=>{
 deps.rpc.mockResolvedValue({data:null,error:{message}});
 await expect(finishGoogleEventCreation(scope,eventId,binding,clientId,"1",lease,{result:"succeeded",remoteKnown:true,etag:'"fixture-etag"',meetLink:null,failureCode:null})).rejects.toThrow(message);
 expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it.each([{event_id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2"},{payload:{...payload,accessToken:"forged"}},{payload_fingerprint:"bad"},{with_meet:true},{state:"unknown"},
 {attempt_version:0},{attempt_version:"00"},{round_attempts:1},{authorized_binding_version:"0"},{lease_id:lease.id},{insert_allowed:true},
 {remote_known:true},{etag:'"fixture-etag"'},{meet_link:"https://evil.example/test"},{failure_code:"RAW_PROVIDER_ERROR"},
 {state:"succeeded"},{state:"waiting"},{state:"failed"},{state:"running"}])("rejects malformed private metadata without raw diagnostics",async patch=>{
 deps.rpc.mockResolvedValue({data:row(patch),error:null});await expect(loadGoogleEventCreation(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it.each(["GOOGLE_EVENT_ATTEMPT_CONFLICT","GOOGLE_EVENT_PAYLOAD_CONFLICT","GOOGLE_EVENT_CONNECTION_CHANGED"])('keeps fixed storage conflict %s without retry/adoption',async message=>{
 deps.rpc.mockResolvedValue({data:null,error:{message}});await expect(prepareGoogleEventCreation(scope,eventId,payload)).rejects.toThrow(message);expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it("hides raw storage/configuration errors and does not attach causes",async()=>{
 deps.rpc.mockRejectedValue(Error("fictitious-secret raw diagnostic"));const error=await loadGoogleEventCreation(scope,eventId).catch(e=>e);
 expect(error).toBeInstanceOf(Error);expect(error.message).toBe("GOOGLE_EVENT_STORAGE_UNAVAILABLE");expect(error.cause).toBeUndefined();
 deps.auth.mockRejectedValue(Error("fictitious-config raw diagnostic"));await expect(prepareGoogleEventCreation(scope,eventId,payload)).rejects.toThrow("GOOGLE_EVENT_FAILED");
});
it("rejects a completion that substitutes a retryable code for a definitive failure",async()=>{
 deps.rpc.mockResolvedValue({data:row({state:"failed",attempt_version:"1",round_attempts:1,was_attempted:true,failure_code:"TEMPORARY"}),error:null});
 await expect(finishGoogleEventCreation(scope,eventId,binding,clientId,"1",lease,{result:"failed",remoteKnown:false,etag:null,meetLink:null,failureCode:"FOREIGN_EVENT"})).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it("rejects completion metadata that forgets the attempted work",async()=>{
 deps.rpc.mockResolvedValue({data:row({state:"failed",attempt_version:"1",failure_code:"TEMPORARY"}),error:null});
 await expect(finishGoogleEventCreation(scope,eventId,binding,clientId,"1",lease,{result:"failed",remoteKnown:false,etag:null,meetLink:null,failureCode:"TEMPORARY"})).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it("accepts bounded exhaustion and preserves a known event across a temporary failure",async()=>{
 deps.rpc.mockResolvedValue({data:row({state:"failed",attempt_version:"10",round_attempts:10,was_attempted:true,remote_known:true,etag:'"known-etag"',failure_code:"ATTEMPTS_EXHAUSTED"}),error:null});
 const result=await finishGoogleEventCreation(scope,eventId,binding,clientId,"10",lease,{result:"retry",remoteKnown:false,etag:null,meetLink:null,failureCode:"TEMPORARY"});
 expect(result.failureCode).toBe("ATTEMPTS_EXHAUSTED");expect(result.remoteKnown).toBe(true);
});
it("keeps exact bigint attempts and rejects stale/mismatched claim results",async()=>{
 const huge="9223372036854775790";deps.rpc.mockResolvedValue({data:running({attempt_version:"9223372036854775791"}),error:null});
 expect((await claimGoogleEventCreation(scope,eventId,binding,clientId,huge)).attemptVersion).toBe("9223372036854775791");
 deps.rpc.mockResolvedValue({data:running({attempt_version:"3"}),error:null});await expect(claimGoogleEventCreation(scope,eventId,binding,clientId,"0")).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
