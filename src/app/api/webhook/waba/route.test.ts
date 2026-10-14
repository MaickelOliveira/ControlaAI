import {NextRequest} from "next/server";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({begin:vi.fn(),finish:vi.fn(),enqueue:vi.fn(),pump:vi.fn(),wake:vi.fn(),signature:vi.fn(),config:vi.fn(),after:vi.fn()}));
vi.mock("next/server",async original=>({...await original<typeof import("next/server")>(),after:m.after}));
vi.mock("@/lib/whatsapp-activity",()=>({beginWhatsAppActivity:m.begin}));
vi.mock("@/lib/waba-inbox",()=>({enqueueWabaMessages:m.enqueue}));
vi.mock("@/lib/waba-worker",()=>({pumpWabaInbox:m.pump,wakeWabaInboxWorker:m.wake}));
vi.mock("@/lib/company-context",()=>({runWithTrustedCompanyJob:(callback:()=>Promise<unknown>)=>callback()}));
vi.mock("@/lib/waba",()=>({verifySignature:m.signature,verifyToken:vi.fn()}));
vi.mock("@/lib/whatsapp-config",()=>({getConfig:m.config}));
import {POST} from "./route";

const from="5511999990000";
const textMessage=(id="fixture-id")=>({id,from,type:"text",text:{body:"mensagem fictícia"}});
const request=(messages:unknown[])=>new NextRequest("https://zelo.test/api/webhook/waba",{
 method:"POST",headers:{"content-type":"application/json","x-hub-signature-256":`sha256=${"0".repeat(64)}`},
 body:JSON.stringify({entry:[{changes:[{value:{messages,contacts:[{profile:{name:"Pessoa fictícia"}}]}}]}]}),
});
const settled=async(assertion:()=>void)=>vi.waitFor(assertion,{timeout:150,interval:1});
beforeEach(()=>{
 for(const mock of Object.values(m))mock.mockReset();
 m.signature.mockResolvedValue(true);m.config.mockResolvedValue({waba:{appSecret:"fixture-secret"}});
 m.finish.mockResolvedValue(undefined);m.begin.mockResolvedValue({finish:m.finish});
 m.enqueue.mockResolvedValue(undefined);m.pump.mockResolvedValue(1);
 m.after.mockImplementation(callback=>{void callback();});
 vi.spyOn(console,"error").mockImplementation(()=>{});
});
afterEach(()=>vi.restoreAllMocks());

it("does not acknowledge a verified message until it has been saved for recovery",async()=>{
 let save!:()=>void;m.enqueue.mockImplementationOnce(()=>new Promise<void>(resolve=>{save=resolve;}));
 let acknowledged=false;
 const response=POST(request([textMessage()])).then(value=>{acknowledged=true;return value;});
 await settled(()=>expect(m.enqueue).toHaveBeenCalledOnce());
 expect(acknowledged).toBe(false);expect(m.pump).not.toHaveBeenCalled();
 save();expect((await response).status).toBe(200);
 await settled(()=>expect(m.finish).toHaveBeenCalledOnce());
});

it("asks the provider to retry when verified input cannot be saved",async()=>{
 m.enqueue.mockRejectedValueOnce(Error("PRIVATE_DATABASE_DETAIL"));
 const response=await POST(request([textMessage()]));
 expect(response.status).toBe(503);expect(await response.text()).not.toContain("PRIVATE_DATABASE_DETAIL");
 expect(m.finish).toHaveBeenCalledOnce();expect(m.pump).not.toHaveBeenCalled();
});

it("stages all inbound activity before saving or acknowledging a batch",async()=>{
 let release!:()=>void;m.begin.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({finish:m.finish});}));
 const response=POST(request([textMessage("one"),textMessage("two")]));
 await settled(()=>expect(m.begin).toHaveBeenCalledOnce());
 expect(m.enqueue).not.toHaveBeenCalled();release();
 expect((await response).status).toBe(200);
 expect(m.enqueue).toHaveBeenCalledWith([textMessage("one"),textMessage("two")],"Pessoa fictícia",expect.any(Number));
 await settled(()=>expect(m.finish).toHaveBeenCalledTimes(2));
});

it("saves messages from every entry and change before acknowledging the webhook",async()=>{
 const req=new NextRequest("https://zelo.test/api/webhook/waba",{
  method:"POST",headers:{"x-hub-signature-256":`sha256=${"0".repeat(64)}`},
  body:JSON.stringify({entry:[
   {changes:[{value:{messages:[textMessage("first")],contacts:[{profile:{name:"Primeiro contato"}}]}},
    {value:{statuses:[{id:"status",status:"delivered"}]}},
    {value:{messages:[textMessage("second")],contacts:[{profile:{name:"Segundo contato"}}]}}]},
   {changes:[{value:{messages:[textMessage("third")],contacts:[{profile:{name:"Terceiro contato"}}]}}]},
  ]}),
 });
 expect((await POST(req)).status).toBe(200);
 expect(m.enqueue).toHaveBeenCalledTimes(3);
 expect(m.enqueue).toHaveBeenNthCalledWith(1,[textMessage("first")],"Primeiro contato",expect.any(Number));
 expect(m.enqueue).toHaveBeenNthCalledWith(2,[textMessage("second")],"Segundo contato",expect.any(Number));
 expect(m.enqueue).toHaveBeenNthCalledWith(3,[textMessage("third")],"Terceiro contato",expect.any(Number));
});

it("releases staged activity and returns 503 if background work cannot be registered",async()=>{
 m.after.mockImplementationOnce(()=>{throw Error("PRIVATE_SCHEDULER_FAILURE");});
 const response=await POST(request([textMessage()]));
 expect(response.status).toBe(503);expect(m.enqueue).toHaveBeenCalledOnce();
 expect(m.finish).toHaveBeenCalledOnce();expect(m.wake).not.toHaveBeenCalled();
});

it("returns 503 without storing input when inbound activity cannot be staged",async()=>{
 m.begin.mockRejectedValueOnce(Error("PRIVATE_STAGE_FAILURE"));
 const response=await POST(request([textMessage()]));
 expect(response.status).toBe(503);expect(m.enqueue).not.toHaveBeenCalled();
});

it("does not save or process requests with an invalid signature",async()=>{
 m.signature.mockResolvedValueOnce(false);
 expect((await POST(request([textMessage()]))).status).toBe(403);
 expect(m.begin).not.toHaveBeenCalled();expect(m.enqueue).not.toHaveBeenCalled();
});

it("returns a retryable error when verification infrastructure fails before storage",async()=>{
 m.config.mockRejectedValueOnce(Error("PRIVATE_CONFIGURATION_FAILURE"));
 const response=await POST(request([textMessage()]));
 expect(response.status).toBe(503);
 expect(await response.text()).not.toContain("PRIVATE_CONFIGURATION_FAILURE");
 expect(m.enqueue).not.toHaveBeenCalled();
});

it("acknowledges status updates without putting them in the message inbox",async()=>{
 const req=new NextRequest("https://zelo.test/api/webhook/waba",{method:"POST",headers:{"x-hub-signature-256":`sha256=${"0".repeat(64)}`},body:JSON.stringify({entry:[{changes:[{value:{statuses:[{id:"fixture",status:"delivered"}]}}]}]})});
 expect((await POST(req)).status).toBe(200);expect(m.enqueue).not.toHaveBeenCalled();
});
