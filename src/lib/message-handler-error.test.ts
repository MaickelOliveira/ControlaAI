import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({add:vi.fn(),send:vi.fn(),phone:vi.fn()}));
vi.mock("./conversations",async original=>({...await original<typeof import("./conversations")>(),addMessage:m.add}));
vi.mock("./whatsapp",async original=>({...await original<typeof import("./whatsapp")>(),sendText:m.send}));
vi.mock("./wpp-phone-links",async original=>({...await original<typeof import("./wpp-phone-links")>(),getUserIdByPhone:m.phone}));
vi.mock("./whatsapp-company",async original=>({...await original<typeof import("./whatsapp-company")>(),withWhatsAppCompany:(_message:unknown,next:(message:unknown)=>Promise<void>)=>next(_message)}));
import {handleIncomingMessage} from "./message-handler";
beforeEach(()=>{m.add.mockReset().mockRejectedValue(Error("fixture storage error"));m.send.mockReset();m.phone.mockReset().mockResolvedValue(null);vi.spyOn(console,"error").mockImplementation(()=>{});});

it("keeps an unreported failure visible to the inbox when even the error reply cannot be sent",async()=>{
 m.send.mockResolvedValue(false);
 await expect(handleIncomingMessage({from:"5511999990000",text:"comando fictício",channel:"waba",providerMessageId:"fixture-id"})).rejects.toThrow("MESSAGE_HANDLER_UNREPORTED_FAILURE");
});

it("finishes handling after successfully telling the sender that the action is uncertain",async()=>{
 m.send.mockResolvedValue(true);
 await expect(handleIncomingMessage({from:"5511999990000",text:"comando fictício",channel:"waba",providerMessageId:"fixture-id"})).resolves.toBeUndefined();
 expect(m.send).toHaveBeenCalledWith("5511999990000",expect.stringContaining("evitar registros duplicados"),undefined);
});
