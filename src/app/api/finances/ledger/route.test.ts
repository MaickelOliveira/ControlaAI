import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),records:vi.fn(),balance:vi.fn(),bank:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:m.auth}));
vi.mock("@/lib/open-finance-access",()=>({getOpenFinanceAccess:m.access}));
vi.mock("@/lib/finances",()=>({getFinancesInRange:m.records,getAllTimeBalance:m.balance}));
vi.mock("@/lib/finance-ledger-storage",()=>({readBankLedger:m.bank}));
import {GET} from "./route";
const url="https://zelo.test/api/finances/ledger?mode=business&from=2026-10-01&to=2026-10-31";
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({session:{role:"client"},user:{id:"owner",activeMode:"business"}});m.access.mockResolvedValue(null);m.records.mockResolvedValue([]);m.balance.mockResolvedValue({income:0,expense:0,balance:0});});
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
