import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({result:{data:null as unknown,error:null as unknown}}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:()=>({select:()=>({in:async()=>m.result})})})}));
vi.mock("./conversations",()=>({phoneVariants:(phone:string)=>[phone,"legacy"]}));
import {getPhoneAccess} from "./wpp-phone-links";
beforeEach(()=>{m.result={data:null,error:null};});
it("denies missing or failed bindings instead of granting both modes",async()=>{
  expect(await getPhoneAccess("u","phone")).toBeNull();m.result.error={message:"failed"};expect(await getPhoneAccess("u","phone")).toBeNull();
});
it("uses the same variant priority as ownership and denies a variant currently assigned to another holder",async()=>{
  m.result.data=[{phone:"legacy",user_id:"u",access:"personal"}];expect(await getPhoneAccess("u","phone")).toBe("personal");
  m.result.data=[{phone:"phone",user_id:"other",access:"both"},{phone:"legacy",user_id:"u",access:"personal"}];expect(await getPhoneAccess("u","phone")).toBeNull();
});
