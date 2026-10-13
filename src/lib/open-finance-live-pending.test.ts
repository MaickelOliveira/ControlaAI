import {describe, expect, it} from "vitest";
import {bankUpdatesPending} from "./open-finance-live";

describe("live update states from read endpoints", () => {
  it.each(["pending", "revoking"])("keeps %s authorizations fast in overview and ledger results", status => {
    const overview={connections:[{status}],sync:[]};
    expect(bankUpdatesPending(overview)).toBe(true);
    expect(bankUpdatesPending({bank:{overview}})).toBe(true);
  });
  it.each(["pending", "running"])("keeps %s import jobs fast", status => {
    const overview={connections:[{status:"active"}],sync:[{status}]};
    expect(bankUpdatesPending(overview)).toBe(true);
    expect(bankUpdatesPending({bank:{overview}})).toBe(true);
  });
  it("allows stable failed watermarks and archived attempts to slow when no import is flagged", () => {
    expect(bankUpdatesPending({bank:{overview:{connections:[{status:"active"},{status:"pending",archived_at:"2026-10-12"}],sync:[{status:"failed"},{status:"complete"}]},report:{sync_pending:false}}})).toBe(false);
  });
  it.each([{sync:[]},{sync:[{status:"complete"}]},{sync:[{status:"failed"}]}])("keeps actual report activity fast even when the committed watermark is stale: %j", ({sync}) => {
    expect(bankUpdatesPending({bank:{overview:{connections:[{status:"active"}],sync},report:{sync_pending:true}}})).toBe(true);
  });
  it.each([null,undefined,{}, {bank:null}, {connections:[],sync:[]}, {connections:[null],sync:[null]}])("handles unavailable and empty JSON safely: %j", data => {
    expect(bankUpdatesPending(data)).toBe(false);
  });
});
