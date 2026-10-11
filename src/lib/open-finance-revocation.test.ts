import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({request:vi.fn()}));
vi.mock("./polp-production",async original=>({...await original<typeof import("./polp-production")>(),polpProductionRequest:m.request}));
import {revokeProductionConsent} from "./open-finance-revocation";
const id="550e8400-e29b-41d4-a716-446655440000",user="650e8400-e29b-41d4-a716-446655440000";
beforeEach(()=>vi.resetAllMocks());
it("accepts only the documented provider cancellation confirmation",async()=>{
  m.request.mockResolvedValueOnce({message:"Consentimento revogado."});
  expect(await revokeProductionConsent(id,user)).toBe("REVOKED");expect(m.request).toHaveBeenCalledTimes(1);
  m.request.mockResolvedValueOnce({message:"Processando"}).mockResolvedValueOnce({data:{id,cliente_user_id:user,status:"AUTHORISED"}});
  await expect(revokeProductionConsent(id,user)).rejects.toThrow("OF_CANCELLATION_UNCONFIRMED");
});
it.each(["REJECTED","EXPIRED"])("can confirm a previously cancelled or failed consent from its own terminal provider status %s",async status=>{
  m.request.mockRejectedValueOnce(Error("POLP_HTTP_422")).mockResolvedValueOnce({data:{id,cliente_user_id:user,status}});
  expect(await revokeProductionConsent(id,user)).toBe(status);
  expect(m.request.mock.calls).toEqual([[`/consents/${id}`,"DELETE"],[`/consents/${id}`]]);
});
it("keeps an uncertain cancellation retryable and never treats missing or pending consents as confirmed",async()=>{
  for(const status of ["AUTHORISED","AWAITING_AUTHORIZATION",null]){
    m.request.mockRejectedValueOnce(Error("POLP_UNAVAILABLE")).mockResolvedValueOnce({data:{id,cliente_user_id:user,status}});
    await expect(revokeProductionConsent(id,user)).rejects.toThrow("POLP_UNAVAILABLE");
  }
  m.request.mockRejectedValueOnce(Error("POLP_HTTP_404")).mockRejectedValueOnce(Error("POLP_HTTP_404"));
  await expect(revokeProductionConsent(id,user)).rejects.toThrow("POLP_HTTP_404");
});
it("rejects unrelated provider identities and validates identifiers before external requests",async()=>{
  m.request.mockRejectedValueOnce(Error("POLP_HTTP_422")).mockResolvedValueOnce({data:{id,cliente_user_id:id,status:"REJECTED"}});
  await expect(revokeProductionConsent(id,user)).rejects.toThrow("POLP_HTTP_422");
  m.request.mockClear();await expect(revokeProductionConsent("../foreign",user)).rejects.toThrow("INVALID_ID");expect(m.request).not.toHaveBeenCalled();
});
