import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({session:vi.fn(),accounts:vi.fn(),add:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSession:m.session}));
vi.mock("@/lib/accounts",()=>({getAccountsByUser:m.accounts}));
vi.mock("@/lib/finances",()=>({addFinance:m.add}));
import {POST} from "./route";
const request=(accountId?:string)=>new NextRequest("https://zelo.test/api/finances",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"expense",amount:12,category:"Outros",description:"Teste",mode:"personal",accountId})});
beforeEach(()=>{
 vi.resetAllMocks();m.session.mockResolvedValue({sub:"owner",role:"client"});
 m.accounts.mockResolvedValue([{id:"11111111-1111-4111-8111-111111111111",userId:"owner",mode:"personal",type:"bank"}]);
 m.add.mockResolvedValue({id:"saved"});
});
it("saves a new platform entry into an owned manual bank account",async()=>{
 const response=await POST(request("11111111-1111-4111-8111-111111111111"));
 expect(response.status).toBe(201);
 expect(m.accounts).toHaveBeenCalledWith("owner","personal");
 expect(m.add).toHaveBeenCalledWith(expect.objectContaining({userId:"owner",source:"web",accountId:"11111111-1111-4111-8111-111111111111"}));
});
it("rejects an account outside the owner and mode before saving",async()=>{
 expect((await POST(request("22222222-2222-4222-8222-222222222222"))).status).toBe(404);
 expect(m.add).not.toHaveBeenCalled();
});
it("does not attach a direct entry to a card or accept an admin session",async()=>{
 m.accounts.mockResolvedValue([{id:"11111111-1111-4111-8111-111111111111",mode:"personal",type:"credit_card"}]);
 expect((await POST(request("11111111-1111-4111-8111-111111111111"))).status).toBe(400);
 m.session.mockResolvedValue({sub:"owner",role:"admin"});
 expect((await POST(request("11111111-1111-4111-8111-111111111111"))).status).toBe(401);
 expect(m.add).not.toHaveBeenCalled();
});
it("keeps existing account-free clients compatible",async()=>{
 expect((await POST(request())).status).toBe(201);
 expect(m.add).toHaveBeenCalledWith(expect.not.objectContaining({accountId:expect.anything()}));
});
