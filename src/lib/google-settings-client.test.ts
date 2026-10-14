import {beforeEach,expect,it,vi} from "vitest";
import {createGoogleSettingsController,type GoogleClientState,type GoogleSettingsTarget} from "./google-settings-client";
const personal:GoogleSettingsTarget={mode:"personal",companyId:null,workspaceKey:"a".repeat(64),label:"Pessoal"};
const business:GoogleSettingsTarget={mode:"business",companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",workspaceKey:"b".repeat(64),label:"Empresa fixture"};
let controller:ReturnType<typeof createGoogleSettingsController>,fetcher:ReturnType<typeof vi.fn<(url:string,init?:RequestInit)=>Promise<Response>>>,navigate:ReturnType<typeof vi.fn<(url:string)=>void>>,states:GoogleClientState[];
function status(target=personal,extra:Record<string,unknown>={}){return {workspace:{mode:target.mode,companyId:target.companyId,workspaceKey:target.workspaceKey},activated:true,connected:true,bindingVersion:"3",selectedCalendar:{id:"old",name:"Old"},legacy:{exists:true,assigned:false,assignedHere:false},...extra};}
function list(target=personal,extra:Record<string,unknown>={}){return {workspace:{mode:target.mode,companyId:target.companyId,workspaceKey:target.workspaceKey},bindingVersion:"3",selectedCalendarId:"old",calendars:[{id:"old",name:"Old",primary:true},{id:"new",name:"New",primary:false}],...extra};}
function deferred(){let resolve!:(response:Response)=>void,reject!:(error:Error)=>void;const promise=new Promise<Response>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
beforeEach(()=>{
 states=[];navigate=vi.fn<(url:string)=>void>();fetcher=vi.fn<(url:string,init?:RequestInit)=>Promise<Response>>().mockImplementation(async url=>Response.json(url==="/api/google/status"?status():list()));
 controller=createGoogleSettingsController({fetch:fetcher,navigate,changed:state=>states.push(state)});
});
it("fails closed with no server-confirmed target",async()=>{
 await controller.setTarget(null);await controller.connect("pt-BR");await controller.unlink();expect(fetcher).not.toHaveBeenCalled();expect(controller.state().status).toBeNull();
});
it("loads only status matching the server-confirmed workspace and confirms the calendar",async()=>{
 await controller.setTarget(personal);expect(controller.state()).toMatchObject({target:personal,status:{bindingVersion:"3"},loading:false,busy:false,errorCode:null});
 expect(controller.state().calendars).toHaveLength(2);expect(fetcher.mock.calls[1][0]).toContain(`workspaceKey=${personal.workspaceKey}`);expect(fetcher.mock.calls[1][0]).toContain("expectedBindingVersion=3");
});
it("resets immediately and ignores delayed old status and its finally after switching spaces",async()=>{
 const old=deferred();fetcher.mockReturnValueOnce(old.promise);const loading=controller.setTarget(personal);
 fetcher.mockImplementation(async url=>Response.json(url==="/api/google/status"?status(business):list(business)));
 const next=controller.setTarget(business);expect(controller.state().status).toBeNull();expect(controller.state().calendars).toEqual([]);expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
 await next;old.resolve(Response.json(status()));await loading;expect(controller.state()).toMatchObject({target:business,status:{workspace:{workspaceKey:business.workspaceKey}},loading:false,errorCode:null});
});
it("ignores a delayed old error while the new workspace is still loading",async()=>{
 const old=deferred(),next=deferred();fetcher.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
 const first=controller.setTarget(personal),second=controller.setTarget(business);old.reject(Error("private fixture error"));await first;
 expect(controller.state()).toMatchObject({target:business,loading:true,errorCode:null,status:null});next.resolve(Response.json(status(business,{connected:false,selectedCalendar:null})));await second;
});
it("refuses another owner's/workspace's response before loading calendars",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(status(business)));await controller.setTarget(personal);
 expect(controller.state()).toMatchObject({status:null,calendars:[],errorCode:"GOOGLE_SETTINGS_WORKSPACE_CHANGED",loading:false});expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps the confirmed calendar during selection and refuses rapid overlapping changes",async()=>{
 await controller.setTarget(personal);const pending=deferred();fetcher.mockReturnValueOnce(pending.promise);const selecting=controller.chooseCalendar("new");
 expect(controller.state()).toMatchObject({busy:true,status:{selectedCalendar:{id:"old"}}});await controller.chooseCalendar("old");expect(fetcher).toHaveBeenCalledTimes(3);
 pending.resolve(Response.json(status(personal,{bindingVersion:"4",selectedCalendar:{id:"new",name:"New"}})));await selecting;
 expect(controller.state()).toMatchObject({busy:false,status:{selectedCalendar:{id:"new"}},notice:"saved"});
});
it("retains confirmed state when selection fails and hides raw diagnostics",async()=>{
 await controller.setTarget(personal);fetcher.mockResolvedValueOnce(Response.json({code:"raw-private-diagnostic",error:"private fixture secret"},{status:500}));await controller.chooseCalendar("new");
 expect(controller.state()).toMatchObject({busy:false,status:{selectedCalendar:{id:"old"}},errorCode:"GOOGLE_SETTINGS_UNAVAILABLE"});expect(JSON.stringify(states)).not.toContain("private fixture");
});
it("reloads confirmed status after a stale revision conflict",async()=>{
 await controller.setTarget(personal);
 fetcher.mockResolvedValueOnce(Response.json({code:"GOOGLE_SETTINGS_CONFLICT"},{status:409}))
  .mockResolvedValueOnce(Response.json(status(personal,{bindingVersion:"4",selectedCalendar:{id:"new",name:"New"}})))
  .mockResolvedValueOnce(Response.json(list(personal,{bindingVersion:"4",selectedCalendarId:"new"})));
 await controller.chooseCalendar("new");expect(controller.state()).toMatchObject({busy:false,status:{bindingVersion:"4",selectedCalendar:{id:"new"}},errorCode:"GOOGLE_SETTINGS_CONFLICT",notice:null});
});
it("ignores selection success, failure and finally after logout",async()=>{
 await controller.setTarget(personal);const pending=deferred();fetcher.mockReturnValueOnce(pending.promise);const action=controller.chooseCalendar("new");await controller.setTarget(null);
 pending.resolve(Response.json(status(personal,{bindingVersion:"4",selectedCalendar:{id:"new",name:"New"}})));await action;
 expect(controller.state()).toMatchObject({target:null,status:null,calendars:[],busy:false,errorCode:null});expect(navigate).not.toHaveBeenCalled();
});
it("uses POST for reconnect and navigates only to the exact Google HTTPS authorization endpoint",async()=>{
 await controller.setTarget(personal);const url="https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=fixture";
 fetcher.mockResolvedValueOnce(Response.json({authorizationUrl:url}));await controller.connect("pt-PT");expect(navigate).toHaveBeenCalledWith(url);
 const [endpoint,init]=fetcher.mock.calls[2];expect(endpoint).toBe("/api/google/connect");expect(init?.method).toBe("POST");expect(JSON.parse(init!.body as string)).toEqual({workspaceKey:personal.workspaceKey,expectedBindingVersion:"3",locale:"pt-PT"});
});
it.each(["https://attacker.test/o/oauth2/v2/auth","http://accounts.google.com/o/oauth2/v2/auth","https://accounts.google.com/other","https://fixture@accounts.google.com/o/oauth2/v2/auth","https://accounts.google.com:444/o/oauth2/v2/auth"])("refuses an unexpected authorization destination: %s",async authorizationUrl=>{
 await controller.setTarget(personal);fetcher.mockResolvedValueOnce(Response.json({authorizationUrl}));await controller.connect("es");expect(navigate).not.toHaveBeenCalled();expect(controller.state().errorCode).toBe("GOOGLE_SETTINGS_RESPONSE_INVALID");
});
it("requires an explicit confirmation for the currently displayed legacy target",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(status(personal,{connected:false,bindingVersion:"0",selectedCalendar:null,activated:false})));await controller.setTarget(personal);
 await controller.assignLegacy("b".repeat(64));expect(fetcher).toHaveBeenCalledTimes(1);
 fetcher.mockResolvedValueOnce(Response.json(status(personal,{bindingVersion:"1",legacy:{exists:true,assigned:true,assignedHere:true}}))).mockResolvedValueOnce(Response.json(list(personal,{bindingVersion:"1"})));
 await controller.assignLegacy(personal.workspaceKey);
 expect(fetcher.mock.calls[1][0]).toBe("/api/google/legacy");expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({workspaceKey:personal.workspaceKey,expectedBindingVersion:"0",confirmTarget:true});
 expect(controller.state()).toMatchObject({notice:"legacy",status:{legacy:{assignedHere:true}}});
});
it("unlinks only after confirmed success and retains the selected connection on failure",async()=>{
 await controller.setTarget(personal);fetcher.mockResolvedValueOnce(Response.json({code:"GOOGLE_SETTINGS_STORAGE_UNAVAILABLE"},{status:503}));await controller.unlink();expect(controller.state().status?.connected).toBe(true);
 fetcher.mockResolvedValueOnce(Response.json(status(personal,{connected:false,bindingVersion:"4",selectedCalendar:null})));await controller.unlink();expect(controller.state()).toMatchObject({status:{connected:false},calendars:[],notice:"unlinked",busy:false});
});
it("clears all confirmed connection data on an expired session",async()=>{
 await controller.setTarget(personal);fetcher.mockResolvedValueOnce(Response.json({code:"GOOGLE_SETTINGS_AUTH_REQUIRED"},{status:401}));await controller.unlink();
 expect(controller.state()).toMatchObject({target:null,status:null,calendars:[],busy:false,errorCode:"GOOGLE_SETTINGS_AUTH_REQUIRED"});
});
it("ignores a delayed reconnect after another company becomes current",async()=>{
 await controller.setTarget(personal);const pending=deferred();fetcher.mockReturnValueOnce(pending.promise);const connecting=controller.connect("pt-BR");
 fetcher.mockImplementation(async url=>Response.json(url==="/api/google/status"?status(business,{connected:false,selectedCalendar:null}):list(business)));await controller.setTarget(business);
 pending.resolve(Response.json({authorizationUrl:"https://accounts.google.com/o/oauth2/v2/auth?state=fixture&response_type=code"}));await connecting;expect(navigate).not.toHaveBeenCalled();expect(controller.state().target).toEqual(business);
});
it("rejects mismatched calendar-list revision without replacing the confirmed selection",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(status())).mockResolvedValueOnce(Response.json(list(personal,{bindingVersion:"4"})));await controller.setTarget(personal);
 expect(controller.state()).toMatchObject({status:{selectedCalendar:{id:"old"}},calendars:[],errorCode:"GOOGLE_SETTINGS_RESPONSE_INVALID",loading:false});
});
it.each([status(personal,{selectedCalendar:{id:"new",name:"New"}}),status(personal,{bindingVersion:"4",selectedCalendar:{id:"other",name:"Other"}}),status(personal,{bindingVersion:"4",connected:false,selectedCalendar:null})])("does not accept an incorrect selected-calendar result %#",async response=>{
 await controller.setTarget(personal);fetcher.mockResolvedValueOnce(Response.json(response));await controller.chooseCalendar("new");
 expect(controller.state()).toMatchObject({status:{selectedCalendar:{id:"old"}},errorCode:"GOOGLE_SETTINGS_RESPONSE_INVALID",notice:null});
});
it("does not accept a malformed authorization URL",async()=>{
 await controller.setTarget(personal);fetcher.mockResolvedValueOnce(Response.json({authorizationUrl:"not a url"}));await controller.connect("pt-BR");
 expect(controller.state().errorCode).toBe("GOOGLE_SETTINGS_RESPONSE_INVALID");expect(navigate).not.toHaveBeenCalled();
});
it("preserves the unassigned connection and exposes the explicit reconnect instruction after expiry",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(status(personal,{activated:false,connected:false,bindingVersion:"0",selectedCalendar:null})));
 await controller.setTarget(personal);fetcher.mockResolvedValueOnce(Response.json({code:"GOOGLE_SETTINGS_REAUTHORIZE_REQUIRED"},{status:400}));await controller.assignLegacy(personal.workspaceKey);
 expect(controller.state()).toMatchObject({status:{activated:false,connected:false,legacy:{assigned:false}},errorCode:"GOOGLE_SETTINGS_REAUTHORIZE_REQUIRED",notice:null,busy:false});expect(navigate).not.toHaveBeenCalled();
});
