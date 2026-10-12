import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { isRegisteredAccountHolderPhone } from "./wpp-holder-authorization";

describe("registered account holder authorization",()=>{
 it.each(["5511999990001","551199990001","11999990001","1199990001"])("recognizes the verified registered Brazilian alias %s",phone=>{
  expect(isRegisteredAccountHolderPhone("+55 (11) 99999-0001",phone)).toBe(true);
 });
 it.each([undefined,"","5511999990002","34123456789"])("rejects missing or different registered ownership %j",registered=>{
  expect(isRegisteredAccountHolderPhone(registered,"5511999990001")).toBe(false);
 });
 it("does not turn a complete foreign number into a Brazilian owner",()=>{
  expect(isRegisteredAccountHolderPhone("+34 612345678","5534612345678")).toBe(false);
  expect(isRegisteredAccountHolderPhone("+34 612345678","34612345678")).toBe(true);
 });
});
