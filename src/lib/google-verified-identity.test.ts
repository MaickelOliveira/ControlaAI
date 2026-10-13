import {createHash,createSign,generateKeyPairSync} from "node:crypto";
import {google} from "googleapis";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {GooglePendingState} from "./google-oauth-state";
import type {GoogleWorkspace} from "./google-workspace-policy";
vi.mock("server-only",()=>({}));
import {assertVerifiedGoogleIdentity,verifyGoogleIdentity,type VerifiedGoogleIdentity} from "./google-verified-identity";

const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const clientId="fixture-client.apps.googleusercontent.com",nonce="n".repeat(43);
const now=Date.parse("2026-10-13T12:00:00Z"),seconds=now/1000;
const workspace:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const pending:GooglePendingState={workspace,locale:"pt-BR",nonceHash:createHash("sha256").update("google-oauth-nonce\0"+nonce).digest("hex"),expiresAt:new Date(now+600_000).toISOString(),bindingVersion:"2"};
const keys=generateKeyPairSync("rsa",{modulusLength:2048});
const certs={fixture:keys.publicKey.export({type:"spki",format:"pem"}).toString()};
function token(patch:Record<string,unknown>={},signingKey=keys.privateKey,headerPatch:Record<string,unknown>={}){
  const header=Buffer.from(JSON.stringify({alg:"RS256",kid:"fixture",...headerPatch})).toString("base64url");
  const payload=Buffer.from(JSON.stringify({iss:"https://accounts.google.com",aud:clientId,sub:"fictitious-google-subject",iat:seconds,exp:seconds+3600,nonce,email:"fixture@example.invalid",...patch})).toString("base64url");
  const message=`${header}.${payload}`;
  return `${message}.${createSign("RSA-SHA256").update(message).sign(signingKey,"base64url")}`;
}
type CertificateResponse=Awaited<ReturnType<typeof google.auth.OAuth2.prototype.getFederatedSignonCertsAsync>>;
const certificateResponse={certs,format:"PEM" as CertificateResponse["format"]};
let certificates:ReturnType<typeof vi.spyOn>;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  certificates=vi.spyOn(google.auth.OAuth2.prototype,"getFederatedSignonCertsAsync").mockResolvedValue(certificateResponse);
});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

