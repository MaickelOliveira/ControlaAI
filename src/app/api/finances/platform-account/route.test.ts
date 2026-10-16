import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),accounts:vi.fn(),preview:vi.fn(),move:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:m.auth}));
vi.mock("@/lib/accounts",()=>({getAccountsByUser:m.accounts}));
vi.mock("@/lib/finances",()=>({previewPlatformFinancesForAccount:m.preview,moveSelectedPlatformFinancesToAccount:m.move}));
import {GET,POST} from "./route";

const url="https://zelo.test/api/finances/platform-account?mode=personal&accountId=11111111-1111-4111-8111-111111111111";
const request=(body:unknown)=>new Request("https://zelo.test/api/finances/platform-account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.resetAllMocks();
 m.auth.mockResolvedValue({session:{role:"client"},user:{id:"owner",activeMode:"personal"}});
 m.accounts.mockResolvedValue([{id:"11111111-1111-4111-8111-111111111111",name:"Banco escolhido",mode:"personal",type:"bank"}]);
 m.preview.mockResolvedValue({count:7,items:[{id:"33333333-3333-4333-8333-333333333333",description:"Farmacia",amount:90,date:"2026-10-15",source:"whatsapp",accountId:null}]});m.move.mockResolvedValue(1);
});

it("rejects anonymous and admin requests before reading accounts",async()=>{
 m.auth.mockResolvedValue(null);expect((await GET(new Request(url))).status).toBe(401);
 m.auth.mockResolvedValue({session:{role:"admin"}});expect((await POST(request({mode:"personal",accountId:"11111111-1111-4111-8111-111111111111"}))).status).toBe(401);
 expect(m.accounts).not.toHaveBeenCalled();
});
it("rejects another mode, account or card before changing records",async()=>{
 expect((await GET(new Request(url.replace("personal","business")))).status).toBe(400);
 expect((await POST(request({mode:"personal",accountId:"22222222-2222-4222-8222-222222222222",ids:["33333333-3333-4333-8333-333333333333"]}))).status).toBe(404);
 m.accounts.mockResolvedValue([{id:"11111111-1111-4111-8111-111111111111",mode:"personal",type:"credit_card"}]);
 expect((await POST(request({mode:"personal",accountId:"11111111-1111-4111-8111-111111111111",ids:["33333333-3333-4333-8333-333333333333"]}))).status).toBe(400);
 expect(m.move).not.toHaveBeenCalled();
});
it("previews and moves only the owner's platform entries in the selected workspace",async()=>{
 const preview=await GET(new Request(url));expect(preview.status).toBe(200);
 expect(await preview.json()).toEqual({count:7,items:[{id:"33333333-3333-4333-8333-333333333333",description:"Farmacia",amount:90,date:"2026-10-15",source:"whatsapp",accountId:null}],accountName:"Banco escolhido"});
 expect(m.preview).toHaveBeenCalledWith("owner","personal","11111111-1111-4111-8111-111111111111",0);
 const result=await POST(request({mode:"personal",accountId:"11111111-1111-4111-8111-111111111111",ids:["33333333-3333-4333-8333-333333333333"]}));
 expect(result.status).toBe(200);expect(await result.json()).toEqual({moved:1,accountName:"Banco escolhido"});
 expect(m.move).toHaveBeenCalledWith("owner","personal","11111111-1111-4111-8111-111111111111",["33333333-3333-4333-8333-333333333333"]);
});
it("requires an explicit valid selection before moving",async()=>{
 expect((await POST(request({mode:"personal",accountId:"11111111-1111-4111-8111-111111111111"}))).status).toBe(400);
 expect((await POST(request({mode:"personal",accountId:"11111111-1111-4111-8111-111111111111",ids:[]}))).status).toBe(400);
 expect((await POST(request({mode:"personal",accountId:"11111111-1111-4111-8111-111111111111",ids:["bad"]}))).status).toBe(400);
 expect(m.move).not.toHaveBeenCalled();
});
it("paginates the preview without changing the selected mode",async()=>{
 const response=await GET(new Request(`${url}&page=2`));
 expect(response.status).toBe(200);
 expect(m.preview).toHaveBeenCalledWith("owner","personal","11111111-1111-4111-8111-111111111111",100);
 expect((await GET(new Request(`${url}&page=-1`))).status).toBe(400);
});
it("does not claim success if the database fails",async()=>{
 m.move.mockRejectedValue(Error("private database detail"));
 const response=await POST(request({mode:"personal",accountId:"11111111-1111-4111-8111-111111111111",ids:["33333333-3333-4333-8333-333333333333"]}));
 expect(response.status).toBe(503);expect(await response.text()).not.toContain("private database detail");
});
