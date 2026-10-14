import {google} from "googleapis";
import {beforeEach,expect,it,vi} from "vitest";
import type {GoogleBinding} from "./google-binding-store";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({rpc:vi.fn(),binding:vi.fn(),legacy:vi.fn(),activation:vi.fn(),runtime:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>deps}));
vi.mock("./google-binding-store",async importOriginal=>({...await importOriginal<typeof import("./google-binding-store")>(),loadGoogleBinding:deps.binding}));
vi.mock("./google-legacy-assignment",()=>({loadGoogleLegacyStatus:deps.legacy}));
vi.mock("./google-owner-activation",()=>({loadGoogleOwnerActivation:deps.activation}));
vi.mock("./google-workspace-runtime",()=>({withGoogleWorkspaceClient:deps.runtime}));
import {assertGoogleSettingsExpected,googleSettingsWorkspaceView,listGoogleSettingsCalendars,loadGoogleSettings,selectGoogleSettingsCalendar,unlinkGoogleSettings} from "./google-settings-service";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
let current:GoogleBinding|null,client:InstanceType<typeof google.auth.OAuth2>;
type TransportOptions=NonNullable<Parameters<InstanceType<typeof google.auth.OAuth2>["transporter"]["request"]>[0]>;
let transport:ReturnType<typeof vi.fn<(options:TransportOptions)=>Promise<unknown>>>;
const expected=()=>({workspaceKey:googleSettingsWorkspaceView(scope).workspaceKey,expectedBindingVersion:current?.version??"0"});
function raw(binding:GoogleBinding){return {id:binding.id,user_id:binding.workspace.userId,mode:binding.workspace.mode,company_id:binding.workspace.companyId,grant_id:binding.grantId,calendar_id:binding.calendarId,calendar_name:binding.calendarName,version:binding.version,unlinked_at:binding.unlinkedAt};}
function calendar(id="fixture-new-calendar",extra:Record<string,unknown>={}){return {id,summary:"Fixture agenda",accessRole:"writer",primary:false,...extra};}
beforeEach(()=>{
 vi.resetAllMocks();current={id:bindingId,workspace:{...scope},grantId,calendarId:"fixture-old-calendar",calendarName:"Old fixture",version:"9007199254740993",unlinkedAt:null};
 deps.binding.mockImplementation(async()=>current);deps.legacy.mockResolvedValue({exists:true,assigned:false,assignedHere:false});deps.activation.mockResolvedValue(true);
 client=new google.auth.OAuth2({clientId:"fixture.apps.googleusercontent.com"});client.setCredentials({access_token:"fixture-access",expiry_date:Date.now()+3600_000});client.eagerRefreshThresholdMillis=0;client.forceRefreshOnFailure=false;
 transport=vi.fn<(options:TransportOptions)=>Promise<unknown>>().mockResolvedValue({data:{items:[calendar()]},status:200});
 vi.spyOn(client.transporter,"request").mockImplementation(transport as never);
 deps.runtime.mockImplementation(async(_scope,_reference,operation)=>operation(client,current));
 deps.rpc.mockImplementation(async(name,args)=>{
  if(!current)return {data:null,error:{message:"GOOGLE_BINDING_CONFLICT"}};
  if(name==="zelo_google_binding_select_calendar")current={...current,calendarId:args.p_calendar_id,calendarName:args.p_calendar_name,version:String(BigInt(current.version)+BigInt(1))};
  else if(name==="zelo_google_binding_unlink")current={...current,unlinkedAt:"2026-10-13T15:00:00Z",version:String(BigInt(current.version)+BigInt(1))};
  else throw Error("Unexpected fixture RPC");
  return {data:raw(current),error:null};
 });
});
it("returns only frozen scoped status and never consults the provider",async()=>{
 const status=await loadGoogleSettings(scope);
 expect(status).toEqual({workspace:googleSettingsWorkspaceView(scope),activated:true,connected:true,bindingVersion:"9007199254740993",selectedCalendar:{id:"fixture-old-calendar",name:"Old fixture"},legacy:{exists:true,assigned:false,assignedHere:false}});
 expect(Object.isFrozen(status)&&Object.isFrozen(status.workspace)&&Object.isFrozen(status.selectedCalendar)&&Object.isFrozen(status.legacy)).toBe(true);
 expect(JSON.stringify(status)).not.toContain(grantId);expect(JSON.stringify(status)).not.toContain(bindingId);expect(JSON.stringify(status)).not.toContain(owner);
 expect(deps.runtime).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
});
it("shows an unassigned legacy connection without claiming that it belongs here",async()=>{
 current=null;deps.activation.mockResolvedValue(false);
 expect(await loadGoogleSettings(scope)).toMatchObject({activated:false,connected:false,bindingVersion:"0",selectedCalendar:null,legacy:{exists:true,assigned:false,assignedHere:false}});
 expect(deps.runtime).not.toHaveBeenCalled();
});
it("retains tombstone revision while disconnected and activated",async()=>{
 current={...current!,unlinkedAt:"2026-10-13T15:00:00Z"};
 expect(await loadGoogleSettings(scope)).toMatchObject({activated:true,connected:false,bindingVersion:current.version,selectedCalendar:null});
});
it("separates opaque workspace keys by owner, personal space and company UUID",()=>{
 const view=googleSettingsWorkspaceView(scope),personal=googleSettingsWorkspaceView({...scope,mode:"personal",companyId:null});
 expect(view.workspaceKey).toMatch(/^[a-f0-9]{64}$/);expect(view.workspaceKey).not.toBe(personal.workspaceKey);
 expect(view.workspaceKey).not.toBe(googleSettingsWorkspaceView({...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"}).workspaceKey);
 expect(view.workspaceKey).not.toBe(googleSettingsWorkspaceView({...scope,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}).workspaceKey);
 expect(googleSettingsWorkspaceView({...scope,userId:owner.toUpperCase(),companyId:company.toUpperCase()})).toEqual(view);
});
it.each([{},null,{...scope,companyId:null},{...scope,mode:"personal"},{...scope,trusted:true}])("rejects unverified or malformed workspace shape %#",async scope=>{
 await expect(loadGoogleSettings(scope as GoogleWorkspace)).rejects.toThrow("GOOGLE_SETTINGS_INPUT_INVALID");expect(deps.binding).not.toHaveBeenCalled();
});
it.each([null,{}, {workspaceKey:"wrong",expectedBindingVersion:"1"},{workspaceKey:"0".repeat(64),expectedBindingVersion:1}, {workspaceKey:"0".repeat(64),expectedBindingVersion:"01"}, {workspaceKey:"0".repeat(64),expectedBindingVersion:"9223372036854775808"}])("rejects malformed revision expectations %#",async input=>{
 await expect(assertGoogleSettingsExpected(scope,input)).rejects.toThrow("GOOGLE_SETTINGS_INPUT_INVALID");expect(deps.binding).not.toHaveBeenCalled();
});
it("rejects another workspace or stale revision before provider work",async()=>{
 await expect(listGoogleSettingsCalendars(scope,{...expected(),workspaceKey:googleSettingsWorkspaceView({...scope,mode:"personal",companyId:null}).workspaceKey})).rejects.toThrow("GOOGLE_SETTINGS_WORKSPACE_CHANGED");
 await expect(selectGoogleSettingsCalendar(scope,{...expected(),expectedBindingVersion:"1",calendarId:"fixture-new-calendar"})).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");
 expect(deps.runtime).not.toHaveBeenCalled();expect(deps.rpc).not.toHaveBeenCalled();
});
it("accepts an absent binding only for a zero-revision authorization guard",async()=>{
 current=null;expect(await assertGoogleSettingsExpected(scope,expected())).toBeNull();
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_NOT_CONNECTED");expect(deps.runtime).not.toHaveBeenCalled();
});
it("captures scope and expected values before an asynchronous storage read",async()=>{
 const mutable={...scope},input=expected();
 deps.binding.mockImplementationOnce(async()=>{mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";input.expectedBindingVersion="1";return current;});
 const result=await listGoogleSettingsCalendars(mutable,input);
 expect(result.workspace).toEqual(googleSettingsWorkspaceView(scope));expect(result.bindingVersion).toBe("9007199254740993");
 expect(deps.runtime.mock.calls[0][0]).toEqual(scope);
});
it("lists sanitized writable calendars through the real SDK across bounded pages",async()=>{
 transport.mockResolvedValueOnce({data:{items:[calendar("secondary",{summaryOverride:"Work",hidden:true,privateCredential:"fixture-private"}),calendar("readonly",{accessRole:"reader"}),calendar("deleted",{deleted:true})],nextPageToken:"fixture-page"},status:200})
  .mockResolvedValueOnce({data:{items:[calendar("primary-real",{primary:true,summary:"Personal"})]},status:200});
 const result=await listGoogleSettingsCalendars(scope,expected());
 expect(result.calendars).toEqual([{id:"primary-real",name:"Personal",primary:true},{id:"secondary",name:"Work",primary:false}]);
 expect(JSON.stringify(result)).not.toContain("fixture-private");expect(Object.isFrozen(result.calendars)&&result.calendars.every(Object.isFrozen)).toBe(true);
 expect(transport).toHaveBeenCalledTimes(2);expect(transport.mock.calls.every(([options])=>options.retry===false&&options.timeout===15000)).toBe(true);
});
it.each([null,{items:[null]},{items:{}},{items:[calendar("",{})]},{items:[calendar("x",{primary:"yes"})]},{items:[calendar("x",{summary:"secret\nvalue"})]},{items:[calendar("x",{accessRole:"unexpected"})]},{nextPageToken:123}])("refuses malformed provider results without partial status %#",async data=>{
 transport.mockResolvedValue({data,status:200});await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_PROVIDER_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it("rejects looping pagination and repeated calendar IDs",async()=>{
 transport.mockResolvedValue({data:{items:[],nextPageToken:"same-page"},status:200});
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_PROVIDER_INVALID");expect(transport).toHaveBeenCalledTimes(2);
 transport.mockClear().mockResolvedValue({data:{items:[calendar("duplicate"),calendar("duplicate")]},status:200});
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_PROVIDER_INVALID");
});
it("bounds endless unique pagination without exposing incomplete results",async()=>{
 let pages=0;transport.mockImplementation(async()=>({data:{items:[],nextPageToken:`page-${++pages}`},status:200}));
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE");expect(transport).toHaveBeenCalledTimes(20);
});
it("rejects unlink or reconnect during listing before exposing stale calendars",async()=>{
 transport.mockImplementationOnce(async()=>{current={...current!,version:"9007199254740994",unlinkedAt:"2026-10-13T15:00:00Z"};return {data:{items:[calendar()]},status:200};});
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");
});
it("checks the exact captured runtime binding before a provider request",async()=>{
 deps.runtime.mockImplementationOnce(async(_scope,_ref,operation)=>operation(client,{...current!,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"}));
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");expect(transport).not.toHaveBeenCalled();
});
it("requires permanent activation before provider access",async()=>{
 deps.activation.mockResolvedValue(false);
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_STORAGE_INVALID");expect(deps.runtime).not.toHaveBeenCalled();
});
it("selects only a verified provider calendar and commits the exact decimal CAS",async()=>{
 transport.mockResolvedValue({data:calendar(),status:200});
 const result=await selectGoogleSettingsCalendar(scope,{...expected(),calendarId:"fixture-new-calendar"});
 expect(result).toMatchObject({connected:true,bindingVersion:"9007199254740994",selectedCalendar:{id:"fixture-new-calendar",name:"Fixture agenda"}});
 expect(deps.rpc).toHaveBeenCalledWith("zelo_google_binding_select_calendar",{p_user_id:owner,p_mode:"business",p_company_id:company,p_binding_version:"9007199254740993",p_calendar_id:"fixture-new-calendar",p_calendar_name:"Fixture agenda"});
});
it("resolves the primary alias only when the provider explicitly verifies primary",async()=>{
 transport.mockResolvedValue({data:calendar("primary-stable",{primary:true}),status:200});
 expect((await selectGoogleSettingsCalendar(scope,{...expected(),calendarId:"primary"})).selectedCalendar?.id).toBe("primary-stable");
});
it.each([calendar("other"),calendar("fixture-new-calendar",{accessRole:"reader"}),calendar("fixture-new-calendar",{deleted:true})])("refuses a mismatched/read-only/deleted selection %#",async data=>{
 transport.mockResolvedValue({data,status:200});await expect(selectGoogleSettingsCalendar(scope,{...expected(),calendarId:"fixture-new-calendar"})).rejects.toThrow("GOOGLE_SETTINGS_PROVIDER_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it("does not mistake another calendar for the primary alias",async()=>{
 transport.mockResolvedValue({data:calendar(),status:200});await expect(selectGoogleSettingsCalendar(scope,{...expected(),calendarId:"primary"})).rejects.toThrow("GOOGLE_SETTINGS_PROVIDER_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it("does not overwrite a choice changed while provider verification was in flight",async()=>{
 transport.mockImplementationOnce(async()=>{current={...current!,version:"9007199254740994",calendarId:"concurrent-choice"};return {data:calendar(),status:200};});
 await expect(selectGoogleSettingsCalendar(scope,{...expected(),calendarId:"fixture-new-calendar"})).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");expect(deps.rpc).not.toHaveBeenCalled();expect(current!.calendarId).toBe("concurrent-choice");
});
it("unlinks only the selected binding without consulting/revoking the provider",async()=>{
 const result=await unlinkGoogleSettings(scope,expected());expect(result).toMatchObject({activated:true,connected:false,bindingVersion:"9007199254740994",selectedCalendar:null});
 expect(deps.rpc.mock.calls.map(([name])=>name)).toEqual(["zelo_google_binding_unlink"]);expect(deps.runtime).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();expect(current!.grantId).toBe(grantId);
});
it("rejects unexpected client credential or ownership fields before effects",async()=>{
 await expect(unlinkGoogleSettings(scope,{...expected(),grantId})).rejects.toThrow("GOOGLE_SETTINGS_INPUT_INVALID");
 await expect(selectGoogleSettingsCalendar(scope,{...expected(),calendarId:"fixture-new-calendar",userId:owner})).rejects.toThrow("GOOGLE_SETTINGS_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
});
it("strips database/provider diagnostics and preserves only fixed errors",async()=>{
 transport.mockRejectedValue(Error("private fixture provider diagnostic"));
 const error=await listGoogleSettingsCalendars(scope,expected()).catch(error=>error);expect(error).toBeInstanceOf(Error);expect(error.message).toBe("GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE");expect(error.stack).not.toContain("private fixture");expect(error).not.toHaveProperty("cause");
 deps.rpc.mockResolvedValue({data:null,error:{message:"GOOGLE_BINDING_CONFLICT"}});await expect(unlinkGoogleSettings(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");
 deps.rpc.mockRejectedValue(Error("private fixture SQL diagnostic"));await expect(unlinkGoogleSettings(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_STORAGE_UNAVAILABLE");
});
it("rejects corrupted mutation results rather than claiming successful unlink",async()=>{
 deps.rpc.mockResolvedValue({data:{...raw(current!),version:"9007199254740994",unlinked_at:"2026-10-13T15:00:00Z",grant_id:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"},error:null});
 await expect(unlinkGoogleSettings(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_STORAGE_INVALID");
});
it("does not report a selected calendar that differs from the committed result",async()=>{
 transport.mockResolvedValue({data:calendar(),status:200});
 deps.rpc.mockImplementationOnce(async()=>{
  const saved={...current!,version:"9007199254740994",calendarId:"fixture-new-calendar",calendarName:"Fixture agenda"};
  current={...saved,calendarId:"wrong-stored-calendar"};return {data:raw(saved),error:null};
 });
 await expect(selectGoogleSettingsCalendar(scope,{...expected(),calendarId:"fixture-new-calendar"})).rejects.toThrow("GOOGLE_SETTINGS_STORAGE_INVALID");
});
it("rejects a binding changed during status reads instead of combining versions",async()=>{
 deps.activation.mockImplementationOnce(async()=>{current={...current!,version:"9007199254740994"};return true;});
 await expect(loadGoogleSettings(scope)).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");
});
it("does not treat a legacy assignment without its permanent activation as valid",async()=>{
 current=null;deps.activation.mockResolvedValue(false);deps.legacy.mockResolvedValue({exists:true,assigned:true,assignedHere:false});
 await expect(loadGoogleSettings(scope)).rejects.toThrow("GOOGLE_SETTINGS_STORAGE_INVALID");
});
it("retains a fixed callback failure even when the credential runtime masks it",async()=>{
 deps.runtime.mockImplementationOnce(async(_scope,_reference,operation)=>{try{return await operation(client,current);}catch{throw Error("GOOGLE_RUNTIME_FAILED");}});
 transport.mockResolvedValue({data:{items:[null]},status:200});
 await expect(listGoogleSettingsCalendars(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_PROVIDER_INVALID");
});
it("refuses malformed mutation output and activation outages without successful status",async()=>{
 deps.rpc.mockResolvedValue({data:null,error:null});await expect(unlinkGoogleSettings(scope,expected())).rejects.toThrow("GOOGLE_SETTINGS_STORAGE_INVALID");
 deps.activation.mockRejectedValue(Error("GOOGLE_ACTIVATION_STORAGE_UNAVAILABLE"));await expect(loadGoogleSettings(scope)).rejects.toThrow("GOOGLE_SETTINGS_STORAGE_UNAVAILABLE");
});
