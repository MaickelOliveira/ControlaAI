import {afterEach, beforeEach, expect, it, vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({begin:vi.fn(),finishActivity:vi.fn(),dispatch:vi.fn(),finish:vi.fn(),handle:vi.fn(),send:vi.fn(),download:vi.fn(),transcribe:vi.fn(),user:vi.fn()}));
vi.mock("./whatsapp-activity",()=>({beginWhatsAppActivity:m.begin}));
vi.mock("./waba-inbox",()=>({beginWabaDispatch:m.dispatch,finishWabaMessage:m.finish}));
vi.mock("./message-handler",()=>({handleIncomingMessage:m.handle}));
vi.mock("./whatsapp",()=>({sendText:m.send}));
vi.mock("./waba",()=>({downloadMedia:m.download}));
vi.mock("./ai-processor",()=>({transcribeAudio:m.transcribe}));
vi.mock("./wpp-phone-links",()=>({getUserIdByPhone:m.user}));
import {processWabaMessage} from "./waba-process";
import type {ClaimedWabaMessage} from "./waba-inbox";
const row=(message:Record<string,unknown>={id:"fixture-id",from:"5511999990000",type:"text",text:{body:"texto fictício"}}):ClaimedWabaMessage=>({messageId:"fixture-id",message,leaseToken:"fixture-lease",receivedAt:Date.now(),contactName:"Pessoa fictícia"});
beforeEach(()=>{
 for(const mock of Object.values(m))mock.mockReset();
 m.begin.mockResolvedValue({finish:m.finishActivity});m.finishActivity.mockResolvedValue(undefined);
 m.dispatch.mockResolvedValue(undefined);m.finish.mockResolvedValue(undefined);m.handle.mockResolvedValue(undefined);
 m.send.mockResolvedValue(true);m.download.mockResolvedValue({buffer:Buffer.from("fixture"),mimeType:"audio/ogg"});m.transcribe.mockResolvedValue("áudio fictício");m.user.mockResolvedValue(null);
 vi.spyOn(console,"error").mockImplementation(()=>{});
});
afterEach(()=>vi.restoreAllMocks());

it("confirms a text message only after the handler completes",async()=>{
 let release!:()=>void;m.handle.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
 const task=processWabaMessage(row());
 await vi.waitFor(()=>expect(m.handle).toHaveBeenCalledOnce());
 expect(m.dispatch).toHaveBeenCalledBefore(m.handle);
 expect(m.finish).not.toHaveBeenCalled();
 release();await task;
 expect(m.finish).toHaveBeenCalledWith("fixture-id","fixture-lease","succeeded");
});

it("retries preparation failures before any customer action",async()=>{
 m.begin.mockRejectedValueOnce(Error("fixture transient failure"));
 await processWabaMessage(row());
 expect(m.dispatch).not.toHaveBeenCalled();expect(m.handle).not.toHaveBeenCalled();
 expect(m.finish).toHaveBeenCalledWith("fixture-id","fixture-lease","retry");
});

it("preserves an ambiguous handler failure for review without automatic replay",async()=>{
 m.handle.mockRejectedValueOnce(Error("fixture ambiguous failure"));
 await processWabaMessage(row());
 expect(m.finish).toHaveBeenCalledWith("fixture-id","fixture-lease","failed");
 expect(m.finish).not.toHaveBeenCalledWith("fixture-id","fixture-lease","retry");
});

it("asks the sender to retry unreadable media, then records the handled outcome",async()=>{
 m.transcribe.mockResolvedValueOnce(null);
 await processWabaMessage(row({id:"fixture-id",from:"5511999990000",type:"audio",audio:{id:"fixture-media"}}));
 expect(m.dispatch).toHaveBeenCalledOnce();expect(m.send).toHaveBeenCalledWith("5511999990000",expect.stringContaining("Pode digitar sua mensagem?"));
 expect(m.finish).toHaveBeenCalledWith("fixture-id","fixture-lease","succeeded");
});

it("never acts on a message when the durable dispatch transition fails",async()=>{
 m.dispatch.mockRejectedValueOnce(Error("fixture database error"));
 await processWabaMessage(row());
 expect(m.handle).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
 expect(m.finish).toHaveBeenCalledWith("fixture-id","fixture-lease","retry");
});
