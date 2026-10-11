import {beforeEach,expect,it,vi} from "vitest";
import type {PendingSlotFill} from "./pending-actions";
import type {AIResult} from "./ai-processor";

const m=vi.hoisted(()=>({setPending:vi.fn(),clearPending:vi.fn(),store:vi.fn(),save:vi.fn(),finish:vi.fn(),checked:vi.fn()}));
vi.mock("./pending-actions",async original=>({...await original<typeof import("./pending-actions")>(),setPendingAction:m.setPending,clearPendingAction:m.clearPending}));
vi.mock("./grocery",async original=>({...await original<typeof import("./grocery")>(),findOrCreateStore:m.store,saveGroceryPurchase:m.save,finalizePurchaseFromChecked:m.finish,getCheckedShoppingItems:m.checked}));
import {beginSlotFill,runSlotFillTurn,type SlotCtx} from "./slot-filling";

const ctx={user:{locale:"pt-BR"},userId:"10000000-0000-4000-8000-000000000001",phone:"5511999900011",mode:"personal"} as SlotCtx;
const items=[{productName:"Arroz",category:"Mercearia" as const,price:8.75,quantity:2,unit:"un"}];
const purchase={id:"20000000-0000-4000-8000-000000000001",userId:ctx.userId,storeId:"30000000-0000-4000-8000-000000000001",storeName:"Mercado de teste",date:"2026-10-11",items,total:17.5,financeId:"40000000-0000-4000-8000-000000000001",createdAt:"2026-10-11T12:00:00Z"};
let persisted:PendingSlotFill|undefined;
beforeEach(()=>{
  vi.resetAllMocks();persisted=undefined;
  m.setPending.mockImplementation(async(phone,action)=>{persisted=structuredClone({...action,phone,expiresAt:"2026-10-11T13:00:00Z"});});
  m.clearPending.mockImplementation(async()=>{persisted=undefined;});
  m.store.mockResolvedValue({id:purchase.storeId,userId:ctx.userId,name:purchase.storeName,location:""});
  // The external save has committed; only the response/read fails the first time.
  m.save.mockRejectedValueOnce(Error("POST_COMMIT_READ_FAILED")).mockResolvedValue(purchase);
  m.finish.mockRejectedValueOnce(Error("POST_COMMIT_READ_FAILED")).mockResolvedValue({purchase,financeId:purchase.financeId});
  m.checked.mockResolvedValue([{id:"checked-a",userId:ctx.userId,name:"Arroz",category:"Mercearia",quantity:"2 un",checked:true}]);
});
function readyPending(){
  expect(persisted).toMatchObject({type:"slot_fill",userId:ctx.userId,mode:ctx.mode,missing:[]});
  expect(persisted?.draft.operationKey).toEqual(expect.any(String));
  expect(String(persisted?.draft.operationKey).length).toBeGreaterThan(0);
  return structuredClone(persisted!);
}

it("persists a complete grocery draft before saving and reuses its operation after a post-commit read failure",async()=>{
  const ai={intent:"grocery_purchase",confidence:1,grocery:{storeName:purchase.storeName,date:purchase.date,items}} as AIResult;
  await expect(beginSlotFill("grocery_purchase",ai,ctx,"comprei arroz no mercado")).rejects.toThrow("POST_COMMIT_READ_FAILED");
  const retry=readyPending();
  expect(m.setPending.mock.invocationCallOrder[0]).toBeLessThan(m.save.mock.invocationCallOrder[0]);
  expect(m.clearPending).not.toHaveBeenCalled();
  const operation=m.save.mock.calls[0][3];expect(operation.key).toContain(retry.draft.operationKey);
  const result=await runSlotFillTurn(retry,"tentar novamente",ctx);
  expect(result.fallThrough).toBe(false);expect(result.reply).toContain(purchase.storeName);
  expect(m.save).toHaveBeenCalledTimes(2);expect(m.save.mock.calls[1][3]).toEqual(operation);
  expect(m.clearPending).toHaveBeenCalledTimes(1);expect(persisted).toBeUndefined();
  expect(m.clearPending.mock.invocationCallOrder[0]).toBeGreaterThan(m.save.mock.invocationCallOrder[1]);
});

it("keeps the completed store-name answer and the original operation key when continuation fails after committing",async()=>{
  const ai={intent:"grocery_purchase",confidence:1,grocery:{date:purchase.date,items}} as AIResult;
  await beginSlotFill("grocery_purchase",ai,ctx,"comprei arroz");
  expect(persisted?.missing).toEqual(["storeName"]);expect(m.save).not.toHaveBeenCalled();
  const originalKey=persisted!.draft.operationKey;
  await expect(runSlotFillTurn(structuredClone(persisted!),purchase.storeName,ctx)).rejects.toThrow("POST_COMMIT_READ_FAILED");
  const retry=readyPending();expect(retry.draft.operationKey).toBe(originalKey);expect(retry.draft.storeName).toBe(purchase.storeName);
  expect(m.clearPending).not.toHaveBeenCalled();
  const operation=m.save.mock.calls[0][3];
  await runSlotFillTurn(retry,"tentar novamente",ctx);
  expect(m.save.mock.calls[1][3]).toEqual(operation);expect(m.save.mock.calls[1][0].storeName).toBe(purchase.storeName);
  expect(m.clearPending).toHaveBeenCalledTimes(1);expect(persisted).toBeUndefined();
});

it("captures checked IDs once and passes the same operation as the ninth finish argument on retry",async()=>{
  const ai={intent:"grocery_purchase_finish",confidence:1,grocery:{storeName:purchase.storeName,total:17.5}} as AIResult;
  await expect(beginSlotFill("grocery_purchase_finish",ai,ctx,"finalizei a compra por 17,50")).rejects.toThrow("POST_COMMIT_READ_FAILED");
  const retry=readyPending();expect(retry.draft.checkedIds).toEqual(["checked-a"]);
  expect(m.checked).toHaveBeenCalledExactlyOnceWith(ctx.userId);
  expect(m.setPending.mock.invocationCallOrder[0]).toBeLessThan(m.finish.mock.invocationCallOrder[0]);
  expect(m.clearPending).not.toHaveBeenCalled();
  const args=m.finish.mock.calls[0];expect(args).toHaveLength(9);
  expect(args.slice(0,5)).toEqual([ctx.userId,ctx.mode,purchase.storeName,17.5,ctx.phone]);
  expect(args[5]).toBeUndefined();expect(args[6]).toBeUndefined();expect([undefined,"whatsapp_quick"]).toContain(args[7]);
  expect(args[8]).toEqual({key:expect.stringContaining(String(retry.draft.operationKey)),checkedIds:["checked-a"]});
  m.checked.mockResolvedValue([{id:"checked-after-first-attempt",checked:true}]);
  const result=await runSlotFillTurn(retry,"tentar novamente",ctx);
  expect(result.fallThrough).toBe(false);expect(result.reply).toContain(purchase.storeName);
  expect(m.checked).toHaveBeenCalledTimes(1);expect(m.finish).toHaveBeenCalledTimes(2);
  expect(m.finish.mock.calls[1][8]).toEqual(args[8]);expect(m.clearPending).toHaveBeenCalledTimes(1);expect(persisted).toBeUndefined();
});
