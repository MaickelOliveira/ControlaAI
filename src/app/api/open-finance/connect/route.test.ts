import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ scope: vi.fn(), rpc: vi.fn(), banks: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/open-finance-http", () => ({ openFinanceRequestScope: m.scope, openFinanceRpc: m.rpc, OF_HEADERS: { "Cache-Control": "private, no-store" } }));
vi.mock("@/lib/open-finance-institutions", () => ({ getBankInstitutions: m.banks }));
vi.mock("@/lib/open-finance-ready", () => ({ isBankConnectReady:vi.fn(async()=>true) }));
vi.mock("@/lib/open-finance-sync", () => ({ enqueueConsentCheck:vi.fn(async()=>{}) }));
vi.mock("@/lib/polp-production", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/polp-production")>(), createProductionConsent: m.create }));
import { POST } from "./route";
const id = "550e8400-e29b-41d4-a716-446655440000";
function request(body: unknown) { return new Request("https://zelo.example/api/open-finance/connect", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }); }
beforeEach(() => {
  vi.stubEnv("OPEN_FINANCE_CONNECT_ENABLED", "true");
  vi.stubEnv("OPEN_FINANCE_AUTH_HOSTS", "authorize.example");
  m.scope.mockResolvedValue({ userId: id, mode: "personal", environment: "production" });
  m.banks.mockResolvedValue([{ id, name: "Bank", status: "OPERATIONAL", type: "PERSONAL" }]);
  m.create.mockResolvedValue({ id, status: "AWAITING_AUTHORIZATION", products: ["ACCOUNT"], url_to_authenticate: "https://authorize.example/oauth" });
  m.rpc.mockResolvedValue({ id, status: "pending" });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("real bank connection", () => {
  it("requires completed terms and never sends documents for an ineligible institution", async () => {
    expect((await POST(request({ institutionId: id, cpf: "52998224725" }))).status).toBe(400);
    m.banks.mockResolvedValue([{ id, status: "MAJOR_OUTAGE", type: "PERSONAL" }]);
    expect((await POST(request({ institutionId: id, cpf: "52998224725", acceptedTerms: true, journeyVersion: "celcoin-2026-10" }))).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("uses authenticated ownership, stores no documents, and returns only the authorization link", async () => {
    const response = await POST(request({ institutionId: id, cpf: "52998224725", userId: "attacker", acceptedTerms: true, journeyVersion: "celcoin-2026-10" }));
    expect(response.status).toBe(201);
    expect(m.create).toHaveBeenCalledWith(id, id, { cpf: "52998224725" });
    expect(JSON.stringify(m.rpc.mock.calls)).not.toContain("52998224725");
    const result = await response.json();
    expect(result).toEqual({ id, authorizationUrl: "https://authorize.example/oauth" });
  });
});

it("holds an unverified private authorization link without disclosing its path or token",async()=>{
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","true");
  vi.stubEnv("OPEN_FINANCE_AUTH_HOSTS","");
  m.create.mockResolvedValue({id,status:"AWAITING_AUTHORIZATION",products:["ACCOUNT"],url_to_authenticate:"https://new-authorization.example/private-path?token=private-token"});
  const response=await POST(request({institutionId:id,cpf:"52998224725",acceptedTerms:true,journeyVersion:"celcoin-2026-10"}));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({id,authorizationUrl:null,authorizationPending:true,authorizationHost:"new-authorization.example"});
});
it("holds a new private bank host even when another host is already approved",async()=>{
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","true");
  m.create.mockResolvedValue({id,status:"AWAITING_AUTHORIZATION",products:["ACCOUNT"],url_to_authenticate:"https://unexpected.example/private?token=secret"});
  const response=await POST(request({institutionId:id,cpf:"52998224725",acceptedTerms:true,journeyVersion:"celcoin-2026-10"}));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({id,authorizationUrl:null,authorizationPending:true,authorizationHost:"unexpected.example"});
});
it("refuses an unapproved host outside the private preview without exposing its token",async()=>{
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","false");
  m.create.mockResolvedValue({id,status:"AWAITING_AUTHORIZATION",products:["ACCOUNT"],url_to_authenticate:"https://unexpected.example/private?token=secret"});
  const response=await POST(request({institutionId:id,cpf:"52998224725",acceptedTerms:true,journeyVersion:"celcoin-2026-10"}));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});

it("does not return an authorization link after cancellation wins during creation",async()=>{
  m.rpc.mockResolvedValueOnce({id,status:"pending"}).mockResolvedValueOnce({id,status:"revoking"});
  const response=await POST(request({institutionId:id,cpf:"52998224725",acceptedTerms:true,journeyVersion:"celcoin-2026-10"}));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({id,authorizationUrl:null});
});
it.each(["personal","business"] as const)("refuses an institution belonging only to the other platform in %s mode",async mode=>{
  m.scope.mockResolvedValue({userId:id,mode,environment:"production"});
  m.banks.mockResolvedValue([{id,status:"OPERATIONAL",type:mode==="personal"?"BUSINESS":"PERSONAL"}]);
  const r=await POST(request({institutionId:id,cpf:"52998224725",...(mode==="business"?{cnpj:"11222333000181"}:{}),acceptedTerms:true,journeyVersion:"celcoin-2026-10"}));
  expect(r.status).toBe(400);expect(m.create).not.toHaveBeenCalled();
});
it("requires the company documents for PJ and keeps them out of storage",async()=>{
  m.scope.mockResolvedValue({userId:id,mode:"business",environment:"production"});
  m.banks.mockResolvedValue([{id,status:"OPERATIONAL",type:"BUSINESS"}]);
  const input={institutionId:id,cpf:"52998224725",acceptedTerms:true,journeyVersion:"celcoin-2026-10"};
  expect((await POST(request(input))).status).toBe(400);expect(m.create).not.toHaveBeenCalled();
  expect((await POST(request({...input,cnpj:"11222333000181"}))).status).toBe(201);
  expect(m.create).toHaveBeenCalledWith(id,id,{cpf:"52998224725",cnpj:"11222333000181"});
  expect(JSON.stringify(m.rpc.mock.calls)).not.toContain("11222333000181");
});
