import {expect,it} from "vitest";
import {canRemoveBankAttempt} from "./open-finance-connection-actions";
import type {BankConnection} from "./open-finance-display";
it("offers removal only for inactive attempts with confirmed absence of imported products",()=>{
  for(const status of ["pending","error","expired","revoking","revoked"])expect(canRemoveBankAttempt({status,has_imported_data:false} as BankConnection)).toBe(true);
  for(const c of [{status:"active",has_imported_data:false},{status:"error",has_imported_data:true},{status:"pending"},{status:"unknown",has_imported_data:false}])expect(canRemoveBankAttempt(c as BankConnection)).toBe(false);
});
