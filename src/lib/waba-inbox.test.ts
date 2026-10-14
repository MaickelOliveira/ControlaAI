import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({from:vi.fn(),upsert:vi.fn(),rpc:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:m.from,rpc:m.rpc})}));
import {enqueueWabaMessages,claimWabaMessage,beginWabaDispatch,finishWabaMessage} from "./waba-inbox";
const message={id:"wamid.fixture",from:"5511999990000",type:"text",text:{body:"fictício"}};
beforeEach(()=>{for(const mock of Object.values(m))mock.mockReset();m.from.mockReturnValue({upsert:m.upsert});m.upsert.mockResolvedValue({error:null});m.rpc.mockResolvedValue({data:[],error:null});});

it("stores original verified input once and leaves an older receipt untouched on retry",async()=>{
 await enqueueWabaMessages([message],"Contato fictício",Date.UTC(2026,9,14));
 expect(m.upsert).toHaveBeenCalledWith([expect.objectContaining({message_id:"wamid.fixture",payload:message,state:"queued",processed_at:null})],{onConflict:"message_id",ignoreDuplicates:true});
});

it.each([{...message,id:undefined},{...message,id:"bad\nID"},{...message,from:"not a phone"}])("rejects an input that cannot have a stable receipt %#",async invalid=>{
 await expect(enqueueWabaMessages([invalid],undefined,Date.now())).rejects.toThrow("WABA_INBOX_INVALID");
 expect(m.from).not.toHaveBeenCalled();
});

it("returns one leased saved message and refuses an invalid database receipt",async()=>{
 m.rpc.mockResolvedValueOnce({data:[{message_id:"wamid.fixture",payload:message,contact_name:"Contato",received_at:"2026-10-14T15:00:00Z",lease_token:"fixture-lease"}],error:null});
 expect(await claimWabaMessage()).toMatchObject({messageId:"wamid.fixture",message,leaseToken:"fixture-lease"});
 m.rpc.mockResolvedValueOnce({data:[{message_id:"wamid.fixture",payload:null,received_at:"bad",lease_token:"fixture-lease"}],error:null});
 await expect(claimWabaMessage()).rejects.toThrow("WABA_INBOX_INVALID");
});

it("does not start or finish a customer action without a matching database lease",async()=>{
 m.rpc.mockResolvedValueOnce({data:false,error:null});
 await expect(beginWabaDispatch("wamid.fixture","fixture-lease")).rejects.toThrow("WABA_INBOX_UNAVAILABLE");
 m.rpc.mockResolvedValueOnce({data:false,error:null});
 await expect(finishWabaMessage("wamid.fixture","fixture-lease","succeeded")).rejects.toThrow("WABA_INBOX_UNAVAILABLE");
});
