import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({phone:vi.fn(),add:vi.fn(),update:vi.fn(),row:vi.fn()}));
vi.mock("./wpp-phone-links",()=>({getPhoneAccess:m.phone}));
vi.mock("./finances",()=>({addFinance:m.add,deleteFinance:vi.fn(),getFinancesByUser:vi.fn(),isPostedFinance:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:m.row,update:m.update};return q;}})}));
import {confirmRecurring} from "./recurring";
beforeEach(()=>{vi.resetAllMocks();m.row.mockResolvedValue({data:{id:"rec",user_id:"owner",mode:"business",status:"active",next_due_date:"2026-10-11",recurrence_type:"recurring",paid_installments:0},error:null});});
it("denies a PJ confirmation after a previously shared phone was restricted to PF",async()=>{
  m.phone.mockResolvedValue("personal");
  expect(await confirmRecurring("rec","owner","2026-10-11","5511111111111")).toBeNull();
  expect(m.add).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it("denies confirmation after the phone binding disappears",async()=>{
  m.phone.mockResolvedValue(null);
  expect(await confirmRecurring("rec","owner","2026-10-11","5511111111111")).toBeNull();expect(m.add).not.toHaveBeenCalled();
});
