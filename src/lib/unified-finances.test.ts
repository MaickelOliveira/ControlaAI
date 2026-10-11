import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({manual:vi.fn(),access:vi.fn(),bank:vi.fn()}));
vi.mock("./finances",()=>({getFinancesInRangeStrict:m.manual}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access}));
vi.mock("./finance-ledger-storage",()=>({readBankLedger:m.bank}));
import {readUnifiedFinances} from "./unified-finances";
const user={id:"own",email:"client@example.test",activeMode:"personal",plan:"personal"} as const;
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({userId:user.id,mode:"personal",environment:"production"});m.bank.mockResolvedValue({report:{movements:[]},overview:{connections:[{}]}});});
it("fails the entire unified read when banks are healthy but manual records cannot be read",async()=>{
  m.manual.mockRejectedValue(Error("FINANCE_READ_UNAVAILABLE"));
  await expect(readUnifiedFinances(user,"personal","2026-09-01","2026-09-30")).rejects.toThrow("FINANCE_READ_UNAVAILABLE");
  expect(m.bank).toHaveBeenCalled();expect(m.manual).toHaveBeenCalledWith(user.id,"personal","2026-09-01","2026-09-30");
});
