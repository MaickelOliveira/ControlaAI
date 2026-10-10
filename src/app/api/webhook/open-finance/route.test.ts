import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({owner:vi.fn(),rpc:vi.fn(),access:vi.fn()}));
vi.mock("@/lib/open-finance-owner",()=>({getOpenFinanceOwner:m.owner}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRpc:m.rpc,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/open-finance-access",()=>({getOpenFinanceAccess:m.access}));
import { POST } from "./route";
const id="550e8400-e29b-41d4-a716-446655440000";
const raw=JSON.stringify({event:"accounts",resource:"consents",resource_id:id});
function request(signed=true,body=raw){return new Request("https://zelo.example/api/webhook/open-finance",{method:"POST",body,headers:{...(signed?{"X-Webhook-Signature":"sha256="+createHmac("sha256","test-secret").update(body).digest("hex")}:{}),"Content-Type":"application/json"}});}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","true");vi.stubEnv("POLP_WEBHOOK_SIGNING_SECRET","test-secret");m.owner.mockResolvedValue({id,email:"owner@example.test"});m.access.mockResolvedValue({userId:id,mode:"personal",environment:"production"});m.rpc.mockResolvedValueOnce({id,mode:"personal",status:"active"}).mockResolvedValue(id);});
afterEach(()=>vi.unstubAllEnvs());
it("rejects unsigned input before parsing or accessing any owner data",async()=>{
  expect((await POST(request(false,"not json"))).status).toBe(401);
  expect(m.owner).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it("acknowledges only durably saved metadata with server-derived owner and mode",async()=>{
  expect((await POST(request())).status).toBe(202);
  expect(m.rpc.mock.lastCall?.[1]).toBe("zelo_of_enqueue");
  expect(m.rpc.mock.lastCall?.[0]).toMatchObject({userId:id,mode:"personal"});
  expect(m.rpc.mock.lastCall?.[2]?.p_job).toMatchObject({family:"accounts",kind:"catalog",external_resource_id:id});
});
it("asks the provider to retry if storage fails or the resource is not yet known",async()=>{
  m.rpc.mockReset();m.rpc.mockRejectedValueOnce(new Error("OF_STORAGE_ERROR"));
  expect((await POST(request())).status).toBe(503);
  m.rpc.mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(503);
});
it("does not enqueue late data for a revoked consent",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({id,mode:"personal",status:"revoked"});
  expect((await POST(request())).status).toBe(202);expect(m.rpc).toHaveBeenCalledTimes(1);
});
