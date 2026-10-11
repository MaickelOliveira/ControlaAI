import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),ready:vi.fn(),recreate:vi.fn(),enqueue:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:m.scope,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/open-finance-ready",()=>({isBankConnectReady:m.ready}));
vi.mock("@/lib/open-finance-consent",()=>({recreateProductionConsent:m.recreate}));
vi.mock("@/lib/open-finance-sync",()=>({enqueueConsentCheck:m.enqueue}));
vi.mock("@/lib/rate-limit",()=>({checkRateLimit:m.rate}));
import {POST} from "./route";
const id="550e8400-e29b-41d4-a716-446655440000",scope={userId:id,mode:"business",environment:"production"};
const request=(body:unknown={acceptedTerms:true,journeyVersion:"celcoin-2026-10"})=>POST(new Request(`https://zelo.test/api/open-finance/connections/${id}/recreate`,{method:"POST",body:JSON.stringify(body)}),{params:Promise.resolve({id})});
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue(scope);m.ready.mockResolvedValue(true);m.rate.mockResolvedValue(true);m.recreate.mockResolvedValue({id,status:"pending",authUrl:"https://bank.example.test/authorize"});});
it("requires same-origin authenticated scope, fresh terms and rate limit before renewing",async()=>{
  m.scope.mockResolvedValueOnce(new Response(null,{status:403}));expect((await request()).status).toBe(403);
  expect((await request({acceptedTerms:false})).status).toBe(400);
  m.rate.mockResolvedValueOnce(false);expect((await request()).status).toBe(429);expect(m.recreate).not.toHaveBeenCalled();
});
it("renews only within the authenticated scope and queues automatic authorization checks",async()=>{
  const result=await request();expect(result.status).toBe(200);expect(m.scope).toHaveBeenCalledWith(expect.any(Request),true);
  expect(m.recreate).toHaveBeenCalledWith(scope,id);expect(m.enqueue).toHaveBeenCalledWith(scope,id);
});
it("does not expose private errors or report a new link if durable enqueue fails",async()=>{
  m.enqueue.mockRejectedValue(Error("private payload"));const response=await request();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private payload");
});
