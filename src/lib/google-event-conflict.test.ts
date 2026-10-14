import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {google} from "googleapis";
const deps=vi.hoisted(()=>({rpc:vi.fn(),rows:vi.fn(),head:vi.fn(),command:vi.fn(),active:vi.fn(),binding:vi.fn(),runtime:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("./supabase",()=>({getSupabase:()=>({rpc:deps.rpc})}));
vi.mock("./google-event-readmodel",()=>({loadGoogleAppointmentRows:deps.rows}));
vi.mock("./google-event-command-store",()=>({loadGoogleEventCommand:deps.command,loadGoogleEventCommandHead:deps.head,assertGoogleEventCommandActive:deps.active}));
vi.mock("./google-binding-store",()=>({loadGoogleBinding:deps.binding}));vi.mock("./google-workspace-runtime",()=>({withGoogleWorkspaceClient:deps.runtime}));
import {googleEventProviderMarkers} from "./google-event-marker";
import {googleEventRetryIdentity} from "./google-event-policy";
import {confirmGoogleEventConflict,inspectGoogleEventConflict} from "./google-event-conflict";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const id="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",op="ffffffff-ffff-4fff-8fff-fffffffffff1",mutation="12345678-aaaa-4aaa-8aaa-aaaaaaaaaaa1",version="v1:1:1:1";
const confirmation={clientMutationId:mutation,expectedGoogleSyncVersion:version,confirmOverwrite:true as const};
const binding={id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc1",workspace:scope,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd1",version:"7",calendarId:"new-selected-calendar",calendarName:null,unlinkedAt:null};
const intent={workspace:scope,eventId:id,bindingId:binding.id,grantId:binding.grantId,bindingVersion:"5",calendarId:"original-fictitious-calendar",...googleEventRetryIdentity(scope,id)};
let command:Record<string,unknown>,auth:InstanceType<typeof google.auth.OAuth2>;
type Options=NonNullable<Parameters<InstanceType<typeof google.auth.OAuth2>["transporter"]["request"]>[0]>;
const transport=vi.fn<(options:Options)=>Promise<unknown>>();
function remote(){return {id:intent.remoteEventId,status:"confirmed",etag:'"fresh-fictitious"',extendedProperties:{private:googleEventProviderMarkers(intent,"a".repeat(64),false)}};}
beforeEach(()=>{
 vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-conflict-marker-key-only");command={intent,operationId:op,headVersion:"1",attemptVersion:"1",kind:"update",state:"failed",failureCode:"ETAG_CONFLICT",creationFingerprint:"a".repeat(64),creationWithMeet:false,payloadFingerprint:"b".repeat(64),payload:{summary:"Original wanted edit"}};
 deps.rows.mockReset().mockResolvedValue([{google_sync_version:version}]);deps.head.mockReset().mockResolvedValue({operationId:op,version:"1",deleted:false});deps.command.mockReset().mockImplementation(async()=>command);deps.active.mockReset().mockResolvedValue(undefined);deps.binding.mockReset().mockResolvedValue(binding);
 deps.rpc.mockReset().mockImplementation(async(name)=>({data:name.endsWith("_get")?null:{event_id:id,operation_id:op},error:null}));
 auth=new google.auth.OAuth2("fixture.apps.googleusercontent.com");auth.setCredentials({access_token:"fictitious-access",expiry_date:Date.now()+3600_000});
 transport.mockReset().mockImplementation(async options=>({data:remote(),status:200,statusText:"OK",headers:new Headers(),config:options}));vi.spyOn(auth.transporter,"request").mockImplementation(transport as never);
 deps.runtime.mockReset().mockImplementation(async(_scope,_reference,callback)=>callback(auth,binding));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each(["update","delete"])("confirms %s using original target fresh verified ETag and same operation",async kind=>{
 command={...command,kind};expect(await confirmGoogleEventConflict(scope,id,confirmation)).toEqual({eventId:id,operationId:op,replayed:false});
 expect(transport).toHaveBeenCalledTimes(1);const options=transport.mock.calls[0][0];expect(options.method).toBe("GET");expect(String(options.url)).toContain(intent.calendarId);expect(String(options.url)).not.toContain(binding.calendarId);expect(options.retry).toBe(false);expect(options.timeout).toBe(15000);
 expect(deps.rpc.mock.calls[1]).toEqual(["zelo_google_event_conflict_confirm",expect.objectContaining({p_mutation_id:mutation,p_expected_sync_version:version,p_operation_id:op,p_binding_version:"7",p_etag:'"fresh-fictitious"'})]);expect(deps.active.mock.calls.length).toBeGreaterThanOrEqual(3);
});
it("replays original acknowledgment without current command credentials/provider",async()=>{
 deps.rpc.mockResolvedValue({data:{event_id:id,operation_id:op},error:null});deps.rows.mockRejectedValue(Error());deps.runtime.mockRejectedValue(Error());
 expect(await confirmGoogleEventConflict(scope,id,confirmation)).toEqual({eventId:id,operationId:op,replayed:true});expect(deps.rows).not.toHaveBeenCalled();expect(deps.runtime).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
});
it.each([undefined,false,"true"])("requires explicit human confirmation %s",async confirmOverwrite=>{await expect(confirmGoogleEventConflict(scope,id,{...confirmation,confirmOverwrite} as never)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();});
it.each(["etag","userId","operationId","bindingId"])("rejects client provider/authority field %s",async field=>{await expect(confirmGoogleEventConflict(scope,id,{...confirmation,[field]:"untrusted"} as never)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();});
it.each(["conference","succeeded","TEMPORARY","stale","missing"])("cannot turn %s into overwrite consent",async variant=>{
 if(variant==="conference")command={...command,kind:"conference"};if(variant==="succeeded")command={...command,state:"succeeded"};if(variant==="TEMPORARY")command={...command,failureCode:"TEMPORARY"};if(variant==="stale")deps.rows.mockResolvedValue([{google_sync_version:"v1:1:1:2"}]);if(variant==="missing")deps.rows.mockResolvedValue([]);
 await expect(confirmGoogleEventConflict(scope,id,confirmation)).rejects.toThrow();expect(deps.runtime).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it.each(["foreign","mismatched-id","no-etag","bad-etag","cancelled","malformed"])("denies %s provider read before acknowledgment",async variant=>{
 const row=remote();const data=variant==="foreign"?{...row,extendedProperties:{private:{}}}:variant==="mismatched-id"?{...row,id:"foreign"}:variant==="no-etag"?{...row,etag:null}:variant==="bad-etag"?{...row,etag:"bad\ntag"}:variant==="cancelled"?{...row,status:"cancelled"}:null;
 transport.mockImplementation(async options=>({data,status:200,headers:new Headers(),config:options}));await expect(confirmGoogleEventConflict(scope,id,confirmation)).rejects.toThrow();expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it.each(["binding","revision","operation","local"])("rechecks %s after fresh provider read",async variant=>{
 transport.mockImplementation(async options=>{if(variant==="binding")deps.binding.mockResolvedValue({...binding,version:"8"});if(variant==="revision")deps.rows.mockResolvedValue([{google_sync_version:"v1:1:1:2"}]);if(variant==="operation")deps.head.mockResolvedValue({operationId:mutation,version:"1",deleted:false});if(variant==="local")deps.active.mockRejectedValue(Error("hidden"));return {data:remote(),status:200,headers:new Headers(),config:options};});
 await expect(confirmGoogleEventConflict(scope,id,confirmation)).rejects.toThrow();expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it("sanitizes provider failure and SQL final CAS failure without mutation retry",async()=>{
 transport.mockRejectedValue(Error("fictitious private diagnostic"));await expect(confirmGoogleEventConflict(scope,id,confirmation)).rejects.toThrow("GOOGLE_EVENT_UNAVAILABLE");expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it("uses final SQL CAS and never acknowledges an intervening conflict",async()=>{deps.rpc.mockImplementation(async name=>name.endsWith("_get")?{data:null,error:null}:{data:null,error:{message:"GOOGLE_EVENT_COMMAND_CONFLICT"}});await expect(confirmGoogleEventConflict(scope,id,confirmation)).rejects.toThrow("GOOGLE_EVENT_COMMAND_CONFLICT");});
it("inspection is read only and exposes only ability for one confirmed update/delete",async()=>{expect(await inspectGoogleEventConflict(scope,id,version)).toEqual({canOverwrite:true});command={...command,kind:"conference"};expect(await inspectGoogleEventConflict(scope,id,version)).toEqual({canOverwrite:false});expect(deps.rpc).not.toHaveBeenCalled();expect(deps.runtime).not.toHaveBeenCalled();});

it("captures input and scope before awaiting the private receipt",async()=>{const mutableScope={...scope},input={...confirmation};deps.rpc.mockImplementation(async name=>{if(name.endsWith("_get")){mutableScope.userId="bad";input.expectedGoogleSyncVersion="bad";input.clientMutationId=op;return {data:null,error:null};}return {data:{event_id:id,operation_id:op},error:null};});await confirmGoogleEventConflict(mutableScope,id,input);expect(deps.rpc.mock.calls[1][1]).toMatchObject({p_user_id:scope.userId,p_mutation_id:mutation,p_expected_sync_version:version});});
it("rejects a confirmation response naming a different operation",async()=>{deps.rpc.mockImplementation(async name=>({data:name.endsWith("_get")?null:{event_id:id,operation_id:mutation},error:null}));await expect(confirmGoogleEventConflict(scope,id,confirmation)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");});
