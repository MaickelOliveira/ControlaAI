import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({claim:vi.fn(),process:vi.fn(),attention:vi.fn()}));
vi.mock("./waba-inbox",()=>({claimWabaMessage:m.claim,wabaInboxAttentionCount:m.attention,cleanupWabaInbox:vi.fn()}));
vi.mock("./waba-process",()=>({processWabaMessage:m.process}));
vi.mock("./company-context",()=>({runWithTrustedCompanyJob:(callback:()=>Promise<unknown>)=>callback()}));
import {pumpWabaInbox} from "./waba-worker";
beforeEach(()=>{for(const mock of Object.values(m))mock.mockReset();m.process.mockResolvedValue(undefined);});

it("recovers a message already saved in the inbox without a live webhook request",async()=>{
 const saved={messageId:"fixture",message:{id:"fixture",from:"5511999990000",type:"text"},leaseToken:"lease",receivedAt:Date.now()};
 m.claim.mockResolvedValueOnce(saved).mockResolvedValueOnce(null);
 expect(await pumpWabaInbox()).toBe(1);
 expect(m.process).toHaveBeenCalledWith(saved);
});

it("limits each recovery pass so one busy inbox cannot hold the worker forever",async()=>{
 m.claim.mockResolvedValue({messageId:"fixture"});
 expect(await pumpWabaInbox()).toBe(10);
 expect(m.process).toHaveBeenCalledTimes(10);
});
