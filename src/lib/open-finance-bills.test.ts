import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:m.rpc}));
import {readBankBill,prepareBankBill} from "./open-finance-bills";
const id="00000000-0000-4000-8000-000000000001",next="00000000-0000-4000-8000-000000000002";
const scope={userId:"own",mode:"personal",environment:"production"} as const;
const page={bill:{id,resource_id:"own-card",synced_at:"2026-10-11T10:00:00Z"},transactions:[{id:"tx"}],transactions_complete:false,next:null};
beforeEach(()=>{vi.resetAllMocks();});
it("paginates only a stable selected bill through the current holder scope",async()=>{
  m.rpc.mockResolvedValueOnce({...page,next}).mockResolvedValueOnce({...page,transactions:[{id:"tx2"}]});
  expect((await readBankBill(scope,id)).transactions).toHaveLength(2);
  expect(m.rpc.mock.calls[1]).toEqual([scope,"zelo_of_bill",{p_bill:id,p_after:next}]);
});
it("rejects a wrong bill or a changed snapshot instead of sending an inconsistent file",async()=>{
  m.rpc.mockResolvedValueOnce({...page,bill:{...page.bill,id:next}});await expect(readBankBill(scope,id)).rejects.toThrow();
  m.rpc.mockResolvedValueOnce({...page,next}).mockResolvedValueOnce({...page,bill:{...page.bill,synced_at:"2026-10-11T11:00:00Z"}});await expect(readBankBill(scope,id)).rejects.toThrow("OF_BILL_CHANGED");
});
it("propagates holder or mode denial without falling back to another resource",async()=>{
  m.rpc.mockRejectedValue(Error("OF_STORAGE_ERROR"));await expect(readBankBill(scope,id)).rejects.toThrow();expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("never selects a personal bill for an explicit company request, or a company bill for a personal request",async()=>{
  const user={id:"own",email:"holder@example.test",plan:"business",activeMode:"personal",status:"active"} as const;
  for(const [mode,message] of [["personal","envie a fatura da empresa"],["business","envie a fatura pessoal"]] as const){
    const result=await prepareBankBill(user,mode,message,"2026-10-11",false);expect(result?.text).toContain("Troque");expect(result?.billId).toBeUndefined();
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
