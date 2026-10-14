import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {runWithCompanyContext,runWithTrustedCompanyJob,setCompanyContext} from "./company-context";
import {captureGoogleWhatsAppWorkspace,prepareGoogleWhatsAppIntent,replayGoogleWhatsAppIntent} from "./google-whatsapp-intent";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",otherCompany="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",event="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",mutation="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const selected={userId:owner,companyId:company,mode:"business" as const,companyName:"Fixture company"},body={title:"Fixture",startAt:"2026-10-14T15:00:00Z",allDay:false,repeat:"none"};
const within=(next:()=>Promise<unknown>)=>runWithCompanyContext(async()=>{setCompanyContext(selected);return next();});
it("captures only the confirmed participant context and canonicalizes personal independently of a remembered company",async()=>{
 await within(async()=>{expect(captureGoogleWhatsAppWorkspace(owner)).toEqual({userId:owner,companyId:company,mode:"business"});setCompanyContext({...selected,mode:"personal"});expect(captureGoogleWhatsAppWorkspace(owner)).toEqual({userId:owner,companyId:null,mode:"personal"});});
 expect(()=>captureGoogleWhatsAppWorkspace(owner)).toThrow("GOOGLE_WHATSAPP_SCOPE_DENIED");
 await runWithTrustedCompanyJob(async()=>{expect(()=>captureGoogleWhatsAppWorkspace(owner)).toThrow("GOOGLE_WHATSAPP_SCOPE_DENIED");});
});
it("denies a foreign owner, archived company or participant without mode access",async()=>{
 await within(async()=>{
  expect(()=>captureGoogleWhatsAppWorkspace("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2")).toThrow("GOOGLE_WHATSAPP_SCOPE_DENIED");
  for(const context of [{...selected,allowBusiness:false},{...selected,archivedCompanyIds:[company]},{...selected,mode:"personal" as const,allowPersonal:false}]){setCompanyContext(context);expect(()=>captureGoogleWhatsAppWorkspace(owner)).toThrow("GOOGLE_WHATSAPP_SCOPE_DENIED");}
 });
});
it("freezes a distinct payload and stable server UUID, preserving exact bigint revision across persisted replay",async()=>{
 await within(async()=>{
  const input={title:"Changed",description:undefined};const intent=prepareGoogleWhatsAppIntent(owner,"update_appointment",input,{appointmentId:event,expectedGoogleSyncVersion:"v1:9007199254740993:0:0",clientMutationId:mutation});input.title="Changed later";
  expect(intent.payload).toEqual({title:"Changed"});expect(Object.isFrozen(intent.payload)).toBe(true);expect(Object.isFrozen(intent.workspace)).toBe(true);expect(Object.isFrozen(intent)).toBe(true);
  const replayed=replayGoogleWhatsAppIntent(owner,JSON.parse(JSON.stringify(intent)));expect(replayed).toEqual(intent);expect(replayed.clientMutationId).toBe(mutation);expect(replayed.expectedGoogleSyncVersion).toBe("v1:9007199254740993:0:0");
  expect(()=>replayGoogleWhatsAppIntent(owner,intent,{title:"Different"})).toThrow("GOOGLE_WHATSAPP_INTENT_CHANGED");
  expect(replayGoogleWhatsAppIntent(owner,intent,{description:undefined,title:"Changed"})).toEqual(intent);
 });
});
it("creation allocates a UUID once and never upgrades a pending intent after switching mode/company",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body);expect(intent.clientMutationId).toMatch(/^[a-f0-9-]{36}$/);expect(intent.appointmentId).toBeNull();expect(intent.expectedGoogleSyncVersion).toBeNull();
  for(const context of [{...selected,companyId:otherCompany},{...selected,mode:"personal" as const}]){setCompanyContext(context);expect(()=>replayGoogleWhatsAppIntent(owner,intent)).toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");}
  setCompanyContext(selected);expect(replayGoogleWhatsAppIntent(owner,intent).clientMutationId).toBe(intent.clientMutationId);
 });
});
it("keeps separate concurrent participant snapshots even after asynchronous waits",async()=>{
 const contexts=[selected,{...selected,companyId:otherCompany},{...selected,mode:"personal" as const}];let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 const operations=contexts.map(context=>runWithCompanyContext(async()=>{setCompanyContext(context);const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body);await wait;return replayGoogleWhatsAppIntent(owner,intent).workspace;}));
 release();expect(await Promise.all(operations)).toEqual(contexts.map(context=>({userId:owner,mode:context.mode,companyId:context.mode==="personal"?null:context.companyId})));
});
it("requires an explicit revision snapshot for controls and rejects ownership/provider fields from text/model payloads",async()=>{
 await within(async()=>{
  expect(()=>prepareGoogleWhatsAppIntent(owner,"cancel_appointment",{}, {appointmentId:event})).toThrow("GOOGLE_WHATSAPP_INPUT_INVALID");
  expect(()=>prepareGoogleWhatsAppIntent(owner,"create_appointment",body,{clientMutationId:null as never})).toThrow("GOOGLE_WHATSAPP_INPUT_INVALID");
  expect(prepareGoogleWhatsAppIntent(owner,"cancel_appointment",{}, {appointmentId:event,expectedGoogleSyncVersion:null}).expectedGoogleSyncVersion).toBeNull();
  for(const field of ["userId","mode","companyId","workspaceKey","calendarEventId","googleCalendarId","clientMutationId"])expect(()=>prepareGoogleWhatsAppIntent(owner,"create_appointment",{...body,[field]:"forged"})).toThrow("GOOGLE_WHATSAPP_INPUT_INVALID");
 });
});
it.each(["v1:01:0:0","v1:9223372036854775808:0:0",1,{},undefined])("rejects malformed or missing control revisions %#",async version=>{
 await within(async()=>{expect(()=>prepareGoogleWhatsAppIntent(owner,"update_appointment",{title:"Fixture"},{appointmentId:event,expectedGoogleSyncVersion:version as string})).toThrow("GOOGLE_WHATSAPP_INPUT_INVALID");});
});
it("strictly validates persisted intents and never repairs an unknown operation, altered ID or forged provenance",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body,{clientMutationId:mutation});
  for(const patch of [{operation:"from_model"},{clientMutationId:"1"},{appointmentId:event},{expectedGoogleSyncVersion:"v1:1:0:0"},{privateGrant:"forged"},{workspace:{...intent.workspace,companyId:otherCompany}},{payload:{...body,calendarEventId:"forged"}}])expect(()=>replayGoogleWhatsAppIntent(owner,{...intent,...patch})).toThrow();
 });
});
it("bounds and deeply snapshots JSON while rejecting executable, non-JSON and cyclic payloads",async()=>{
 await within(async()=>{
  const input={...body,attendees:[{name:"Fixture person",email:"fixture@example.test"}]},intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",input);input.attendees[0].name="Other";
  expect(intent.payload.attendees).toEqual([{name:"Fixture person",email:"fixture@example.test"}]);expect(Object.isFrozen((intent.payload.attendees as object[])[0])).toBe(true);
  const cyclic:Record<string,unknown>={};cyclic.circular=cyclic;
  for(const description of [()=>null,new Date(),BigInt(1),cyclic,"é".repeat(17000)])expect(()=>prepareGoogleWhatsAppIntent(owner,"create_appointment",{...body,description})).toThrow("GOOGLE_WHATSAPP_INPUT_INVALID");
 });
});
