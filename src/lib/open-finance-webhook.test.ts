import { createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { verifyBankWebhook, parseBankWebhook } from "./open-finance-webhook";
const id="550e8400-e29b-41d4-a716-446655440000";
it("verifies exact bytes before parsing, including whitespace, and refuses absent signatures",()=>{
  const raw=Buffer.from(`{ "event":"consents", "resource":"consents", "resource_id":"${id}" }`);
  const signature="sha256="+createHmac("sha256","secret").update(raw).digest("hex");
  expect(verifyBankWebhook(raw,signature,"secret")).toBe(true);
  expect(verifyBankWebhook(Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),signature,"secret")).toBe(false);
  expect(verifyBankWebhook(raw,null,"secret")).toBe(false);
  expect(verifyBankWebhook(raw,"sha256=abc","secret")).toBe(false);
});
it("accepts only documented event/resource pairs and opaque investment IDs",()=>{
  expect(parseBankWebhook({event:"funds.transactions",resource:"funds",resource_id:"92792126019929200000000000000000000000000"})).toMatchObject({kind:"transactions",family:"funds"});
  expect(()=>parseBankWebhook({event:"bills",resource:"consents",resource_id:id})).toThrow();
  expect(()=>parseBankWebhook({event:"accounts",resource:"consents",resource_id:"../accounts"})).toThrow();
  expect(()=>parseBankWebhook({event:"unknown",resource:"consents",resource_id:id})).toThrow();
});
it("parses the documented query string without accepting URLs, extra fields or inverted windows",()=>{
  expect(parseBankWebhook({event:"accounts",resource:"consents",resource_id:id,query_parameters:"fromCreatedAt=2026-07-17T13:00:00.000000&toCreatedAt=2026-07-17T13:00:05.000000"}).window).toEqual({fromCreatedAt:"2026-07-17T13:00:00.000000",toCreatedAt:"2026-07-17T13:00:05.000000"});
  for(const query of ["cursor=secret","fromUpdatedAt=2026-10-10T00:00:00Z&toUpdatedAt=2026-10-09T00:00:00Z","fromCreatedAt=2026-02-30T00:00:00Z","fromCreatedAt=2026-10-09T00:00:00Z&fromCreatedAt=2026-10-09T01:00:00Z"])expect(()=>parseBankWebhook({event:"accounts",resource:"consents",resource_id:id,query_parameters:query})).toThrow();
});
it("rejects invalid hours and dates outside the supported history before requesting a bank page",()=>{
  for(const value of ["1899-12-31T00:00:00Z","2026-10-09T24:00:00Z","2026-10-09T23:60:00Z","2026-10-09T23:59:60Z"]) {
    expect(()=>parseBankWebhook({event:"accounts",resource:"consents",resource_id:id,query_parameters:new URLSearchParams({fromCreatedAt:value}).toString()})).toThrow();
  }
});
