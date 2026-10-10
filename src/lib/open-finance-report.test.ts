import {describe,it,expect} from "vitest";
import {bankPeriod} from "./open-finance-report";
import {bankMoney} from "./open-finance-display";
describe("bank report boundaries",()=>{
  it("rejects impossible, reversed and unbounded periods",()=>{
    for(const [from,to]of [["2026-02-29","2026-03-01"],["2026-10-01","2026-09-30"],["2025-01-01","2026-09-30"],[undefined,"2026-09-30"]])expect(()=>bankPeriod(from,to)).toThrow();
    expect(bankPeriod("2026-09-01","2026-09-30")).toEqual({from:"2026-09-01",to:"2026-09-30"});
  });
  it("renders large source amounts and rounding without binary floating point loss",()=>{
    expect(bankMoney("9999999999999999.12345678","BRL")).toContain("9.999.999.999.999.999,12");
    expect(bankMoney("1.005","BRL")).toContain("1,01");
    expect(bankMoney("-0.01","BRL")).toContain("-R$");
    expect(bankMoney("12.3456","KWD")).toContain("12,346");
  });
});
