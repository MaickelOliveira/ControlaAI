import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({owner:vi.fn(),code:vi.fn(),update:vi.fn(),count:vi.fn(),link:vi.fn(),name:vi.fn(),relation:vi.fn(),access:vi.fn(),send:vi.fn(),pending:null as Record<string,unknown>|null,permission:vi.fn(),phones:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./users",async original=>({...await original<typeof import("./users")>(),getUserById:m.owner,getUserByWppCode:m.code,updateUser:m.update}));
vi.mock("./wpp-phone-links",()=>({getUserIdByPhone:vi.fn().mockResolvedValue("owner"),countPhonesForUser:m.count,linkPhone:m.link,setPhoneName:m.name,setPhoneRelation:m.relation,setPhoneAccess:m.access,getPhoneAccess:m.permission,getPhonesForUser:m.phones}));
vi.mock("./rate-limit",()=>({checkRateLimit:vi.fn().mockResolvedValue(true)}));
vi.mock("./pending-actions",async original=>({...await original<typeof import("./pending-actions")>(),getPendingAction:vi.fn(async()=>m.pending),setPendingAction:vi.fn(async(_phone,data)=>{m.pending=data;}),clearPendingAction:vi.fn(async()=>{m.pending=null;})}));
vi.mock("./conversations",async original=>({...await original<typeof import("./conversations")>(),addMessage:vi.fn(),getAiPaused:vi.fn().mockResolvedValue(false),getHistory:vi.fn().mockResolvedValue([])}));
vi.mock("./whatsapp",()=>({sendText:m.send,sendFile:vi.fn()}));
import {handleIncomingMessage} from "./message-handler";
const phone="5511988881111";
async function turn(text:string){await handleIncomingMessage({from:phone,text});}
beforeEach(()=>{
 vi.clearAllMocks();m.pending=null;
 const owner={id:"owner",name:"Maickel Oliveira",email:"owner@test.com",plan:"business",activeMode:"business",status:"active",locale:"pt-BR"};
 m.owner.mockResolvedValue(owner);m.code.mockImplementation(async code=>code==="1234"?owner:null);m.count.mockResolvedValue(0);m.link.mockResolvedValue("linked");m.send.mockResolvedValue(true);m.permission.mockResolvedValue("personal");m.phones.mockResolvedValue([]);
});
it("uses the first holder's registered name but does not link before access confirmation",async()=>{
 await turn("1234");expect(m.pending).toMatchObject({step:"access",name:"Maickel Oliveira",relation:"Titular"});expect(m.link).not.toHaveBeenCalled();
 await turn("3");expect(m.link).toHaveBeenCalledWith("owner",phone);expect(m.name).toHaveBeenCalledWith("owner",phone,"Maickel Oliveira");expect(m.access).toHaveBeenCalledWith("owner",phone,"both");expect(m.pending).toBeNull();
});
it("keeps a family member's own identity and access restriction",async()=>{
 m.count.mockResolvedValue(1);
 await turn("1234");expect(m.pending).toMatchObject({step:"relation"});expect(m.name).not.toHaveBeenCalled();
 await turn("Esposa");expect(m.pending).toMatchObject({step:"name",relation:"Esposa"});
 await turn("Juliana");expect(m.pending).toMatchObject({step:"access",name:"Juliana",relation:"Esposa"});expect(m.link).not.toHaveBeenCalled();
 await turn("1");expect(m.name).toHaveBeenCalledWith("owner",phone,"Juliana");expect(m.relation).toHaveBeenCalledWith("owner",phone,"Esposa");expect(m.access).toHaveBeenCalledWith("owner",phone,"personal");expect(m.update).not.toHaveBeenCalledWith("owner",expect.objectContaining({name:"Juliana"}));
});
it("continues a legacy name-first onboarding without restarting or losing identity",async()=>{
 m.pending={type:"awaiting_wpp_link_info",userId:"owner",step:"name"};
 await turn("Carlos");expect(m.pending).toMatchObject({step:"relation",name:"Carlos"});
 await turn("Marido");expect(m.pending).toMatchObject({step:"access",name:"Carlos",relation:"Marido"});
 await turn("2");expect(m.name).toHaveBeenCalledWith("owner",phone,"Carlos");expect(m.access).toHaveBeenCalledWith("owner",phone,"business");
});
