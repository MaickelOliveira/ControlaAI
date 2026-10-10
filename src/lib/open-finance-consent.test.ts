import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn(), request: vi.fn() }));
vi.mock("./open-finance-http", () => ({ openFinanceRpc: m.rpc }));
vi.mock("./polp-production", async original => ({ ...await original<typeof import("./polp-production")>(), polpProductionRequest: m.request }));
import { refreshProductionConsent } from "./open-finance-consent";
const id = "550e8400-e29b-41d4-a716-446655440000";
const scope = { userId: id, mode: "personal" as const, environment: "production" as const };
beforeEach(() => { vi.resetAllMocks(); m.rpc.mockResolvedValue({ status: "pending", external_consent_id: id, institution_id: id }); m.request.mockResolvedValue({ data: { id, institution_id: id, cliente_user_id: id, status: "AUTHORISED" } }); });
it("does not query a cancelled or foreign connection", async () => {
  m.rpc.mockRejectedValueOnce(new Error("OF_CONNECTION_NOT_FOUND"));
  await expect(refreshProductionConsent(scope,id)).rejects.toThrow();
  m.rpc.mockResolvedValueOnce({ status: "revoking" });
  await expect(refreshProductionConsent(scope,id)).rejects.toThrow("CONSENT_CANCELLED");
  expect(m.request).not.toHaveBeenCalled();
});
it("does not fall back to PF when a connection is absent in PJ storage",async()=>{
  const businessScope={...scope,mode:"business" as const};
  m.rpc.mockRejectedValueOnce(new Error("OF_CONNECTION_NOT_FOUND"));
  await expect(refreshProductionConsent(businessScope,id)).rejects.toThrow("OF_CONNECTION_NOT_FOUND");
  expect(m.rpc).toHaveBeenCalledWith(businessScope,"zelo_of_connection",{p_id:id});
  expect(m.request).not.toHaveBeenCalled();
});
it("rejects a different provider client before changing status", async () => {
  m.request.mockResolvedValue({ data: { id, institution_id: id, cliente_user_id: "other", status: "AUTHORISED" } });
  await expect(refreshProductionConsent(scope,id)).rejects.toThrow("CONSENT_IDENTITY_MISMATCH");
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("returns the current revoked status when cancellation races with refresh", async () => {
  m.rpc.mockResolvedValueOnce({ status: "pending", external_consent_id: id, institution_id: id }).mockResolvedValueOnce(null).mockResolvedValueOnce({status:"revoked"});
  expect(await refreshProductionConsent(scope,id)).toEqual({id,status:"revoked"});
  expect(m.rpc).toHaveBeenCalledWith(scope,"zelo_of_set_status",{p_id:id,p_status:"active",p_provider_status:"AUTHORISED"});
});

afterEach(()=>vi.unstubAllEnvs());
it.each(["true","false"])("recovers a validated pending link with private preview %s",async preview=>{
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY",preview);
  vi.stubEnv("OPEN_FINANCE_AUTH_HOSTS","authorize.example");
  m.request.mockResolvedValue({data:{id,institution_id:id,cliente_user_id:id,status:"AWAITING_AUTHORIZATION",url_to_authenticate:"https://authorize.example/oauth?state=opaque",url_to_authenticate_expires_at:new Date(Date.now()+60000).toISOString()}});
  expect(await refreshProductionConsent(scope,id)).toMatchObject({id,status:"pending",authorizationUrl:"https://authorize.example/oauth?state=opaque"});
  m.rpc.mockResolvedValueOnce({status:"pending",external_consent_id:id,institution_id:id}).mockResolvedValueOnce(null).mockResolvedValueOnce({status:"revoking"});
  expect(await refreshProductionConsent(scope,id)).toEqual({id,status:"revoking"});
});
it("never recovers an expired link or authorizes a malformed bootstrap URL",async()=>{
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","true");
  vi.stubEnv("OPEN_FINANCE_AUTH_HOSTS","");
  const consent={id,institution_id:id,cliente_user_id:id,status:"AWAITING_AUTHORIZATION",url_to_authenticate:"https://authorize.example/secret",url_to_authenticate_expires_at:new Date(Date.now()-60000).toISOString()};
  m.request.mockResolvedValue({data:consent});
  expect(await refreshProductionConsent(scope,id)).toMatchObject({authorizationUrl:null,authorizationExpired:true});
  for(const url of ["http://authorize.example/", "https://user:password@authorize.example/", "https://127.0.0.1/", "https://[::1]/", "https://authorize.example:444/", "javascript:alert(1)"]){
    m.request.mockResolvedValue({data:{...consent,url_to_authenticate:url,url_to_authenticate_expires_at:new Date(Date.now()+60000).toISOString()}});
    await expect(refreshProductionConsent(scope,id)).rejects.toThrow("INVALID_AUTH_URL");
  }
});
