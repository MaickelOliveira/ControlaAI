import {expect,it} from "vitest";
import {scopeCompanyRequest} from "./company-scope-policy";
const scope={userId:"10000000-0000-4000-8000-000000000001",companyId:"20000000-0000-4000-8000-000000000001",mode:"business" as const};
it("excludes archived legacy folders and records even from personal requests",()=>{
 const archived="20000000-0000-4000-8000-000000000099";
 const result=scopeCompanyRequest(new URL("https://db.test/rest/v1/drive_files"),{method:"GET"},{...scope,mode:"personal",archivedCompanyIds:[archived]});
 expect(result.url.searchParams.get("and")).toContain(`company_id.not.in.(${archived})`);
 expect(result.url.searchParams.get("and")).toContain("company_id.is.null");
});
it("restricts income/expense reads and mutations to personal or selected enterprise rows",()=>{
 for(const method of ["GET","PATCH","DELETE"]){
  const result=scopeCompanyRequest(new URL("https://db.test/rest/v1/finances?id=eq.foreign"),{method,...(method==="PATCH"?{body:"{}"}:{})},scope);
  expect(result.url.searchParams.get("user_id")).toBe(`eq.${scope.userId}`);expect(result.url.searchParams.get("and")).toContain(scope.companyId);
 }
});
it("scopes all employees and customers including ID-based operations",()=>{
 for(const table of ["employees","customers"]){
  const result=scopeCompanyRequest(new URL(`https://db.test/rest/v1/${table}?user_id=eq.${scope.userId}`),{method:"DELETE"},scope);
  expect(result.url.searchParams.get("company_id")).toBe(`eq.${scope.companyId}`);
 }
});
it("assigns each new business row to selected company and keeps personal rows separate",()=>{
 const result=scopeCompanyRequest(new URL("https://db.test/rest/v1/finances"),{method:"POST",body:JSON.stringify([{user_id:scope.userId,mode:"business",amount:50},{user_id:scope.userId,mode:"personal",amount:20}])},scope);
 expect(JSON.parse(result.init.body as string)).toEqual([{user_id:scope.userId,mode:"business",amount:50,company_id:scope.companyId},{user_id:scope.userId,mode:"personal",amount:20,company_id:null}]);
});
it("rejects spoofed owner/company and attempts to reassign an existing record",()=>{
 const url=new URL("https://db.test/rest/v1/employees");
 expect(()=>scopeCompanyRequest(url,{method:"POST",body:JSON.stringify({user_id:"foreign",name:"test"})},scope)).toThrow();
 expect(()=>scopeCompanyRequest(url,{method:"POST",body:JSON.stringify({user_id:scope.userId,company_id:"foreign"})},scope)).toThrow();
 expect(()=>scopeCompanyRequest(url,{method:"PATCH",body:JSON.stringify({company_id:"foreign"})},scope)).toThrow();
});
it("leaves authentication, billing, global WhatsApp and personal grocery queries unchanged",()=>{
 for(const table of ["users","wpp_phone_links","companies","whatsapp_config","grocery_stores"]){
  const result=scopeCompanyRequest(new URL(`https://db.test/rest/v1/${table}`),{method:"GET"},scope);
  expect(result.url.search).toBe("");
 }
});
it("does not overwrite an existing OR filter or allow foreign user filters",()=>{
 const result=scopeCompanyRequest(new URL(`https://db.test/rest/v1/finances?or=(description.ilike.*foo*,category.eq.Saúde)`),{method:"GET"},scope);
 expect(result.url.searchParams.get("or")).toContain("description.ilike");expect(result.url.searchParams.get("and")).toContain(scope.companyId);
 expect(()=>scopeCompanyRequest(new URL("https://db.test/rest/v1/finances?user_id=eq.foreign"),{method:"GET"},scope)).toThrow();
});
it("rejects merge-duplicate inserts rather than reassign another company's ID",()=>{
 expect(()=>scopeCompanyRequest(new URL("https://db.test/rest/v1/employees"),{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({id:"foreign",name:"test"})},scope)).toThrow("COMPANY_UPSERT_DENIED");
});
it("lets the database inherit an invoice's company from its authorized parent account",()=>{
 const result=scopeCompanyRequest(new URL("https://db.test/rest/v1/card_invoices"),{method:"POST",body:JSON.stringify({account_id:"personal-account"})},scope);
 expect(JSON.parse(result.init.body as string).company_id).toBeNull();
 expect(new Headers(result.init.headers).get("x-zelo-company")).toBe(scope.companyId);
});
