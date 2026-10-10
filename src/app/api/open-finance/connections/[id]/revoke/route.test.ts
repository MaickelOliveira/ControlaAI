import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m=vi.hoisted(()=>({scope:vi.fn(),rpc:vi.fn(),request:vi.fn()}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:m.scope,openFinanceRpc:m.rpc,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/polp-production",async original=>({...await original<typeof import("@/lib/polp-production")>(),polpProductionRequest:m.request}));
import { POST } from "./route";
const id="550e8400-e29b-41d4-a716-446655440000";
function revoke(){return POST(new Request("https://zelo.example/api/open-finance/connections/"+id+"/revoke",{method:"POST"}),{params:Promise.resolve({id})});}
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue({userId:id,mode:"personal",environment:"production"});m.rpc.mockResolvedValue({status:"active",external_consent_id:id});m.request.mockResolvedValue({message:"Consentimento revogado."});});
it("blocks local imports before calling the bank and keeps them stopped on failure",async()=>{
  m.request.mockRejectedValueOnce(new Error("POLP_UNAVAILABLE"));
  expect((await revoke()).status).toBe(503);
  expect(m.rpc.mock.calls.map(c=>[c[1],c[2]?.p_status])).toEqual([["zelo_of_connection",undefined],["zelo_of_set_status","revoking"]]);
  expect(m.rpc.mock.invocationCallOrder[1]).toBeLessThan(m.request.mock.invocationCallOrder[0]);
});
it("retries an interrupted cancellation and finalizes only after provider confirmation",async()=>{
  m.rpc.mockResolvedValueOnce({status:"revoking",external_consent_id:id});
  expect((await revoke()).status).toBe(200);
  expect(m.rpc.mock.lastCall?.[2]).toMatchObject({p_status:"revoked"});
  expect(m.request).toHaveBeenCalledWith(`/consents/${id}`,"DELETE");
});
it("does not revoke a foreign connection or repeat a confirmed cancellation",async()=>{
  m.rpc.mockRejectedValueOnce(new Error("OF_CONNECTION_NOT_FOUND"));
  expect((await revoke()).status).toBe(503);
  m.rpc.mockResolvedValueOnce({status:"revoked"});
  expect((await revoke()).status).toBe(200);
  expect(m.request).not.toHaveBeenCalled();
});
