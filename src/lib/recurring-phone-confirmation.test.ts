import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({phone:vi.fn(),add:vi.fn(),update:vi.fn(),row:vi.fn()}));
vi.mock("./wpp-phone-links",()=>({getPhoneAccess:m.phone}));
vi.mock("./finances",()=>({addFinance:m.add,deleteFinance:vi.fn(),getFinancesByUser:vi.fn(),isPostedFinance:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:m.row,update:(patch:unknown)=>{m.update(patch);return q;}};return q;}})}));
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

it("uses the saved category and positive purchase identity when posting an authorized payment",async()=>{
 const row={id:"fixture-series",user_id:"owner",mode:"personal",type:"expense",amount:45.10,category:"Educação",description:"Fixture monthly service",status:"active",next_due_date:"2026-10-11",start_date:"2026-08-11",recurrence_type:"recurring",paid_installments:0,repeat_unit:"monthly",source:"web",created_at:"2026-08-01"};
 m.row.mockResolvedValueOnce({data:row,error:null}).mockResolvedValueOnce({data:{...row,paid_installments:1,next_due_date:"2026-11-11"},error:null});
 m.phone.mockResolvedValue("personal");m.add.mockResolvedValue({id:"fixture-payment"});
 expect(await confirmRecurring("fixture-series","owner","2026-10-11","5511000000000")).toMatchObject({alreadyPosted:false,finance:{id:"fixture-payment"}});
 expect(m.add).toHaveBeenCalledWith(expect.objectContaining({recurringId:"fixture-series",category:"Educação",amount:45.10,userId:"owner",mode:"personal"}));
});
