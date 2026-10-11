import {expect,it} from "vitest";
import {groupBankResources} from "./open-finance-grouping";
import type {BankOverview} from "./open-finance-display";
it("puts the account, card and renewed consent of one bank together while preserving all product identities",()=>{
  const data={connections:[{id:"c1",institution_name:"Bank A"},{id:"c2",institution_name:"Bank A"},{id:"c3",institution_name:"Bank B"}],resources:[{id:"account",connection_id:"c1",resource_type:"account"},{id:"card",connection_id:"c2",resource_type:"card"},{id:"other",connection_id:"c3",resource_type:"account"}]} as BankOverview;
  const groups=groupBankResources(data);
  expect(groups.map(g=>[g.name,g.resources.map(r=>r.id)])).toEqual([["Bank A",["account","card"]],["Bank B",["other"]]]);
});
