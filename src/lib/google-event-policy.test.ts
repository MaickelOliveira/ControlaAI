import {expect,it} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
import type {GoogleBinding} from "./google-binding-store";
import {googleEventOriginFromStorage,googleEventOperationTarget,googleEventRetryIdentity} from "./google-event-policy";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
function stored(patch:Record<string,unknown>={}){return {user_id:owner,mode:"business",company_id:company,event_id:eventId,binding_id:bindingId,grant_id:grantId,calendar_id:"original-calendar",remote_event_id:"0123456789abcdefghijklmnopqrstuv",...patch};}
function binding(patch:Partial<GoogleBinding>={}):GoogleBinding{return {id:bindingId,workspace:scope,grantId,calendarId:"newly-selected-calendar",calendarName:"New choice",version:"7",unlinkedAt:null,...patch};}
it("returns immutable allowlisted provenance retaining the event's original calendar",()=>{
 const origin=googleEventOriginFromStorage(scope,eventId,stored({access_ciphertext:"fictitious-private",email:"fictitious@example.invalid"}));
 expect(origin).toEqual({workspace:scope,eventId,bindingId,grantId,calendarId:"original-calendar",remoteEventId:"0123456789abcdefghijklmnopqrstuv"});
 expect(Object.isFrozen(origin)).toBe(true);expect(Object.isFrozen(origin.workspace)).toBe(true);expect(JSON.stringify(origin)).not.toContain("fictitious");
 const target=googleEventOperationTarget(scope,eventId,origin,binding());expect(target.calendarId).toBe("original-calendar");expect(Object.isFrozen(target)).toBe(true);
});
it("requires provenance instead of guessing it from a current connection",()=>{
 expect(()=>googleEventOriginFromStorage(scope,eventId,null)).toThrow("GOOGLE_EVENT_ORIGIN_REQUIRED");
 expect(()=>googleEventOperationTarget(scope,eventId,null,binding())).toThrow("GOOGLE_EVENT_ORIGIN_REQUIRED");
});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},{mode:"personal"},{company_id:null},{mode:"unknown"},{event_id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2"},{binding_id:"bad"},{grant_id:"bad"},{calendar_id:""},{calendar_id:"bad\nid"},{remote_event_id:""},{remote_event_id:"bad/remote"},{remote_event_id:"x".repeat(1025)}])("rejects malformed or foreign stored provenance %#",patch=>{
 expect(()=>googleEventOriginFromStorage(scope,eventId,stored(patch))).toThrow("GOOGLE_EVENT_ORIGIN_INVALID");
});
it.each([null,binding({id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc2"}),binding({grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"}),binding({unlinkedAt:"2026-10-13T12:00:00Z"}),binding({workspace:{...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"}}),binding({workspace:{...scope,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}})])("denies a missing/unlinked/different active binding rather than changing event origin %#",active=>{
 const original=googleEventOriginFromStorage(scope,eventId,stored());
 expect(()=>googleEventOperationTarget(scope,eventId,original,active)).toThrow("GOOGLE_EVENT_ACCESS_DENIED");expect(original.calendarId).toBe("original-calendar");
});
it("does not let an authorized event ID borrow another event's provenance in the same space",()=>{
 const original=googleEventOriginFromStorage(scope,eventId,stored());
 expect(()=>googleEventOperationTarget(scope,"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",original,binding())).toThrow("GOOGLE_EVENT_ACCESS_DENIED");
});
it("accepts only null-company personal provenance and keeps it separate from business",()=>{
 const personal:GoogleWorkspace={userId:owner,mode:"personal",companyId:null};
 const origin=googleEventOriginFromStorage(personal,eventId,stored({mode:"personal",company_id:null}));
 expect(googleEventOperationTarget(personal,eventId,origin,binding({workspace:personal})).workspace).toEqual(personal);
 expect(()=>googleEventOperationTarget(scope,eventId,origin,binding())).toThrow("GOOGLE_EVENT_ACCESS_DENIED");
 expect(()=>googleEventOriginFromStorage(personal,eventId,stored({mode:"personal"}))).toThrow("GOOGLE_EVENT_ORIGIN_INVALID");
});
it("copies mutable source values before a caller can change event or workspace memory",()=>{
 const input=stored(),expected={...scope};const origin=googleEventOriginFromStorage(expected,eventId,input);
 input.calendar_id="mutated-calendar";input.company_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";expected.companyId=input.company_id;
 expect(origin.calendarId).toBe("original-calendar");expect(origin.workspace.companyId).toBe(company);
});
it.each(["",null,"bad-id","eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1\n"])("rejects unusable local retry identity %#",id=>{
 expect(()=>googleEventRetryIdentity(scope,id as string)).toThrow("GOOGLE_EVENT_IDENTITY_INVALID");
});
it.each([{...scope,companyId:null},{...scope,userId:"bad"},{...scope,mode:"unknown"},{...scope,mode:"personal"}])("does not derive a retry identity from an invalid workspace %#",target=>{
 expect(()=>googleEventRetryIdentity(target as GoogleWorkspace,eventId)).toThrow("GOOGLE_EVENT_IDENTITY_INVALID");
});
it("rejects malformed typed origin/binding values and returns only fixed error codes",()=>{
 const original=googleEventOriginFromStorage(scope,eventId,stored());
 const error=(()=>{try{googleEventOperationTarget(scope,eventId,{...original,calendarId:"\nfictitious-private-detail"},binding());}catch(error){return error;}})();
 expect(error).toBeInstanceOf(Error);expect((error as Error).message).toBe("GOOGLE_EVENT_ACCESS_DENIED");expect(error).not.toHaveProperty("cause");expect((error as Error).stack).not.toContain("private-detail");
 expect(()=>googleEventOperationTarget(scope,eventId,original,binding({unlinkedAt:undefined}))).toThrow("GOOGLE_EVENT_ACCESS_DENIED");
});
it("gives a logical event stable Google and conference IDs for every retry",()=>{
 const first=googleEventRetryIdentity(scope,eventId),again=googleEventRetryIdentity({...scope,userId:owner.toUpperCase(),companyId:company.toUpperCase()},eventId.toUpperCase());
 expect(first).toEqual(again);expect(first.remoteEventId).toMatch(/^[a-v0-9]{5,1024}$/);expect(first.conferenceRequestId).toMatch(/^[a-f0-9]{64}$/);expect(Object.isFrozen(first)).toBe(true);
});
it("keeps the v1 persisted identity format stable for a known fictitious event",()=>{
 expect(googleEventRetryIdentity(scope,eventId)).toEqual({remoteEventId:"d934f5d97e6acdcbe1197467166e5886d9332f9ab104515d9f9093d3b3d9c176",conferenceRequestId:"a18841780dd5b9edde36631d78d63ca1779e122c426e09c6f6e6c494e85d703e"});
});
it("separates identities across owners, workspaces and local events",()=>{
 const identities=[googleEventRetryIdentity(scope,eventId),googleEventRetryIdentity({...scope,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},eventId),googleEventRetryIdentity({...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},eventId),googleEventRetryIdentity({userId:owner,mode:"personal",companyId:null},eventId),googleEventRetryIdentity(scope,"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2")];
 expect(new Set(identities.map(v=>v.remoteEventId)).size).toBe(5);expect(new Set(identities.map(v=>v.conferenceRequestId)).size).toBe(5);
 expect(identities.every(v=>v.remoteEventId!==v.conferenceRequestId)).toBe(true);
});
