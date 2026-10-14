import {NextRequest} from "next/server";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({handle:vi.fn(),signature:vi.fn(),config:vi.fn(),dedup:vi.fn(),begin:vi.fn(),finish:vi.fn(),media:vi.fn(),transcribe:vi.fn(),after:vi.fn()}));
vi.mock("next/server",async importOriginal=>({...await importOriginal<typeof import("next/server")>(),after:deps.after}));
vi.mock("server-only",()=>({}));
vi.mock("./message-handler",()=>({handleIncomingMessage:deps.handle}));
vi.mock("./waba",()=>({verifySignature:deps.signature,verifyToken:vi.fn(),downloadMedia:deps.media}));
vi.mock("./whatsapp-config",()=>({getConfig:deps.config}));
vi.mock("./webhook-dedup",()=>({alreadyProcessed:deps.dedup}));
vi.mock("./whatsapp-activity",()=>({beginWhatsAppActivity:deps.begin}));
vi.mock("./whatsapp",()=>({sendText:vi.fn()}));
vi.mock("./evolution",()=>({getBase64FromMediaMessage:deps.media}));
vi.mock("./ai-processor",()=>({transcribeAudio:deps.transcribe}));
vi.mock("./wpp-phone-links",()=>({getUserIdByPhone:vi.fn(async()=>null)}));
import {runWithCompanyContext,setCompanyContext} from "./company-context";
import {googleWhatsAppMessageUUID,googleWhatsAppProviderEnvelope} from "./google-whatsapp-message";
import {POST as evolution} from "../app/api/webhook/evolution/route";
import {POST as waba} from "../app/api/webhook/waba/route";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",otherCompany="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",phone="5511999999999";
const context={userId:owner,companyId:company,mode:"business" as const};
const within=(next:()=>Promise<unknown>)=>runWithCompanyContext(async()=>{setCompanyContext(context);return next();});
const request=(provider:string,body:unknown,authorized=true)=>new NextRequest(`https://zelo.test/api/webhook/${provider}${provider==="evolution"?`?secret=${authorized?"fictitious-secret":"wrong"}`:""}`,{method:"POST",headers:{"content-type":"application/json","x-hub-signature-256":`sha256=${"0".repeat(64)}`},body:JSON.stringify(body)});
const evolutionBody=(id:unknown="fixture-provider-message",message:unknown={conversation:"mensagem fictícia"})=>({event:"messages.upsert",data:{key:{id,remoteJid:`${phone}@s.whatsapp.net`,fromMe:false},message}});
const wabaBody=(message:unknown)=>({entry:[{changes:[{value:{messages:[message]}}]}]});
beforeEach(()=>{
 vi.clearAllMocks();deps.after.mockImplementation(callback=>{void callback();});deps.config.mockResolvedValue({waba:{appSecret:"fictitious-secret"},evolution:{webhookSecret:"fictitious-secret"}});deps.signature.mockResolvedValue(true);deps.dedup.mockResolvedValue(false);deps.handle.mockResolvedValue(undefined);deps.finish.mockResolvedValue(undefined);deps.begin.mockResolvedValue({finish:deps.finish});deps.media.mockResolvedValue({buffer:Buffer.from("fake audio"),mimeType:"audio/ogg"});deps.transcribe.mockResolvedValue("áudio fictício");vi.spyOn(console,"error").mockImplementation(()=>{});vi.spyOn(console,"log").mockImplementation(()=>{});
});
afterEach(()=>vi.restoreAllMocks());
it("uses a deterministic server UUID for concurrent copies of one provider message and stable ordinal",async()=>{
 await within(async()=>{
  const envelope=googleWhatsAppProviderEnvelope("evolution","fixture-provider-message"),ids=await Promise.all(Array.from({length:20},async()=>googleWhatsAppMessageUUID(owner,envelope,0)));
  expect(new Set(ids).size).toBe(1);expect(ids[0]).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);expect(googleWhatsAppMessageUUID(owner,envelope,1)).not.toBe(ids[0]);
  expect(googleWhatsAppMessageUUID(owner,{...envelope,text:"different model payload",operation:"create_meet"},0)).toBe(ids[0]);
 });
});
it("namespaces provider, owner and confirmed company/mode without letting envelope metadata select them",async()=>{
 await within(async()=>{
  const envelope=googleWhatsAppProviderEnvelope("evolution","fixture-provider-message"),original=googleWhatsAppMessageUUID(owner,envelope,0);
  expect(googleWhatsAppMessageUUID(owner,googleWhatsAppProviderEnvelope("waba",envelope.providerMessageId),0)).not.toBe(original);
  setCompanyContext({...context,companyId:otherCompany});expect(googleWhatsAppMessageUUID(owner,envelope,0)).not.toBe(original);
  setCompanyContext({...context,mode:"personal"});const personal=googleWhatsAppMessageUUID(owner,envelope,0);expect(personal).not.toBe(original);
  setCompanyContext({...context,mode:"personal",companyId:otherCompany});expect(googleWhatsAppMessageUUID(owner,envelope,0)).toBe(personal);
  setCompanyContext({...context,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"});expect(googleWhatsAppMessageUUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",envelope,0)).not.toBe(original);
 });
});
it("requires verified participant context even with a well-formed message ID",()=>expect(()=>googleWhatsAppMessageUUID(owner,googleWhatsAppProviderEnvelope("evolution","fixture"),0)).toThrow("GOOGLE_WHATSAPP_SCOPE_DENIED"));
it.each([undefined,null,1,"", "fixture\nmessage"," fixture","x".repeat(513)])("rejects invalid provider identity rather than allocating a new UUID %#",id=>expect(()=>googleWhatsAppProviderEnvelope("evolution",id)).toThrow("GOOGLE_WHATSAPP_MESSAGE_INVALID"));
it.each([-1,30,0.5,NaN,Infinity])("rejects unstable or unbounded item ordinals: %s",async ordinal=>{
 await within(async()=>{expect(()=>googleWhatsAppMessageUUID(owner,googleWhatsAppProviderEnvelope("waba","fixture"),ordinal)).toThrow("GOOGLE_WHATSAPP_MESSAGE_INVALID");});
});
it("does not accept text/model metadata as a provider source",async()=>{
 expect(()=>googleWhatsAppProviderEnvelope("model","fixture")).toThrow("GOOGLE_WHATSAPP_MESSAGE_INVALID");
 await within(async()=>{expect(()=>googleWhatsAppMessageUUID(owner,{providerMessageId:"fixture",text:"channel evolution"},0)).toThrow("GOOGLE_WHATSAPP_MESSAGE_INVALID");});
});
it("authenticated Evolution intake forwards the actual envelope ID, ignoring forged metadata in text",async()=>{
 const payload=evolutionBody("fixture-evolution",{conversation:"providerMessageId=forged"});expect((await evolution(request("evolution",payload))).status).toBe(200);
 expect(deps.handle).toHaveBeenCalledWith(expect.objectContaining({from:phone,channel:"evolution",providerMessageId:"fixture-evolution",text:"providerMessageId=forged"}));
 deps.handle.mockClear();expect((await evolution(request("evolution",payload,false))).status).toBe(403);expect(deps.handle).not.toHaveBeenCalled();
});
it("Evolution audio and file paths preserve the same authenticated identity after decoding",async()=>{
 for(const message of [{audioMessage:{base64:"ZmFrZQ==",mimetype:"audio/ogg"}},{imageMessage:{base64:"ZmFrZQ==",mimetype:"image/png",caption:"Fixture"}}]){
  deps.handle.mockClear();await evolution(request("evolution",evolutionBody("fixture-media",message)));expect(deps.handle).toHaveBeenCalledWith(expect.objectContaining({channel:"evolution",providerMessageId:"fixture-media"}));
 }
});
it("authenticated WABA intake preserves the exact source ID while retaining preexisting dedup",async()=>{
 const payload=wabaBody({id:"wamid.fixture",from:phone,type:"text",text:{body:"providerMessageId=forged"}});expect((await waba(request("waba",payload))).status).toBe(200);
 await vi.waitFor(()=>expect(deps.handle).toHaveBeenCalledWith(expect.objectContaining({channel:"waba",providerMessageId:"wamid.fixture",from:phone})),{timeout:200,interval:1});expect(deps.dedup).toHaveBeenCalledWith("wamid.fixture");
 deps.handle.mockClear();deps.dedup.mockResolvedValueOnce(true);await waba(request("waba",payload));await vi.waitFor(()=>expect(deps.finish).toHaveBeenCalledTimes(2),{timeout:200,interval:1});expect(deps.handle).not.toHaveBeenCalled();
});
it("WABA rejects invalid signature before processing any identity or effect",async()=>{
 deps.signature.mockResolvedValueOnce(false);expect((await waba(request("waba",wabaBody({id:"wamid.fixture",from:phone,type:"text",text:{body:"Fixture"}})))).status).toBe(403);expect(deps.begin).not.toHaveBeenCalled();expect(deps.handle).not.toHaveBeenCalled();
});
it("invalid or absent ingress message IDs never fall back to random/model IDs",async()=>{
 for(const id of [undefined,"fixture\ninvalid"]){deps.handle.mockClear();const body=evolutionBody();body.data.key.id=id;await evolution(request("evolution",body));expect(deps.handle).not.toHaveBeenCalled();}
 await waba(request("waba",wabaBody({from:phone,type:"text",text:{body:"Fixture"}})));await vi.waitFor(()=>expect(deps.finish).toHaveBeenCalledOnce(),{timeout:200,interval:1});expect(deps.handle).not.toHaveBeenCalled();
});
