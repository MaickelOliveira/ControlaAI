import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {normalizeLimits} from "./open-finance-normalize";

const money=(amount:string)=>({amount,currency:"BRL"});
it("preserves all documented Polp credit lines including zero and unknown without clipping to three",()=>{
  const input={id:"fixture-card",limits:[
    {line_name:"CREDITO_A_VISTA",available_amount:money("321.45"),limit_amount:money("1000"),used_amount:money("678.55")},
    {line_name:"SAQUE_CREDITO_BRASIL",available_amount:money("0"),limit_amount:money("0"),used_amount:money("0")},
    {line_name:"SAQUE_CREDITO_EXTERIOR",available_amount:money("0"),limit_amount:money("0"),used_amount:money("0")},
    {line_name:"CREDITO_PARCELADO",available_amount:money("875.25"),limit_amount:money("1500"),used_amount:money("624.75")},
    {line_name:"OUTROS",available_amount:null,limit_amount:money("5000"),used_amount:money("1000")},
  ]};
  const lines=normalizeLimits(input);
  expect(lines.map(line=>line.available_amount)).toEqual(["321.45","0","0","875.25",null]);
  expect(new Set(lines.map(line=>line.line_key)).size).toBe(5);
  expect(lines[4].available_amount).not.toBe("4000");
});
