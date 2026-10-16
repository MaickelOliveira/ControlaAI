import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>{
 const query={select:vi.fn(),update:vi.fn(),eq:vi.fn(),in:vi.fn(),is:vi.fn(),or:vi.fn(),order:vi.fn(),range:vi.fn()};
 return {query,from:vi.fn()};
});
vi.mock("./supabase",()=>({getSupabase:()=>({from:m.from})}));
import {previewPlatformFinancesForAccount,moveSelectedPlatformFinancesToAccount} from "./finances";

const accountId="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{
 vi.resetAllMocks();
 m.from.mockReturnValue(m.query);
 m.query.select.mockReturnValue(m.query);m.query.update.mockReturnValue(m.query);
 m.query.eq.mockReturnValue(m.query);m.query.in.mockReturnValue(m.query);m.query.is.mockReturnValue(m.query);
 m.query.or.mockReturnValue(m.query);m.query.order.mockReturnValue(m.query);
 m.query.range.mockResolvedValue({count:7,data:[{id:"finance-1",description:"Farmacia",amount:90,date:"2026-10-15",source:"whatsapp",account_id:"cash"}],error:null});
});

it("previews all months for web and WhatsApp entries outside the destination account",async()=>{
 expect(await previewPlatformFinancesForAccount("owner","personal",accountId,0)).toEqual({count:7,items:[{id:"finance-1",description:"Farmacia",amount:90,date:"2026-10-15",source:"whatsapp",accountId:"cash"}]});
 expect(m.from).toHaveBeenCalledWith("finances");
 expect(m.query.select).toHaveBeenCalledWith("id,description,amount,date,source,account_id",{count:"exact"});
 expect(m.query.eq.mock.calls).toEqual([["user_id","owner"],["mode","personal"]]);
 expect(m.query.in).toHaveBeenCalledWith("source",["web","whatsapp"]);
 expect(m.query.is).toHaveBeenCalledWith("card_invoice_id",null);
 expect(m.query.or).toHaveBeenCalledWith(`account_id.is.null,account_id.neq.${accountId}`);
 expect(m.query.order).toHaveBeenCalledWith("date",{ascending:false});
 expect(m.query.range).toHaveBeenCalledWith(0,49);
});
it("changes only selected entries in one statement without rewriting amount or date",async()=>{
 m.query.in.mockImplementation((column:string)=>column==="id"?Promise.resolve({count:1,error:null}):m.query);
 expect(await moveSelectedPlatformFinancesToAccount("owner","personal",accountId,["finance-1"])).toBe(1);
 expect(m.query.update).toHaveBeenCalledWith({account_id:accountId},{count:"exact"});
 expect(m.query.eq.mock.calls).toEqual([["user_id","owner"],["mode","personal"]]);
 expect(m.query.in.mock.calls).toEqual([["source",["web","whatsapp"]],["id",["finance-1"]]]);
 expect(m.query.is).toHaveBeenCalledWith("card_invoice_id",null);
});
it("reports database failures instead of a false success",async()=>{
 m.query.in.mockImplementation((column:string)=>column==="id"?Promise.resolve({count:null,error:Error("failed")}):m.query);
 await expect(moveSelectedPlatformFinancesToAccount("owner","personal",accountId,["finance-1"])).rejects.toThrow("FINANCE_ACCOUNT_MOVE_UNAVAILABLE");
});
