import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({rpc:vi.fn(),request:vi.fn()}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:m.rpc}));
vi.mock("./polp-production",async original=>({...await original<typeof import("./polp-production")>(),polpProductionRequest:m.request}));
import {disconnectBank,removeBankAttempt} from "./open-finance-connections";
const id="550e8400-e29b-41d4-a716-446655440000";
const scope={userId:id,mode:"personal",environment:"production"} as const;
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({status:"pending",external_consent_id:id});m.request.mockResolvedValue({message:"Consentimento revogado."});});
it("stops imports and confirms provider cancellation before removing a pending attempt",async()=>{
  await removeBankAttempt(scope,id);
  expect(m.rpc.mock.calls.map(c=>[c[1],c[2]?.p_status,c[2]?.p_archived])).toEqual([["zelo_of_begin_removal",undefined,undefined],["zelo_of_set_status","revoking",undefined],["zelo_of_set_status","revoked",undefined],["zelo_of_connection_visibility",undefined,true]]);
  expect(m.rpc.mock.invocationCallOrder[0]).toBeLessThan(m.request.mock.invocationCallOrder[0]);
  expect(m.request.mock.invocationCallOrder[0]).toBeLessThan(m.rpc.mock.invocationCallOrder[3]);
});
it("keeps an attempt visible when provider cancellation fails",async()=>{
  m.request.mockRejectedValueOnce(Error("POLP_UNAVAILABLE"));
  await expect(removeBankAttempt(scope,id)).rejects.toThrow("POLP_UNAVAILABLE");
  expect(m.rpc.mock.calls.some(c=>c[1]==="zelo_of_connection_visibility")).toBe(false);
});
it("never calls the provider when the database rejects a foreign, active or imported connection",async()=>{
  m.rpc.mockRejectedValueOnce(Error("OF_CONNECTION_ACTIVE"));
  await expect(removeBankAttempt(scope,id)).rejects.toThrow();expect(m.request).not.toHaveBeenCalled();
});
it("archives an already cancelled attempt without repeating the provider request",async()=>{
  m.rpc.mockResolvedValueOnce({status:"revoked",external_consent_id:id});
  await removeBankAttempt(scope,id);expect(m.request).not.toHaveBeenCalled();
  expect(m.rpc.mock.lastCall?.[2]).toEqual({p_id:id,p_archived:true});
});
it("disconnects an active bank while preserving its connection and financial history",async()=>{
  m.rpc.mockResolvedValueOnce({status:"active",external_consent_id:id});await disconnectBank(scope,id);
  expect(m.request).toHaveBeenCalledWith(`/consents/${id}`,"DELETE");
  expect(m.rpc.mock.calls.some(c=>c[1]==="zelo_of_connection_visibility")).toBe(false);
  expect(m.rpc.mock.lastCall?.[2]).toMatchObject({p_status:"revoked"});
});
