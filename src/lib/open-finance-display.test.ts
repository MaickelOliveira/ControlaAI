import {bankAmountWithoutCurrency} from "./open-finance-display";
import { describe, expect, it, vi } from "vitest";
import { bankMoney, matchesBank, bankDate, bankResourceName } from "./open-finance-display";
describe("bank data display", () => {
  it("uses readable account names while preserving provider product names",()=>{
    expect(bankResourceName("CONTA_DEPOSITO_A_VISTA")).toBe("Conta corrente");
    expect(bankResourceName("CONTA_POUPANCA")).toBe("Poupança");
    expect(bankResourceName("CDB Inter 110% CDI")).toBe("CDB Inter 110% CDI");
  });
  it("keeps missing amounts distinct from zero and refuses invalid currencies", () => {
    expect(bankMoney(null, "BRL")).toBe("Não informado");
    expect(bankMoney("0", "BRL")).toContain("0,00");
    expect(bankMoney("10", null)).toBe("Não informado");
    expect(bankMoney("private data", "BRL")).toBe("Não informado");
  });
  it("searches all levels of the bank hierarchy without requiring accents", () => {
    const bank = { name: "Itaú Empresas", organizationName: "Organização", parentOrganizationName: "Conglomerado Nacional" };
    expect(matchesBank(bank, "itau")).toBe(true);
    expect(matchesBank(bank, "organizacao")).toBe(true);
    expect(matchesBank(bank, "conglomerado")).toBe(true);
    expect(matchesBank(bank, "outro")).toBe(false);
  });
  it("preserves provider calendar dates instead of shifting a day by timezone", () => {
    expect(bankDate("2026-10-01")).toBe("01/10/2026");
    expect(bankDate(null)).toBe("Não informado");
  });
});

it("does not print a synthetic XXX currency code when currency was not reported",()=>{
 const formatter=vi.spyOn(Intl.NumberFormat.prototype,"formatToParts").mockReturnValue([{type:"currency",value:"XXX"},{type:"literal",value:" "},{type:"integer",value:"49"},{type:"decimal",value:","},{type:"fraction",value:"90"}]);
 try{expect(bankAmountWithoutCurrency("49.90")).toBe("49,90")}finally{formatter.mockRestore()}
});
