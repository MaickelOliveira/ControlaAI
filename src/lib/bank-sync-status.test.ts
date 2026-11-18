import {describe,expect,it} from "vitest";
import {bankSyncStatus} from "./bank-sync-status";
import type {BankConnection} from "./open-finance-display";
import type {BankFinancialData,BankReport} from "./open-finance-report";

const now="2026-11-18T16:30:00.000Z";
const completed="2026-11-18T15:00:00.000Z";
function bank(connection:Partial<BankConnection>={},report:Partial<BankReport>&{sync_status?:"idle"|"updating"|"failed"}={}):BankFinancialData {
 return {
  report:{from:"2026-11-01",to:"2026-11-30",history_complete:false,totals:[],movements:[],next:null,missing_dates:0,sync_pending:false,last_successful_sync_at:completed,...report},
  overview:{connections:[{id:"connection-1",institution_name:"Banco de teste",status:"active",provider_status:"AUTHORISED",scopes:["ACCOUNT"],consent_expires_at:null,revoked_at:null,last_successful_sync_at:completed,created_at:"2026-11-01T12:00:00.000Z",...connection}],resources:[],limits:[],bills:[],credit:[],sync:[]},
 };
}

describe("bank synchronization indicator",()=>{
 it("reports a failed import instead of updating when legacy pending also includes the failure",()=>{
  const result=bankSyncStatus(bank({}, {sync_pending:true,sync_status:"failed"}),false,now);
  expect(result?.state).toBe("failed");
  expect(`${result?.title} ${result?.detail}`).not.toMatch(/atualizando/i);
 });
 it("shows updating while an authorized bank has a queued or running import",()=>{
  expect(bankSyncStatus(bank({}, {sync_pending:true,sync_status:"updating"}),false,now)?.state).toBe("updating");
 });
 it.each([
  {status:"expired",provider_status:"EXPIRED"},
  {status:"error",provider_status:"REJECTED"},
  {status:"revoked",provider_status:"REVOKED",revoked_at:"2026-11-18T15:30:00.000Z"},
 ])("does not show a past successful import as current authorization: %j",connection=>{
  const result=bankSyncStatus(bank(connection),false,now);
  expect(result?.state).toBe("authorization");
  expect(`${result?.title} ${result?.detail}`).not.toMatch(/bancos atualizados|atualizando/i);
 });
 it.each(["2026-11-17T16:30:00.000Z",now])("recognizes consent expiry even while the stored status remains active: %s",expires=>{
  expect(bankSyncStatus(bank({consent_expires_at:expires}),false,now)?.state).toBe("authorization");
 });
 it("ignores an archived failed authorization when the remaining bank is synchronized",()=>{
  const data=bank();
  data.overview.connections.push({...data.overview.connections[0],id:"archived",status:"expired",provider_status:"EXPIRED",archived_at:"2026-11-17T12:00:00.000Z"});
  expect(bankSyncStatus(data,false,now)?.state).toBe("updated");
 });
 it("waits for the first successful import instead of showing green",()=>{
  expect(bankSyncStatus(bank({last_successful_sync_at:null},{last_successful_sync_at:null}),false,now)?.state).toBe("waiting");
 });
 it("does not hide a bank awaiting its first import behind another bank's success",()=>{
  const data=bank();
  data.overview.connections.push({...data.overview.connections[0],id:"new-bank",last_successful_sync_at:null});
  expect(bankSyncStatus(data,false,now)?.state).toBe("waiting");
 });
 it("shows the last successful update date after all active banks finish",()=>{
  const result=bankSyncStatus(bank({}, {sync_status:"idle"}),false,now);
  expect(result?.state).toBe("updated");
  expect(`${result?.title} ${result?.detail}`).toContain("18/11/2026");
 });
 it("does not leave a stale green status when reading the current status fails",()=>{
  expect(bankSyncStatus(bank(),true,now)?.state).toBe("failed");
 });
 it("identifies the bank awaiting more source data without presenting an import failure",()=>{
  const result=bankSyncStatus(bank({institution_name:"Banco Inter PJ",sync_notes:["SOURCE_PARTIAL","RESOURCES_PENDING"]},{sync_status:"idle"}),false,now);
  expect(result?.state).toBe("waiting");
  expect(result?.detail).toContain("Banco Inter PJ");
  expect(result?.detail).toMatch(/automaticamente/i);
  expect(`${result?.title} ${result?.detail}`).not.toMatch(/falha|confira em contas/i);
 });
 it("keeps usable imported data synchronized while source categories are enriched",()=>{
  expect(bankSyncStatus(bank({sync_notes:["ENRICHMENT_PENDING"]},{sync_status:"idle"}),false,now)?.state).toBe("updated");
  expect(bankSyncStatus(bank({sync_notes:["ENRICHMENT_PENDING"]},{sync_status:"failed"}),false,now)?.state).toBe("failed");
 });
 it("waits when authorized resources have not yet been sent by the provider",()=>{
  expect(bankSyncStatus(bank({sync_notes:["RESOURCES_PENDING"]},{sync_status:"idle"}),false,now)?.state).toBe("waiting");
 });
 it("does not invent a synchronization status without a current bank connection",()=>{
  expect(bankSyncStatus(null,false,now)).toBeNull();
  expect(bankSyncStatus(undefined,false,now)).toBeNull();
  const data=bank();data.overview.connections=[];
  expect(bankSyncStatus(data,false,now)).toBeNull();
  data.overview.connections=[bank({archived_at:now}).overview.connections[0]];
  expect(bankSyncStatus(data,false,now)).toBeNull();
 });
});