describe("verified Google identity boundary",()=>{
  it("verifies a real RSA signature and binds the subject to captured owner, company and client",async()=>{
    const idToken=token();
    const identity=await verifyGoogleIdentity(idToken,clientId,pending);
    expect(identity.subject).toBe("fictitious-google-subject");
    expect(identity.workspace).toEqual(workspace);
    expect(identity.bindingVersion).toBe("2");
    expect(identity.clientFingerprint).toBe(createHash("sha256").update("google-oauth-client\0"+clientId).digest("hex"));
    expect(Object.isFrozen(identity)).toBe(true);expect(Object.isFrozen(identity.workspace)).toBe(true);
    expect(()=>assertVerifiedGoogleIdentity(identity,workspace,clientId)).not.toThrow();
    expect(JSON.stringify(identity)).not.toContain(idToken);
    expect(JSON.stringify(identity)).not.toContain("fixture@example.invalid");
    expect(identity).not.toHaveProperty("nonce");
  });

  it.each(["accounts.google.com","https://accounts.google.com"])("accepts the documented Google issuer %s",async iss=>{
    await expect(verifyGoogleIdentity(token({iss}),clientId,pending)).resolves.toMatchObject({subject:"fictitious-google-subject"});
  });
  it("accepts the same subject after an email change without using email as identity",async()=>{
    const a=await verifyGoogleIdentity(token(),clientId,pending);
    const b=await verifyGoogleIdentity(token({email:"changed@example.invalid"}),clientId,pending);
    expect(a.subject).toBe(b.subject);
  });
  it("keeps Personal independent of a company",async()=>{
    const personal={userId:owner,mode:"personal" as const,companyId:null};
    const identity=await verifyGoogleIdentity(token(),clientId,{...pending,workspace:personal});
    expect(identity.workspace).toEqual(personal);
  });
  it.each([
    {iss:"https://accounts.google.com.evil.invalid"},{iss:"http://accounts.google.com"},
    {aud:"other.apps.googleusercontent.com"},{aud:[clientId]},{azp:"other-client"},
    {sub:""},{sub:null},{sub:12},{sub:"subject with space"},{sub:"x".repeat(256)},
    {nonce:null},{nonce:"x".repeat(43)},{nonce:"short"},
    {exp:seconds},{exp:seconds-60},{exp:String(seconds+3600)},{exp:null},
    {iat:String(seconds)},{iat:null},{iat:seconds+61},{iat:seconds-61},{iat:seconds+301},{iat:seconds+4000},
  ])("rejects signed but invalid identity claims %#",async patch=>{
    await expect(verifyGoogleIdentity(token(patch),clientId,pending)).rejects.toThrow("GOOGLE_IDENTITY_INVALID");
  });
  it("rejects a JWT signed with a different key and hides the SDK error containing the token",async()=>{
    const other=generateKeyPairSync("rsa",{modulusLength:2048});
    const idToken=token({},other.privateKey);
    const error=await verifyGoogleIdentity(idToken,clientId,pending).catch(e=>e);
    expect(error.message).toBe("GOOGLE_IDENTITY_INVALID");
    expect(error).not.toHaveProperty("cause");
    expect(error.stack).not.toContain(idToken);
  });
  it.each([null,"",12,"x".repeat(32769)])("rejects unusable ID tokens before certificate retrieval %#",async invalid=>{
    await expect(verifyGoogleIdentity(invalid as string,clientId,pending)).rejects.toThrow("GOOGLE_IDENTITY_INVALID");
    expect(certificates).not.toHaveBeenCalled();
  });
  it.each([null,"", "client with space", "x".repeat(1025)])("rejects unusable configured clients before retrieval %#",async invalid=>{
    await expect(verifyGoogleIdentity(token(),invalid as string,pending)).rejects.toThrow("GOOGLE_IDENTITY_INVALID");
    expect(certificates).not.toHaveBeenCalled();
  });
  it.each([
    null,[],{...pending,expiresAt:new Date(now).toISOString()},{...pending,expiresAt:"invalid"},
    {...pending,expiresAt:new Date(now+660_001).toISOString()},
    {...pending,bindingVersion:null},{...pending,bindingVersion:2},{...pending,bindingVersion:"-1"},
    {...pending,bindingVersion:"9223372036854775808"},
    {...pending,nonceHash:"bad"},{...pending,workspace:{...workspace,userId:"bad"}},
    {...pending,workspace:{...workspace,companyId:null}},
  ])("rejects unusable captured state before retrieval %#",async invalid=>{
    await expect(verifyGoogleIdentity(token(),clientId,invalid as GooglePendingState)).rejects.toThrow("GOOGLE_IDENTITY_INVALID");
    expect(certificates).not.toHaveBeenCalled();
  });
  it("hides network and certificate retrieval details",async()=>{
    certificates.mockRejectedValue(Error("fictitious private provider diagnostic"));
    const error=await verifyGoogleIdentity(token(),clientId,pending).catch(e=>e);
    expect(error.message).toBe("GOOGLE_IDENTITY_INVALID");expect(error.stack).not.toContain("private provider");
  });
  it.each([{alg:"none"},{alg:"HS256"},{kid:""},{kid:"with space"},{crit:["unknown"]},{b64:false}])("rejects unsupported JWT headers before retrieving certificates %#",async header=>{
    await expect(verifyGoogleIdentity(token({},keys.privateKey,header),clientId,pending)).rejects.toThrow("GOOGLE_IDENTITY_INVALID");
    expect(certificates).not.toHaveBeenCalled();
  });
  it("captures the nonce before asynchronous verification and refuses later caller changes",async()=>{
    let complete!:(result:CertificateResponse)=>void;
    certificates.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const selected=structuredClone(pending);
    const alteredNonce="x".repeat(43);
    const verifying=verifyGoogleIdentity(token({nonce:alteredNonce}),clientId,selected);
    (selected as {nonceHash:string}).nonceHash=createHash("sha256").update("google-oauth-nonce\0"+alteredNonce).digest("hex");
    complete(certificateResponse);
    await expect(verifying).rejects.toThrow("GOOGLE_IDENTITY_INVALID");
  });
  it("rejects a state that expires during certificate retrieval",async()=>{
    certificates.mockImplementation(async()=>{vi.setSystemTime(now+600_000);return certificateResponse;});
    await expect(verifyGoogleIdentity(token(),clientId,pending)).rejects.toThrow("GOOGLE_IDENTITY_INVALID");
  });
  it("keeps the issued revision if caller state changes during asynchronous verification",async()=>{
    let complete!:(result:CertificateResponse)=>void;
    certificates.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const selected=structuredClone(pending);
    const verifying=verifyGoogleIdentity(token(),clientId,selected);
    (selected as {bindingVersion:string}).bindingVersion="9";
    complete(certificateResponse);
    expect((await verifying).bindingVersion).toBe("2");
  });
  it("does not keep the proof valid after a shorter-lived ID token expires",async()=>{
    const identity=await verifyGoogleIdentity(token({exp:seconds+60}),clientId,pending);
    vi.setSystemTime(now+60_000);
    expect(()=>assertVerifiedGoogleIdentity(identity,workspace,clientId)).toThrow("GOOGLE_IDENTITY_INVALID");
  });
  it("rejects copied, reconstructed and foreign workspace/client proofs",async()=>{
    const identity=await verifyGoogleIdentity(token(),clientId,pending);
    for(const invalid of [{...identity},JSON.parse(JSON.stringify(identity)),null])expect(()=>assertVerifiedGoogleIdentity(invalid as VerifiedGoogleIdentity,workspace,clientId)).toThrow("GOOGLE_IDENTITY_INVALID");
    for(const invalid of [{...workspace,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{...workspace,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},{userId:owner,mode:"personal" as const,companyId:null}])expect(()=>assertVerifiedGoogleIdentity(identity,invalid,clientId)).toThrow("GOOGLE_IDENTITY_INVALID");
    expect(()=>assertVerifiedGoogleIdentity(identity,workspace,"other-client")).toThrow("GOOGLE_IDENTITY_INVALID");
  });
  it("does not mutate caller state and expires the proof when captured state expires",async()=>{
    const original=structuredClone(pending),selected=structuredClone(pending);
    const identity=await verifyGoogleIdentity(token(),clientId,selected);
    expect(selected).toEqual(original);
    (selected.workspace as {companyId:string}).companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
    expect(identity.workspace).toEqual(workspace);
    vi.setSystemTime(now+600_000);
    expect(()=>assertVerifiedGoogleIdentity(identity,workspace,clientId)).toThrow("GOOGLE_IDENTITY_INVALID");
  });
});
