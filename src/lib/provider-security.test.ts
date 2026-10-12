import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const config=vi.hoisted(()=>({provider:"waba",waba:{phoneNumberId:"12345",accessToken:"fake-private-token"}}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/whatsapp-config",()=>({getConfig:vi.fn(async()=>config)}));
import { downloadMedia, sendText, sendTemplate } from "./waba";
import { openAIText } from "./openai-provider";

describe("provider privacy and media boundaries",()=>{
 beforeEach(()=>{vi.spyOn(console,"error").mockImplementation(()=>{});vi.stubEnv("OPENAI_API_KEY","fake-private-key");});
 afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
 it("does not log upstream text or request objects with credentials",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({error:{message:"upstream fake-private-token"}}),{status:401})));
  expect(await sendText("5511999990000","hello")).toBe(false);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("fake-private-token");
  vi.stubGlobal("fetch",vi.fn(async()=>{throw Object.assign(new Error("fake-private-token"),{config:{headers:{Authorization:"fake-private-token"}}});}));
  expect(await sendText("5511999990000","hello")).toBe(false);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("fake-private-token");
 });
 it("does not pass provider errors containing credentials back to callers",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({error:{message:"upstream fake-private-token"}}),{status:401})));
  const result=await sendTemplate("5511999990000","test","pt_BR",{});
  expect(JSON.stringify(result)).not.toContain("fake-private-token");
  await expect(openAIText({prompt:"hello"})).rejects.toThrow(/^OpenAI respondeu HTTP 401$/);
 });
 it("does not send the bearer token to a URL outside Meta media hosts",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({url:"https://example.test/steal-token"})));
  vi.stubGlobal("fetch",fetcher);
  expect(await downloadMedia("12345")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each(["http://lookaside.fbsbx.com/media","https://lookaside.fbsbx.com.evil.test/media","https://u:p@lookaside.fbsbx.com/media","https://lookaside.fbsbx.com:8080/media"])("rejects unsafe media destination %s",async url=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({url})));
  vi.stubGlobal("fetch",fetcher);expect(await downloadMedia("12345")).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("rejects invalid provider media IDs before network access",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect(await downloadMedia("../123?access_token=anything")).toBeNull();expect(fetcher).not.toHaveBeenCalled();
 });
 it("reads valid media within the cap and disables redirects on authenticated requests",async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({url:"https://lookaside.fbsbx.com/whatsapp_business/attachments",mime_type:"image/jpeg"}))).mockResolvedValueOnce(new Response(new Uint8Array([1,2,3])));
  vi.stubGlobal("fetch",fetcher);const result=await downloadMedia("12345");expect(result?.buffer).toEqual(Buffer.from([1,2,3]));
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:"error"});expect(fetcher.mock.calls[1][1]).toMatchObject({redirect:"error"});
 });
 it("rejects excessive declared media length without reading it",async()=>{
  const oversized=new Response("unused",{headers:{"content-length":String(21*1024*1024)}});
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({url:"https://lookaside.fbsbx.com/media"}))).mockResolvedValueOnce(oversized);
  vi.stubGlobal("fetch",fetcher);expect(await downloadMedia("12345")).toBeNull();expect(oversized.bodyUsed).toBe(false);
 });
});
