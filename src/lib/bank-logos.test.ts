import {expect,it} from "vitest";
import {bankLogoUrl, safeBankLogoUrl} from "./bank-logos";
import catalogue from "./bank-logo-catalogue.json";

it("resolves the provider institution identifier without guessing from its name",()=>{
  expect(bankLogoUrl("b397dd9c-62b2-4632-bce7-85f56666c083")).toContain("btgbanking.svg");
  expect(bankLogoUrl("BTG Banking")).toBeNull();
  expect(bankLogoUrl("unknown")).toBeNull();
});
it("keeps every public catalogue entry usable by exact institution ID",()=>{
  expect(Object.keys(catalogue)).toHaveLength(210);
  for(const [id,bank] of Object.entries(catalogue))expect(bankLogoUrl(id)).toBe(bank.url);
});
it("accepts a fresh public provider logo and falls back to the catalogue if invalid",()=>{
  expect(bankLogoUrl("new-bank","https://bank.example/logo.svg")).toBe("https://bank.example/logo.svg");
  expect(bankLogoUrl("b397dd9c-62b2-4632-bce7-85f56666c083","http://bank.example/logo.svg")).toContain("btgbanking.svg");
});
it.each(["http://bank.example/logo.svg","data:image/svg+xml,x","https://user:password@bank.example/logo.svg","https://127.0.0.1/logo","https://10.0.0.1/logo","https://[::1]/logo","https://localhost/logo","https://bank.local/logo","https://bank.example/logo?token=secret","https://bank.example/logo#secret"])('refuses unsafe logo %s',url=>{
  expect(safeBankLogoUrl(url)).toBeNull();
});
