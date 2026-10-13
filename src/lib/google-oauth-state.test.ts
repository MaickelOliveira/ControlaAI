import {beforeEach,describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import type {GoogleWorkspace} from "./google-workspace-policy";
const storage=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>storage}));
import {issueGoogleOAuthState,consumeGoogleOAuthState,googleOAuthNonceMatches} from "./google-oauth-state";

const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const workspace:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const session="fictitious-authenticated-session";
const client="fixture-client.apps.googleusercontent.com";
const state="s".repeat(43),nonce="n".repeat(43);
const nonceHash=createHash("sha256").update("google-oauth-nonce\0"+nonce).digest("hex");
function row(patch:Record<string,unknown>={}){
  return {user_id:owner,mode:"business",company_id:company,locale:"pt-BR",nonce_hash:nonceHash,expires_at:new Date(Date.now()+600_000).toISOString(),...patch};
}
beforeEach(()=>{storage.rpc.mockReset().mockResolvedValue({data:null,error:null});});

describe("persistent Google state boundary",()=>{
  it("persists only random state/nonce and session/client hashes with immutable workspace IDs",async()=>{
    const result=await issueGoogleOAuthState(workspace,session,client,"pt-PT");
    expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.state).not.toBe(result.nonce);
    const [name,args]=storage.rpc.mock.calls[0];
    expect(name).toBe("zelo_google_state_issue");
    expect(args).toMatchObject({p_user_id:owner,p_mode:"business",p_company_id:company,p_locale:"pt-PT"});
    for(const field of ["p_state_hash","p_nonce_hash","p_session_hash","p_client_fingerprint"])expect(args[field]).toMatch(/^[a-f0-9]{64}$/);
    for(const raw of [result.state,result.nonce,session,client])expect(JSON.stringify(args)).not.toContain(raw);
    expect(googleOAuthNonceMatches(args.p_nonce_hash,result.nonce)).toBe(true);
  });
  it("uses different persisted hashes for different sessions and clients",async()=>{
    await issueGoogleOAuthState(workspace,session,client,"pt-BR");
    await issueGoogleOAuthState(workspace,session+"-other",client+"-other","pt-BR");
    expect(storage.rpc.mock.calls[0][1].p_session_hash).not.toBe(storage.rpc.mock.calls[1][1].p_session_hash);
    expect(storage.rpc.mock.calls[0][1].p_client_fingerprint).not.toBe(storage.rpc.mock.calls[1][1].p_client_fingerprint);
  });
  it("persists Personal with null company and canonical owner IDs",async()=>{
    await issueGoogleOAuthState({userId:owner.toUpperCase(),mode:"personal",companyId:null},session,client,"es");
    expect(storage.rpc.mock.calls[0][1]).toMatchObject({p_user_id:owner,p_mode:"personal",p_company_id:null,p_locale:"es"});
  });
  it.each([null,{...workspace,companyId:null},{...workspace,mode:"unknown"},{...workspace,userId:"bad"},{userId:owner,mode:"personal",companyId:company}])("rejects malformed workspace before storage %#",async bad=>{
    await expect(issueGoogleOAuthState(bad as GoogleWorkspace,session,client,"pt-BR")).rejects.toThrow();
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it.each(["",null,"x".repeat(16385)])("rejects unusable authenticated session before storage %#",async bad=>{
    await expect(issueGoogleOAuthState(workspace,bad as string,client,"pt-BR")).rejects.toThrow();
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it.each(["",null,"with whitespace","x".repeat(1025)])("rejects unusable OAuth client identity before storage %#",async bad=>{
    await expect(issueGoogleOAuthState(workspace,session,bad as string,"pt-BR")).rejects.toThrow();
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid locale before persistence",async()=>{
    await expect(issueGoogleOAuthState(workspace,session,client,"evil" as "pt-BR")).rejects.toThrow();
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it.each(["issue","consume"])("hides raw storage error details for %s",async operation=>{
    storage.rpc.mockResolvedValue({data:null,error:{message:"fictitious private database detail"}});
    const action=operation==="issue"?issueGoogleOAuthState(workspace,session,client,"pt-BR"):consumeGoogleOAuthState(owner,state,session,client);
    await expect(action).rejects.toThrow("GOOGLE_STATE_STORAGE_UNAVAILABLE");
    await expect(action).rejects.not.toThrow("fictitious private database detail");
  });
  it("returns the captured company even if other UI state changes, with no provider request",async()=>{
    storage.rpc.mockResolvedValue({data:row(),error:null});
    const result=await consumeGoogleOAuthState(owner,state,session,client);
    expect(result).toMatchObject({workspace,locale:"pt-BR",nonceHash});
    expect(Object.isFrozen(result?.workspace)).toBe(true);
    const [name,args]=storage.rpc.mock.calls[0];
    expect(name).toBe("zelo_google_state_consume");
    expect(args.p_user_id).toBe(owner);
    expect(args).not.toHaveProperty("p_company_id");
    for(const raw of [state,session,client])expect(JSON.stringify(args)).not.toContain(raw);
  });
  it("returns null for consumed, unknown or expired database state",async()=>{
    expect(await consumeGoogleOAuthState(owner,state,session,client)).toBeNull();
  });
  it.each([null,"", "x".repeat(42),"x".repeat(44),"!".repeat(43)])("rejects malformed state without requesting storage %#",async bad=>{
    expect(await consumeGoogleOAuthState(owner,bad as string,session,client)).toBeNull();
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it.each([
    {user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{user_id:"bad"},{mode:"unknown"},{company_id:null},
    {mode:"personal",company_id:company},{locale:"evil"},{nonce_hash:"bad"},{expires_at:"invalid"},
    {expires_at:new Date(0).toISOString()},
  ])("fails closed on corrupted state response %#",async patch=>{
    storage.rpc.mockResolvedValue({data:row(patch),error:null});
    await expect(consumeGoogleOAuthState(owner,state,session,client)).rejects.toThrow("GOOGLE_STATE_INVALID");
  });
  it("restores captured Personal independently from companies",async()=>{
    storage.rpc.mockResolvedValue({data:row({mode:"personal",company_id:null,locale:"es"}),error:null});
    expect(await consumeGoogleOAuthState(owner,state,session,client)).toMatchObject({workspace:{userId:owner,mode:"personal",companyId:null},locale:"es"});
  });
  it("matches only the issued nonce and handles invalid hashes without leaking it",()=>{
    expect(googleOAuthNonceMatches(nonceHash,nonce)).toBe(true);
    expect(googleOAuthNonceMatches(nonceHash,state)).toBe(false);
    expect(googleOAuthNonceMatches("bad",nonce)).toBe(false);
    expect(googleOAuthNonceMatches(nonceHash,"bad")).toBe(false);
  });
});
