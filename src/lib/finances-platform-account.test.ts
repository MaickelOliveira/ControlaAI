import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>{
 const query={select:vi.fn(),update:vi.fn(),eq:vi.fn(),is:vi.fn(),or:vi.fn()};
 return {query,from:vi.fn()};
});
vi.mock("./supabase",()=>({getSupabase:()=>({from:m.from})}));
import {countPlatformFinancesForAccount,movePlatformFinancesToAccount} from "./finances";

const accountId="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{
 vi.resetAllMocks();
 m.from.mockReturnValue(m.query);
 m.query.select.mockReturnValue(m.query);m.query.update.mockReturnValue(m.query);
 m.query.eq.mockReturnValue(m.query);m.query.is.mockReturnValue(m.query);
 m.query.or.mockResolvedValue({count:7,error:null});
});

it("previews all months but only direct platform records outside the destination account",async()=>{
 expect(await countPlatformFinancesForAccount("owner","personal",accountId)).toBe(7);
 expect(m.from).toHaveBeenCalledWith("finances");
 expect(m.query.eq.mock.calls).toEqual([["user_id","owner"],["mode","personal"],["source","web"]]);
 expect(m.query.is).toHaveBeenCalledWith("card_invoice_id",null);
 expect(m.query.or).toHaveBeenCalledWith(`account_id.is.null,account_id.neq.${accountId}`);
});
it("changes the account in one statement without rewriting amount or date",async()=>{
 expect(await movePlatformFinancesToAccount("owner","personal",accountId)).toBe(7);
 expect(m.query.update).toHaveBeenCalledWith({account_id:accountId},{count:"exact"});
 expect(m.query.eq.mock.calls).toEqual([["user_id","owner"],["mode","personal"],["source","web"]]);
 expect(m.query.is).toHaveBeenCalledWith("card_invoice_id",null);
});
it("reports database failures instead of a false success",async()=>{
 m.query.or.mockResolvedValue({count:null,error:Error("failed")});
 await expect(movePlatformFinancesToAccount("owner","personal",accountId)).rejects.toThrow("FINANCE_ACCOUNT_MOVE_UNAVAILABLE");
});
