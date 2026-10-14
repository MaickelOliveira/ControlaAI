import {beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),creation:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>deps}));
vi.mock("./google-oauth",()=>({getAuthClient:deps.auth}));
vi.mock("./google-event-creation-store",()=>({loadGoogleEventCreation:deps.creation}));
import {googleEventRetryIdentity} from "./google-event-policy";
import {googleEventCreationPayload} from "./google-event-payload";
import {googleOAuthClientFingerprint} from "./google-oauth-state";
import {assertGoogleLocalEventActive,assertGoogleLocalEventLease,loadGoogleLocalEvent,prepareGoogleLocalEvent} from "./google-event-local-store";
import {googleBindingFromStorage} from "./google-binding-store";
import type {GoogleEventCreation} from "./google-event-creation-store";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1",clientId="fixture.apps.googleusercontent.com";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const payload={summary:"Fictitious event",description:"Private note",location:"Fixture",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"none",attendees:[],withMeet:false};
const input={kind:"appointment",source:"web",payload,attendees:[]};
function row(patch:Record<string,unknown>={}){return {event_id:eventId,appointment_id:eventId,meet_id:null,kind:"appointment",local_metadata:{source:"web",attendees:[]},...patch};}
function binding(patch:Record<string,unknown>={}){return {id:bindingId,user_id:owner,mode:"business",company_id:company,grant_id:grantId,calendar_id:"fixture-calendar",calendar_name:"Fixture",version:"7",unlinked_at:null,...patch};}
function savedCreation(patch:Record<string,unknown>={}){return {payload:googleEventCreationPayload(payload),intent:{workspace:scope,eventId,bindingId,grantId,calendarId:"fixture-calendar",bindingVersion:"7",...googleEventRetryIdentity(scope,eventId)},...patch};}
function leasedCreation():GoogleEventCreation{return {payload:googleEventCreationPayload(payload),intent:savedCreation().intent,payloadFingerprint:"a".repeat(64),state:"running",attemptVersion:"9007199254740993",roundAttempts:1,authorizedBindingVersion:"7",lease:{id:"ffffffff-ffff-4fff-8fff-fffffffffff1",expiresAt:"2070-01-01T12:00:00Z",bindingVersion:"7",insertAllowed:true},wasAttempted:true,remoteKnown:false,etag:null,meetLink:null,failureCode:null};}
beforeEach(()=>{
 deps.auth.mockReset().mockResolvedValue({_clientId:clientId});deps.creation.mockReset().mockResolvedValue(savedCreation());
 let saved=false;deps.rpc.mockReset().mockImplementation(async name=>{
  if(name==="zelo_google_event_local_get")return {data:saved?row():null,error:null};
  if(name==="zelo_google_binding_get")return {data:binding(),error:null};
  if(name==="zelo_google_event_local_create"){saved=true;return {data:row(),error:null};}
  throw Error("Unexpected fictitious RPC");
 });
});
it("prepares local records through one atomic RPC with the captured binding/client and canonical payload",async()=>{
 const result=await prepareGoogleLocalEvent(scope,eventId,input);
 expect(result).toEqual({eventId,appointmentId:eventId,meetId:null,kind:"appointment",source:"web",attendees:[]});
 expect(deps.rpc.mock.calls.at(-1)).toEqual(["zelo_google_event_local_create",{p_user_id:owner,p_mode:"business",p_company_id:company,p_event_id:eventId,p_binding_id:bindingId,p_grant_id:grantId,p_binding_version:"7",p_client_fingerprint:googleOAuthClientFingerprint(clientId),p_payload:googleEventCreationPayload(payload),p_kind:"appointment",p_source:"web",p_attendees:[]}]);
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.attendees)).toBe(true);
});
it("reads private linked history without consulting Google credentials or creation metadata",async()=>{
 deps.rpc.mockResolvedValue({data:row({raw_provider_secret:"fictitious diagnostic"}),error:null});
 expect(await loadGoogleLocalEvent(scope,eventId)).toEqual({eventId,appointmentId:eventId,meetId:null,kind:"appointment",source:"web",attendees:[]});
 expect(deps.auth).not.toHaveBeenCalled();expect(deps.creation).not.toHaveBeenCalled();
});
it("does not infer linkage for an unverified legacy row",async()=>{
 deps.rpc.mockResolvedValue({data:null,error:null});expect(await loadGoogleLocalEvent(scope,eventId)).toBeNull();expect(deps.auth).not.toHaveBeenCalled();
});
it("returns identical linked history after unlink without configuration, another write or metadata overwrite",async()=>{
 deps.rpc.mockResolvedValue({data:row(),error:null});deps.auth.mockRejectedValue(Error("Unavailable fictitious configuration"));
 expect((await prepareGoogleLocalEvent(scope,eventId,input)).eventId).toBe(eventId);
 expect(deps.rpc).toHaveBeenCalledTimes(1);expect(deps.creation).toHaveBeenCalledWith(scope,eventId);expect(deps.auth).not.toHaveBeenCalled();
});
it.each([{...input,source:"whatsapp"},{...input,payload:{...payload,summary:"Changed"}}])("refuses a different immutable input on replay %#",async changed=>{
 deps.rpc.mockResolvedValue({data:row(),error:null});await expect(prepareGoogleLocalEvent(scope,eventId,changed)).rejects.toThrow("GOOGLE_EVENT_LOCAL_CONFLICT");expect(deps.auth).not.toHaveBeenCalled();expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it("rejects a linked record without its original creation rather than preparing it again",async()=>{
 deps.rpc.mockResolvedValue({data:row(),error:null});deps.creation.mockResolvedValue(null);
 await expect(prepareGoogleLocalEvent(scope,eventId,input)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");expect(deps.auth).not.toHaveBeenCalled();
});
it("keeps local name/phone metadata separate from canonical provider guests",async()=>{
 const attendees=[{name:"Fictitious local",phone:"+5511999990000",email:"fixture@example.test"},{name:"Phone only",phone:"+5511999990001"}];
 const meetPayload={...payload,withMeet:true,attendees:[{email:"fixture@example.test",displayName:"Fictitious local"}]};
 const meeting={kind:"meet",source:"whatsapp",payload:meetPayload,attendees};
 deps.creation.mockResolvedValue(savedCreation({payload:googleEventCreationPayload(meetPayload)}));
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_event_local_get"?null:name==="zelo_google_binding_get"?binding():row({kind:"meet",meet_id:eventId,local_metadata:{source:"whatsapp",attendees}}),error:null}));
 const result=await prepareGoogleLocalEvent(scope,eventId,meeting);expect(result.meetId).toBe(eventId);expect(result.attendees).toEqual(attendees);expect(result.attendees.every(Object.isFrozen)).toBe(true);
 const params=deps.rpc.mock.calls.at(-1)?.[1];expect(params.p_attendees).toEqual(attendees);expect(JSON.stringify(params.p_payload)).not.toContain("phone");
});
it.each([
 {...input,userId:owner},{...input,payload:{...payload,ownerId:owner}},{...input,source:"other"},{...input,kind:"other"},
 {...input,attendees:[{name:"Unused"}]},{...input,kind:"meet"},
 {...input,kind:"meet",payload:{...payload,withMeet:true,repeat:"daily"}},
 {...input,kind:"meet",payload:{...payload,withMeet:true},attendees:[{name:"Fictitious",secret:"rejected"}]},
 {...input,kind:"meet",payload:{...payload,withMeet:true},attendees:[{name:"Fictitious",email:"not-an-email"}]},
 {...input,kind:"meet",payload:{...payload,withMeet:true},attendees:[{name:"Fictitious",email:"fixture@example.test"}]},
])("denies malformed/extra input or inconsistent provider guests before any I/O %#",async malformed=>{
 await expect(prepareGoogleLocalEvent(scope,eventId,malformed)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();expect(deps.auth).not.toHaveBeenCalled();
});
it.each([{event_id:"foreign"},{appointment_id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2"},{meet_id:eventId},{kind:"other"},{local_metadata:{source:"other",attendees:[]}},{local_metadata:{source:"web",attendees:[],private_token:"rejected"}}])("denies malformed or substituted local linkage %#",async patch=>{
 deps.rpc.mockResolvedValue({data:row(patch),error:null});await expect(loadGoogleLocalEvent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it.each([null,"bad",""])("rejects an invalid logical UUID before I/O %#",async value=>{
 await expect(prepareGoogleLocalEvent(scope,value as string,input)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it("rejects a personal tuple with a company rather than silently choosing a default",async()=>{
 await expect(loadGoogleLocalEvent({...scope,mode:"personal"},eventId)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it("captures scope, payload and local metadata before asynchronous configuration/lookup",async()=>{
 const mutableScope={...scope},mutableInput={...input,payload:{...payload}};
 deps.rpc.mockImplementation(async name=>{mutableScope.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";mutableInput.payload.summary="Changed after await";return {data:name==="zelo_google_event_local_get"?null:name==="zelo_google_binding_get"?binding():row(),error:null};});
 await prepareGoogleLocalEvent(mutableScope,eventId,mutableInput);
 expect(deps.rpc.mock.calls.every(([,args])=>args.p_company_id===company)).toBe(true);expect(deps.rpc.mock.calls.at(-1)?.[1].p_payload.summary).toBe(payload.summary);
});
it.each([null,"",42])("refuses missing configured client before atomic mutation %#",async client=>{
 deps.auth.mockResolvedValue({_clientId:client});await expect(prepareGoogleLocalEvent(scope,eventId,input)).rejects.toThrow("GOOGLE_EVENT_CONFIGURATION_INVALID");expect(deps.rpc.mock.calls.map(([name])=>name)).toEqual(["zelo_google_event_local_get"]);
});
it.each([null,binding({unlinked_at:"2070-01-01T00:00:00Z"})])("requires an active scoped connection for new records %#",async target=>{
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?target:null,error:null}));
 await expect(prepareGoogleLocalEvent(scope,eventId,input)).rejects.toThrow("GOOGLE_EVENT_NOT_CONNECTED");expect(deps.rpc.mock.calls.every(([name])=>name!=="zelo_google_event_local_create")).toBe(true);
});
it("rejects a foreign binding returned during creation",async()=>{
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding({company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"}):null,error:null}));
 await expect(prepareGoogleLocalEvent(scope,eventId,input)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");expect(deps.rpc).toHaveBeenCalledTimes(2);
});
it("retains exact bigint revisions in the atomic request",async()=>{
 const version="9223372036854775806";deps.creation.mockResolvedValue(savedCreation({intent:{...savedCreation().intent,bindingVersion:version}}));
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding({version}):name==="zelo_google_event_local_get"?null:row(),error:null}));
 await prepareGoogleLocalEvent(scope,eventId,input);expect(deps.rpc.mock.calls.at(-1)?.[1].p_binding_version).toBe(version);
});
it("uses Personal's null company in every lookup and mutation",async()=>{
 const personal:GoogleWorkspace={userId:owner,mode:"personal",companyId:null};deps.creation.mockResolvedValue(savedCreation({intent:{...savedCreation().intent,workspace:personal}}));
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding({mode:"personal",company_id:null}):name==="zelo_google_event_local_get"?null:row(),error:null}));
 await prepareGoogleLocalEvent(personal,eventId,input);expect(deps.rpc.mock.calls.every(([,args])=>args.p_company_id===null&&args.p_mode==="personal")).toBe(true);
});
it.each(["GOOGLE_EVENT_LOCAL_CONFLICT","GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_EVENT_INVALID"])("keeps fixed mutation failures without retrying %s",async message=>{
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding():null,error:name==="zelo_google_event_local_create"?{message}:null}));
 await expect(prepareGoogleLocalEvent(scope,eventId,input)).rejects.toThrow(message);expect(deps.rpc.mock.calls.filter(([name])=>name==="zelo_google_event_local_create")).toHaveLength(1);
});
it("strips storage diagnostics and causes",async()=>{
 deps.rpc.mockRejectedValue(Error("Fictitious private database diagnostic"));const error=await loadGoogleLocalEvent(scope,eventId).catch(e=>e);
 expect(error).toBeInstanceOf(Error);expect(error.message).toBe("GOOGLE_EVENT_STORAGE_UNAVAILABLE");expect(error.stack).not.toContain("database diagnostic");expect(error).not.toHaveProperty("cause");
});
it("strips configuration diagnostics and does not leak the client",async()=>{
 deps.auth.mockRejectedValue(Error("Fictitious private configuration diagnostic"));const error=await prepareGoogleLocalEvent(scope,eventId,input).catch(e=>e);
 expect(error).toBeInstanceOf(Error);expect(error.message).toBe("GOOGLE_EVENT_FAILED");expect(error.stack).not.toContain("configuration diagnostic");expect(error).not.toHaveProperty("cause");
});
it("does not report a substituted creation target as success",async()=>{
 deps.creation.mockResolvedValue(savedCreation({intent:{...savedCreation().intent,calendarId:"different-calendar"}}));
 await expect(prepareGoogleLocalEvent(scope,eventId,input)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it("checks active local rows before configuration or credential runtime",async()=>{
 deps.rpc.mockResolvedValue({data:true,error:null});await assertGoogleLocalEventActive(scope,eventId);
 expect(deps.rpc.mock.calls).toEqual([["zelo_google_event_local_active",{p_user_id:owner,p_mode:"business",p_company_id:company,p_event_id:eventId}]]);
 expect(deps.auth).not.toHaveBeenCalled();expect(deps.creation).not.toHaveBeenCalled();
});
it("checks the captured local lease with exact bigint attempt and runtime revision",async()=>{
 const creation=leasedCreation(),runtime=googleBindingFromStorage(binding(),scope);
 deps.rpc.mockResolvedValue({data:true,error:null});await assertGoogleLocalEventLease(scope,creation,runtime,clientId);
 expect(deps.rpc.mock.calls).toEqual([["zelo_google_event_local_preflight",{p_user_id:owner,p_mode:"business",p_company_id:company,p_event_id:eventId,p_client_fingerprint:googleOAuthClientFingerprint(clientId),p_binding_version:"7",p_attempt_version:"9007199254740993",p_lease_id:creation.lease?.id}]]);
 expect(deps.auth).not.toHaveBeenCalled();
});
it.each([null,false,"true",{},1])("does not interpret an invalid active/lease authorization result as success %#",async data=>{
 deps.rpc.mockResolvedValue({data,error:null});
 await expect(assertGoogleLocalEventActive(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
 await expect(assertGoogleLocalEventLease(scope,leasedCreation(),googleBindingFromStorage(binding(),scope),clientId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
it.each(["GOOGLE_EVENT_LOCAL_INACTIVE","GOOGLE_EVENT_LOCAL_CONFLICT","GOOGLE_EVENT_ATTEMPT_CONFLICT","GOOGLE_EVENT_CONNECTION_CHANGED"])("denies local work with its fixed failure and no credential fallback: %s",async message=>{
 deps.rpc.mockResolvedValue({data:null,error:{message}});await expect(assertGoogleLocalEventActive(scope,eventId)).rejects.toThrow(message);
 expect(deps.auth).not.toHaveBeenCalled();expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it("captures scope/lease/runtime before the preflight storage await",async()=>{
 const mutableScope={...scope},creation=leasedCreation(),runtime={...googleBindingFromStorage(binding(),scope)};
 deps.rpc.mockImplementation(async()=>{mutableScope.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";runtime.version="8";return {data:true,error:null};});
 await assertGoogleLocalEventLease(mutableScope,creation,runtime,clientId);
 expect(deps.rpc.mock.calls[0][1]).toMatchObject({p_company_id:company,p_binding_version:"7",p_lease_id:creation.lease?.id});
});
it.each(["",null,"invalid client"])("refuses an invalid leased configured client before I/O %#",async value=>{
 await expect(assertGoogleLocalEventLease(scope,leasedCreation(),googleBindingFromStorage(binding(),scope),value as string)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it("refuses a lease from a different runtime binding or unlinked account before I/O",async()=>{
 for(const runtime of [googleBindingFromStorage(binding({grant_id:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"}),scope),googleBindingFromStorage(binding({unlinked_at:"2070-01-01T00:00:00Z"}),scope)]){
  await expect(assertGoogleLocalEventLease(scope,leasedCreation(),runtime,clientId)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
 }expect(deps.rpc).not.toHaveBeenCalled();
});
it("refuses malformed lease/attempt data before local preflight",async()=>{
 const runtime=googleBindingFromStorage(binding(),scope),creation=leasedCreation();
 for(const changed of [{...creation,lease:null},{...creation,attemptVersion:"00"},{...creation,lease:{...creation.lease!,id:"bad"}},{...creation,lease:{...creation.lease!,bindingVersion:"8"}}]){
  await expect(assertGoogleLocalEventLease(scope,changed,runtime,clientId)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
 }expect(deps.rpc).not.toHaveBeenCalled();
});
