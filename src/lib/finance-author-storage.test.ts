import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({row:null as Record<string,unknown>|null}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:()=>({insert:(row:Record<string,unknown>)=>{m.row=row;return {select:()=>({single:async()=>({data:{...row,created_at:"2026-10-11"},error:null})})};}})})}));
import {addFinance} from "./finances";
const base={userId:"authenticated-owner",type:"expense" as const,amount:50,category:"Saúde",description:"Farmácia",mode:"personal" as const,date:"2026-10-11"};
beforeEach(()=>{m.row=null;});
it("persists the platform's authenticated identity without adding a display name to the database",async()=>{
 const record=await addFinance({...base,source:"web"});expect(m.row).toMatchObject({registered_by:"authenticated-owner",amount:50});expect(m.row).not.toHaveProperty("registeredByName");expect(record.registeredBy).toBe("authenticated-owner");
});
it("preserves the actual WhatsApp sender instead of replacing it with the account owner",async()=>{
 await addFinance({...base,source:"whatsapp",registeredBy:"5511988881111"});expect(m.row?.registered_by).toBe("5511988881111");
});
it("leaves unidentified WhatsApp history unidentified",async()=>{
 await addFinance({...base,source:"whatsapp"});expect(m.row?.registered_by).toBeUndefined();
});
