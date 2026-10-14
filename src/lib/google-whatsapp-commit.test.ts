import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({save:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./pending-actions",()=>({setPendingAction:deps.save}));
import {runWithCompanyContext,setCompanyContext} from "./company-context";
import {prepareGoogleWhatsAppIntent,type GoogleWhatsAppIntent} from "./google-whatsapp-intent";
import {commitGoogleWhatsAppIntents} from "./google-whatsapp-commit";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",event="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",otherEvent="cccccccc-cccc-4ccc-8ccc-ccccccccccc2",mutation="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const context={userId:owner,companyId:company,mode:"business" as const},phone="5511999999999",body={title:"Fixture",startAt:"2026-10-14T15:00:00Z"};
const within=(next:()=>Promise<unknown>)=>runWithCompanyContext(async()=>{setCompanyContext(context);return next();});
let persisted:Record<string,unknown>|undefined;
beforeEach(()=>{vi.clearAllMocks();persisted=undefined;deps.save.mockImplementation(async(_phone,action)=>{persisted=JSON.parse(JSON.stringify(action));});});
it("persists immutable intents before effects and acknowledges only public record IDs afterward",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body,{clientMutationId:mutation});
  const execute=vi.fn(async(scope,selected)=>{expect(scope).toEqual(intent.workspace);expect(selected).toEqual(intent);expect(persisted).toMatchObject({type:"google_agenda_commit",userId:owner,intents:[intent],receipts:[]});return {id:event,title:"Fixture",privateGrant:"fictitious-private"};});
  const read=vi.fn();const result=await commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read});
  expect(result).toMatchObject([{intent,result:{id:event},replayed:false}]);expect(persisted).toMatchObject({receipts:[{clientMutationId:mutation,recordId:event}]});expect(JSON.stringify(persisted)).not.toContain("fictitious-private");expect(read).not.toHaveBeenCalled();expect(execute).toHaveBeenCalledTimes(1);
 });
});
it("retains exact intent/revision after an ambiguous service error for the next retry",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"update_appointment",{title:"Changed"},{appointmentId:event,expectedGoogleSyncVersion:"v1:9007199254740993:0:0",clientMutationId:mutation}),execute=vi.fn();
  execute.mockRejectedValueOnce(Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE")).mockResolvedValue({id:event});const read=vi.fn();
  await expect(commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read})).rejects.toThrow("GOOGLE_EVENT_STORAGE_UNAVAILABLE");
  expect(persisted).toMatchObject({intents:[intent],receipts:[]});const restored=persisted!.intents as GoogleWhatsAppIntent[];
  await commitGoogleWhatsAppIntents(owner,phone,restored,{execute,read});expect(execute.mock.calls[0]).toEqual(execute.mock.calls[1]);expect(execute.mock.calls[1][1].expectedGoogleSyncVersion).toBe("v1:9007199254740993:0:0");
 });
});
it("never executes when initial persistence fails",async()=>{
 await within(async()=>{deps.save.mockRejectedValueOnce(Error("fixture storage unavailable"));const execute=vi.fn(),read=vi.fn(),intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body);
  await expect(commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read})).rejects.toThrow();expect(execute).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();});
});
it("preserves the same UUID if acknowledgement storage fails after a confirmed effect",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body,{clientMutationId:mutation}),execute=vi.fn(async()=>({id:event})),read=vi.fn();
  deps.save.mockImplementationOnce(async(_phone,action)=>{persisted=JSON.parse(JSON.stringify(action));}).mockRejectedValueOnce(Error("fixture ack unavailable"));
  await expect(commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read})).rejects.toThrow();expect(persisted).toMatchObject({receipts:[]});
  await commitGoogleWhatsAppIntents(owner,phone,persisted!.intents as GoogleWhatsAppIntent[],{execute,read});expect(execute.mock.calls[0]).toEqual(execute.mock.calls[1]);
 });
});
it("resumes a partially acknowledged batch with a read for saved items and unchanged UUIDs for remaining items",async()=>{
 await within(async()=>{
  const intents=[prepareGoogleWhatsAppIntent(owner,"create_appointment",body),prepareGoogleWhatsAppIntent(owner,"create_appointment",{...body,title:"Second"})],execute=vi.fn();
  execute.mockResolvedValueOnce({id:event}).mockRejectedValueOnce(Error("GOOGLE_EVENT_FAILED"));const read=vi.fn(async()=>({id:event,title:"Updated confirmed view"}));
  await expect(commitGoogleWhatsAppIntents(owner,phone,intents,{execute,read})).rejects.toThrow();expect(persisted).toMatchObject({receipts:[{clientMutationId:intents[0].clientMutationId,recordId:event}]});
  const restored=persisted!;execute.mockResolvedValueOnce({id:otherEvent});const results=await commitGoogleWhatsAppIntents(owner,phone,restored.intents as GoogleWhatsAppIntent[],{execute,read},restored.receipts as never);
  expect(results.map(row=>row.replayed)).toEqual([true,false]);expect(execute).toHaveBeenCalledTimes(3);expect(execute.mock.calls[1]).toEqual(execute.mock.calls[2]);expect(read).toHaveBeenCalledExactlyOnceWith(intents[0].workspace,intents[0],event);
 });
});
it("checks current confirmed scope again after persistence before starting an effect",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body);deps.save.mockImplementationOnce(async()=>{setCompanyContext({...context,mode:"personal"});});const execute=vi.fn(),read=vi.fn();
  await expect(commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read})).rejects.toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");expect(execute).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 });
});
it("rechecks every item so an asynchronous mode/company change cannot replay a remaining batch into another space",async()=>{
 await within(async()=>{
  const intents=[prepareGoogleWhatsAppIntent(owner,"create_appointment",body),prepareGoogleWhatsAppIntent(owner,"create_appointment",{...body,title:"Second"})];const execute=vi.fn(async()=>{setCompanyContext({...context,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"});return {id:event};}),read=vi.fn();
  await expect(commitGoogleWhatsAppIntents(owner,phone,intents,{execute,read})).rejects.toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");expect(execute).toHaveBeenCalledTimes(1);expect(read).not.toHaveBeenCalled();
 });
});
it("rejects duplicate mutation identities and forged receipt targets before persistence or effect",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"cancel_appointment",{}, {appointmentId:event,expectedGoogleSyncVersion:null,clientMutationId:mutation}),execute=vi.fn(),read=vi.fn();
  for(const [intents,receipts] of [[[intent,intent],[]],[[intent],[{clientMutationId:mutation,recordId:otherEvent}]],[[intent],[{clientMutationId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2",recordId:event}]],[[intent],[{clientMutationId:mutation,recordId:event,privateScope:"forged"}]]] as const)
   await expect(commitGoogleWhatsAppIntents(owner,phone,intents,{execute,read},receipts as never)).rejects.toThrow("GOOGLE_WHATSAPP_INPUT_INVALID");
  expect(execute).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(deps.save).not.toHaveBeenCalled();
 });
});
it("never treats a malformed or different control result as acknowledgement",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"cancel_appointment",{}, {appointmentId:event,expectedGoogleSyncVersion:null});for(const result of [{id:"not-a-uuid"},{id:otherEvent},null]){
   const execute=vi.fn(async()=>result),read=vi.fn();await expect(commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read} as never)).rejects.toThrow("GOOGLE_WHATSAPP_RESULT_INVALID");expect(persisted).toMatchObject({receipts:[]});
  }
 });
});
it("acknowledged items stay confirmed if a later authorized lookup returns no visible row; no creation is retried",async()=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body),execute=vi.fn(),read=vi.fn(async()=>null),receipt={clientMutationId:intent.clientMutationId,recordId:event};
  expect(await commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read},[receipt])).toMatchObject([{replayed:true,result:null}]);expect(execute).not.toHaveBeenCalled();
 });
});
it.each(["mode","company"])("rejects a scope change while the single acknowledged item is read: %s",async field=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body,{clientMutationId:mutation}),execute=vi.fn(),read=vi.fn(async()=>{setCompanyContext(field==="mode"?{...context,mode:"personal"}:{...context,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"});return {id:event};});
  const receipt={clientMutationId:mutation,recordId:event};await expect(commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read},[receipt])).rejects.toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");
  expect(execute).not.toHaveBeenCalled();expect(persisted).toMatchObject({intents:[intent],receipts:[receipt]});
 });
});
it.each(["mode","company"])("rejects a scope change during the final receipt save without discarding its identity: %s",async field=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body,{clientMutationId:mutation}),execute=vi.fn(async()=>({id:event})),read=vi.fn();
  deps.save.mockImplementation(async(_phone,action)=>{persisted=JSON.parse(JSON.stringify(action));if(deps.save.mock.calls.length===2)setCompanyContext(field==="mode"?{...context,mode:"personal"}:{...context,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"});});
  await expect(commitGoogleWhatsAppIntents(owner,phone,[intent],{execute,read})).rejects.toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");
  expect(execute).toHaveBeenCalledTimes(1);expect(persisted).toMatchObject({intents:[intent],receipts:[{clientMutationId:mutation,recordId:event}]});
 });
});
