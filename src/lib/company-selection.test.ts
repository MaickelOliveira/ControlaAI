import { expect, it } from "vitest";
import { companyCookieValue, selectedCompanyId } from "./company-selection";
const owner = "10000000-0000-4000-8000-000000000001";
const company = "20000000-0000-4000-8000-000000000001";
it("keeps selection with its authenticated owner", () => {
  expect(selectedCompanyId(owner, companyCookieValue(owner, company))).toBe(company);
  expect(selectedCompanyId("10000000-0000-4000-8000-000000000002", companyCookieValue(owner, company))).toBeUndefined();
  expect(selectedCompanyId(owner)).toBeUndefined();
});
it("rejects malformed selections for the current account", () => {
  expect(() => selectedCompanyId(owner, `${owner}:bad`)).toThrow();
  expect(() => selectedCompanyId(owner, `${owner}:${company}:extra`)).toThrow();
});
