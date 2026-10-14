import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),binding:vi.fn(),creation:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("./supabase",()=>({getSupabase:()=>({rpc:deps.rpc})}));vi.mock("./google-oauth",()=>({getAuthClient:deps.auth}));
vi.mock("./google-binding-store",async original=>({...await original<typeof import("./google-binding-store")>(),loadGoogleBinding:deps.binding}));
vi.mock("./google-event-creation-store",()=>({loadGoogleEventCreation:deps.creation}));
import {googleEventRetryIdentity} from "./google-event-policy";
import {googleEventCommandIdentity,googleEventChangePayload} from "./google-event-command-policy";
import {loadGoogleEventCommandHead,loadGoogleEventCommand,prepareGoogleEventCommand,claimGoogleEventCommand,assertGoogleEventCommandActive,assertGoogleEventCommandLease,finishGoogleEventCommand,retryGoogleEventCommand} from "./google-event-command-store";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",operationId="ffffffff-ffff-4fff-8fff-fffffffffff1",clientId="fixture.apps.googleusercontent.com";
const binding={id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc1",workspace:scope,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd1",calendarId:"new-selection",calendarName:null,version:"7",unlinkedAt:null};
const intent={workspace:scope,eventId,bindingId:binding.id,grantId:binding.grantId,calendarId:"original-calendar",bindingVersion:"5",...googleEventRetryIdentity(scope,eventId)};
const payload=googleEventChangePayload({summary:"Fixture",description:"",location:"",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"none",attendees:[]});
const base={operation_id:operationId,event_id:eventId,head_version:"1",kind:"update",payload,local_attendees:[],payload_fingerprint:"b".repeat(64),expected_etag:'"old"',conference_request_id:null,authorized_binding_version:"7",state:"queued",attempt_version:"0",round_attempts:0,lease_id:null,lease_until:null,lease_binding_version:null,mutation_allowed:null,was_attempted:false,etag:null,meet_link:null,failure_code:null};
const running={...base,state:"running",attempt_version:"1",round_attempts:1,was_attempted:true,lease_id:"12345678-aaaa-4aaa-8aaa-aaaaaaaaaaa1",lease_until:"2070-01-01T12:00:00Z",lease_binding_version:"7",mutation_allowed:true};
beforeEach(()=>{
 vi.resetAllMocks();deps.auth.mockResolvedValue({_clientId:clientId});deps.binding.mockResolvedValue(binding);
 deps.creation.mockResolvedValue({intent,payloadFingerprint:"a".repeat(64),payload:{...payload,withMeet:false}});
 deps.rpc.mockImplementation(async(name:string)=>({data:name.endsWith("head")?{event_id:eventId,head_version:"0",operation_id:null,etag:'"old"',deleted:false}:name.endsWith("active")||name.endsWith("preflight")?true:name.endsWith("claim")?running:name.endsWith("prepare")?base:name.endsWith("retry")?{...base,attempt_version:"2",was_attempted:true}:base,error:null}));
});
it("reads private head/history without configuration or credential lookup",async()=>{
 const head=await loadGoogleEventCommandHead(scope,eventId);expect(head).toEqual({eventId,version:"0",operationId:null,etag:'"old"',deleted:false});expect(Object.isFrozen(head)).toBe(true);
 const command=await loadGoogleEventCommand(scope,eventId,operationId);expect(command?.intent.calendarId).toBe("original-calendar");expect(command?.creationFingerprint).toBe("a".repeat(64));expect(command?.creationWithMeet).toBe(false);
 expect(deps.auth).not.toHaveBeenCalled();expect(deps.binding).not.toHaveBeenCalled();expect(Object.isFrozen(command?.payload)).toBe(true);
});
it("prepares full validated edit with captured head and exact account while retaining original calendar",async()=>{
 const saved=await prepareGoogleEventCommand(scope,eventId,operationId,"0",{kind:"update",payload,attendees:[]});
 expect(saved.operationId).toBe(operationId);expect(saved.intent.calendarId).toBe("original-calendar");
 expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_event_command_prepare",expect.objectContaining({p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId,p_event_id:eventId,p_operation_id:operationId,p_head_version:"0",p_binding_version:"7",p_kind:"update",p_payload:payload,p_local_attendees:[]}));
});
it.each(["delete","conference"] as const)("prepares explicit %s with no ordinary payload or provider controls",async kind=>{
 deps.rpc.mockResolvedValue({data:{...base,kind,payload:null,local_attendees:null,conference_request_id:kind==="conference"?googleEventCommandIdentity(scope,eventId,operationId):null},error:null});
 expect((await prepareGoogleEventCommand(scope,eventId,operationId,"0",{kind})).kind).toBe(kind);
 expect(deps.rpc).toHaveBeenCalledWith("zelo_google_event_command_prepare",expect.objectContaining({p_payload:null,p_local_attendees:null}));
});
it.each([{kind:"update",payload:{...payload,withMeet:true},attendees:[]},{kind:"update",payload,attendees:[{name:"X",secret:"bad"}]},{kind:"conference",payload},{kind:"delete",ownerId:scope.userId}])("rejects unauthorized/extra command controls before storage",async input=>{
 await expect(prepareGoogleEventCommand(scope,eventId,operationId,"0",input)).rejects.toThrow("GOOGLE_EVENT_COMMAND_INVALID");expect(deps.rpc).not.toHaveBeenCalled();expect(deps.auth).not.toHaveBeenCalled();
});
it("only strict true authorizes active/preflight and local rejection precedes credentials",async()=>{
 await assertGoogleEventCommandActive(scope,eventId,operationId);expect(deps.auth).not.toHaveBeenCalled();
 deps.rpc.mockResolvedValue({data:1,error:null});await expect(assertGoogleEventCommandActive(scope,eventId,operationId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
 deps.rpc.mockResolvedValue({data:running,error:null});const command=(await loadGoogleEventCommand(scope,eventId,operationId))!;
 deps.rpc.mockResolvedValue({data:true,error:null});await assertGoogleEventCommandLease(scope,command,binding,clientId);
 expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_event_command_preflight",expect.objectContaining({p_operation_id:operationId,p_attempt_version:"1",p_lease_id:running.lease_id,p_binding_version:"7"}));
});
it("claims one exact attempt and validates bounded frozen lease metadata",async()=>{
 const command=await claimGoogleEventCommand(scope,eventId,operationId,binding,clientId,"0");expect(command.state).toBe("running");expect(command.lease?.mutationAllowed).toBe(true);expect(Object.isFrozen(command.lease)).toBe(true);
 deps.rpc.mockResolvedValue({data:{...running,attempt_version:"2"},error:null});await expect(claimGoogleEventCommand(scope,eventId,operationId,binding,clientId,"0")).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it.each([{head_version:"0"},{operation_id:"bad"},{expected_etag:"bad\n"},{state:"forever"},{payload_fingerprint:"nothex"},{round_attempts:11},{conference_request_id:"0".repeat(64)},
 {state:"waiting"},{state:"succeeded"},{state:"failed",failure_code:"raw diagnostic"},{...running,mutation_allowed:"true"},{...running,lease_binding_version:"0"}])("fails closed on malformed command storage",async patch=>{
 deps.rpc.mockResolvedValue({data:{...base,...patch},error:null});await expect(loadGoogleEventCommand(scope,eventId,operationId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it("publishes only captured allowlisted finish and validates returned state",async()=>{
 deps.rpc.mockResolvedValue({data:running,error:null});const command=(await loadGoogleEventCommand(scope,eventId,operationId))!;
 deps.rpc.mockResolvedValue({data:{...base,state:"succeeded",attempt_version:"1",round_attempts:1,was_attempted:true,etag:'"new"'},error:null});
 const saved=await finishGoogleEventCommand(scope,eventId,operationId,binding,clientId,"1",command.lease!,{result:"succeeded",etag:'"new"',meetLink:null,failureCode:null});expect(saved.state).toBe("succeeded");
 expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_event_command_finish",expect.objectContaining({p_result:"succeeded",p_etag:'"new"',p_lease_id:running.lease_id,p_failure_code:null}));
 await expect(finishGoogleEventCommand(scope,eventId,operationId,binding,clientId,"1",command.lease!,{result:"failed",etag:null,meetLink:null,failureCode:"provider raw" as never})).rejects.toThrow("GOOGLE_EVENT_COMMAND_INVALID");
});
it("explicit retry retains operation/target and compares the original revision",async()=>{
 expect((await retryGoogleEventCommand(scope,eventId,operationId,binding,clientId,"1")).attemptVersion).toBe("2");
 expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_event_command_retry",expect.objectContaining({p_operation_id:operationId,p_attempt_version:"1"}));
});
it("captures scope/input before awaits and hides unexpected storage diagnostics",async()=>{
 let unblock!:()=>void;const waiting=new Promise<void>(resolve=>{unblock=resolve;});deps.creation.mockImplementation(async()=>{await waiting;return {intent,payloadFingerprint:"a".repeat(64),payload:{...payload,withMeet:false}};});
 const mutable={...scope},request={kind:"update",payload:{...payload},attendees:[]};const result=prepareGoogleEventCommand(mutable,eventId,operationId,"0",request);
 mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";request.payload.summary="Changed after await";unblock();expect((await result).payload?.summary).toBe("Fixture");
 deps.rpc.mockResolvedValue({data:null,error:{message:"fictitious provider/access token diagnostic"}});await expect(loadGoogleEventCommandHead(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_UNAVAILABLE");
});
it("captures finish outcome and lease before an awaited storage read",async()=>{
 deps.rpc.mockResolvedValue({data:running,error:null});const command=(await loadGoogleEventCommand(scope,eventId,operationId))!;
 let unblock!:()=>void;const waiting=new Promise<void>(resolve=>{unblock=resolve;});deps.creation.mockImplementation(async()=>{await waiting;return {intent,payloadFingerprint:"a".repeat(64),payload:{...payload,withMeet:false}};});
 deps.rpc.mockResolvedValue({data:{...base,state:"succeeded",attempt_version:"1",round_attempts:1,was_attempted:true,etag:'"new"'},error:null});
 const outcome={result:"succeeded" as "succeeded"|"failed",etag:'"new"',meetLink:null,failureCode:null},lease={...command.lease!};
 const result=finishGoogleEventCommand(scope,eventId,operationId,binding,clientId,"1",lease,outcome);outcome.result="failed";outcome.etag='"mutated"';lease.id=operationId;unblock();
 expect((await result).state).toBe("succeeded");expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_event_command_finish",expect.objectContaining({p_result:"succeeded",p_etag:'"new"',p_lease_id:running.lease_id}));
});
it("prepares confirmed consumer edit with full captured version in atomic wrapper",async()=>{
 await prepareGoogleEventCommand(scope,eventId,operationId,"0",{kind:"update",payload,attendees:[]},"v1:1:0:0");
 expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_event_command_prepare_expected",expect.objectContaining({p_expected_sync_version:"v1:1:0:0",p_operation_id:operationId}));
 expect(deps.rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty("p_head_version");
});
it.each(["v1:1:1:0","v1:01:0:0","v1:9223372036854775808:0:0"])("rejects inconsistent full confirmed token before configuration: %s",async expected=>{
 await expect(prepareGoogleEventCommand(scope,eventId,operationId,"0",{kind:"update",payload,attendees:[]},expected)).rejects.toThrow("GOOGLE_EVENT_COMMAND_INVALID");expect(deps.auth).not.toHaveBeenCalled();expect(deps.rpc).not.toHaveBeenCalled();
});
it("validates accepted confirmed command replay after unlink without reading configuration",async()=>{
 deps.binding.mockResolvedValue(null);deps.auth.mockRejectedValue(Error("private fixture configuration"));
 const saved=await prepareGoogleEventCommand(scope,eventId,operationId,"0",{kind:"update",payload,attendees:[]},"v1:1:0:0");
 expect(saved.operationId).toBe(operationId);expect(deps.auth).not.toHaveBeenCalled();expect(deps.binding).not.toHaveBeenCalled();
 expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_event_command_prepare_expected",expect.objectContaining({p_expected_sync_version:"v1:1:0:0",p_client_fingerprint:null,p_binding_version:null}));
});
