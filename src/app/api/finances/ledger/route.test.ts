import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),records:vi.fn(),balance:vi.fn(),bank:vi.fn(),phones:vi.fn(),accounts:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:m.auth}));
vi.mock("@/lib/open-finance-access",()=>({getOpenFinanceAccess:m.access}));
vi.mock("@/lib/finances",async original=>({...await original<typeof import("@/lib/finances")>(),getFinancesInRangeStrict:m.records}));
vi.mock("@/lib/finance-ledger-storage",()=>({readBankLedger:m.bank}));
vi.mock("@/lib/wpp-phone-links",()=>({getPhonesForUser:m.phones}));
vi.mock("@/lib/accounts",()=>({getAccountsByUser:m.accounts}));
import {GET} from "./route";
const url="https://zelo.test/api/finances/ledger?mode=business&from=2026-10-01&to=2026-10-31";
beforeEach(()=>{vi.resetAllMocks();m.phones.mockResolvedValue([]);m.accounts.mockResolvedValue([]);m.auth.mockResolvedValue({session:{role:"client"},user:{id:"owner",activeMode:"business"}});m.access.mockResolvedValue(null);m.records.mockResolvedValue([]);m.balance.mockResolvedValue({income:0,expense:0,balance:0});});
it("rejects anonymous and admin requests before reading financial records",async()=>{
 m.auth.mockResolvedValue(null);expect((await GET(new Request(url))).status).toBe(401);
 m.auth.mockResolvedValue({session:{role:"admin"}});expect((await GET(new Request(url))).status).toBe(401);expect(m.records).not.toHaveBeenCalled();
});
it("does not read banks for a client outside the existing owner gate",async()=>{
 const response=await GET(new Request(url+"&userId=other"));expect(response.status).toBe(200);expect(m.bank).not.toHaveBeenCalled();expect(m.records.mock.calls[0][0]).toBe("owner");expect(response.headers.get("cache-control")).toContain("no-store");
});
it("validates mode and period before reading data",async()=>{
 expect((await GET(new Request(url.replace("business","other")))).status).toBe(400);expect((await GET(new Request(url.replace("2026-10-31","2026-02-30")))).status).toBe(400);expect(m.records).not.toHaveBeenCalled();
});
it("does not report zero bank spending when an authorized bank read fails",async()=>{
 m.access.mockResolvedValue({userId:"owner",mode:"business",environment:"production"});m.bank.mockRejectedValue(Error("PRIVATE_ERROR"));const response=await GET(new Request(url));expect(response.status).toBe(503);expect(await response.text()).not.toContain("PRIVATE_ERROR");
});
it("preserves long manual periods for clients without bank access",async()=>{
 expect((await GET(new Request(url.replace("2026-10-01","2020-01-01")))).status).toBe(200);
 m.access.mockResolvedValue({userId:"owner",mode:"business",environment:"production"});
 expect((await GET(new Request(url.replace("2026-10-01","2020-01-01")))).status).toBe(400);expect(m.bank).not.toHaveBeenCalled();
});
it("does not hide bank data behind manual-only success during an owner access outage",async()=>{
 m.access.mockRejectedValue(Error("OF_ACCESS_UNAVAILABLE"));expect((await GET(new Request(url))).status).toBe(503);expect(m.records).not.toHaveBeenCalled();
});
it("does not present a bank-only total if manual history cannot be read completely",async()=>{
 m.access.mockResolvedValue({userId:"owner",mode:"business",environment:"production"});m.bank.mockResolvedValue({report:{movements:[]}});m.records.mockRejectedValue(Error("FINANCE_READ_UNAVAILABLE"));
 expect((await GET(new Request(url))).status).toBe(503);
});

it("identifies the linked author without exposing phone numbers or guessing bank authors",async()=>{
 m.auth.mockResolvedValue({session:{role:"client"},user:{id:"owner",name:"Maickel",activeMode:"business"}});
 m.phones.mockResolvedValue([{userId:"owner",phone:"5511988881111",name:"Juliana"},{userId:"other",phone:"5511988882222",name:"Foreign"}]);
 m.records.mockResolvedValue([{id:"manual",userId:"owner",type:"expense",amount:50,category:"Saúde",description:"Farmácia",mode:"business",date:"2026-10-10",source:"whatsapp",registeredBy:"5511988881111",createdAt:"2026-10-10"}]);
 const response=await GET(new Request(url));const payload=await response.text();
 expect(response.status).toBe(200);expect(payload).toContain('"registeredByName":"Juliana"');expect(payload).not.toContain("5511988881111");expect(payload).not.toContain("Foreign");
});

it("keeps the manual account ID and exposes only account labels for the authenticated workspace",async()=>{
 m.accounts.mockResolvedValue([{id:"a",name:"Carteira teste",type:"bank",userId:"owner",secret:"not-public"}]);
 m.records.mockResolvedValue([{id:"f",type:"expense",amount:20,category:"Outros",description:"Teste",date:"2026-10-11",mode:"business",accountId:"a"}]);
 const response=await GET(new Request(url));const data=await response.json();
 expect(data.finances[0].accountId).toBe("a");expect(data.accounts).toEqual([{id:"a",name:"Carteira teste",type:"bank"}]);expect(m.accounts).toHaveBeenCalledWith("owner","business");
});
