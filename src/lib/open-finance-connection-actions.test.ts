import {expect,it} from "vitest";
import {canArchiveBankConnection,canDisconnectBank} from "./open-finance-connection-actions";
import type {BankConnection} from "./open-finance-display";
const connection=(changes:Partial<BankConnection>):BankConnection=>({id:"test",institution_name:"Test bank",status:"pending",provider_status:null,scopes:[],consent_expires_at:null,revoked_at:null,last_successful_sync_at:null,created_at:"2026-10-11",...changes});
it("offers archival for inactive connections with or without imported history in either platform",()=>{
  for(const institution_name of ["Bank PF","Bank PJ"])for(const has_imported_data of [false,true])for(const status of ["pending","error","expired","revoking","revoked"])expect(canArchiveBankConnection(connection({institution_name,status,has_imported_data}))).toBe(true);
  for(const c of [{status:"active",has_imported_data:false},{status:"active",has_imported_data:true},{status:"pending"},{status:"unknown",has_imported_data:false},{status:"revoked",has_imported_data:true,archived_at:"2026-10-11"}])expect(canArchiveBankConnection(connection(c))).toBe(false);
});
it("keeps disconnection available for imported bank products even when the authorization has an error or has expired",()=>{
  for(const status of ["active","error","expired","revoking"])expect(canDisconnectBank(connection({status,has_imported_data:true}))).toBe(true);
  expect(canDisconnectBank(connection({status:"revoked",has_imported_data:true}))).toBe(false);
  expect(canDisconnectBank(connection({status:"pending",has_imported_data:false}))).toBe(false);
  expect(canDisconnectBank(connection({status:"error",has_imported_data:false}))).toBe(false);
  expect(canDisconnectBank(connection({status:"active",has_imported_data:true,archived_at:"2026-10-11"}))).toBe(false);
});
