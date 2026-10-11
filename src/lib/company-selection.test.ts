import { expect, it } from "vitest";
import { companyCookieValue, selectedCompanyId, selectCompanyContext } from "./company-selection";
const owner = "10000000-0000-4000-8000-000000000001";
const company = "20000000-0000-4000-8000-000000000001";
it("keeps selection with its authenticated owner", () => {
  expect(selectedCompanyId(owner, companyCookieValue(owner, company))).toBe(company);
  expect(selectedCompanyId("10000000-0000-4000-8000-000000000002", companyCookieValue(owner, company))).toBeUndefined();
  expect(selectedCompanyId(owner)).toBeUndefined();
});
it("falls back only from an owned archived selection and keeps personal usable without active businesses",()=>{
 const archived={id:company,isDefault:true,archivedAt:"2026-10-11"},active={id:"20000000-0000-4000-8000-000000000002",isDefault:false};
 expect(selectCompanyContext([archived,active],company,"business")).toBe(active);
 expect(()=>selectCompanyContext([archived,active],"foreign","business")).toThrow("COMPANY_NOT_FOUND");
 expect(selectCompanyContext([archived],undefined,"personal")).toBe(archived);
 expect(()=>selectCompanyContext([archived],undefined,"business")).toThrow("COMPANY_REQUIRED");
});
it("rejects malformed selections for the current account", () => {
  expect(() => selectedCompanyId(owner, `${owner}:bad`)).toThrow();
  expect(() => selectedCompanyId(owner, `${owner}:${company}:extra`)).toThrow();
});
