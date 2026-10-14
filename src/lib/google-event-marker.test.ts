import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {googleEventRetryIdentity} from "./google-event-policy";
import type {GoogleEventIntent} from "./google-event-origin-store";
import {assertGoogleEventProviderMarkers,googleEventProviderMarkers,googleEventCommandMarker,assertGoogleEventCommandMarker} from "./google-event-marker";
import {googleEventCommandIdentity} from "./google-event-command-policy";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",fingerprint="a".repeat(64);
const intent:GoogleEventIntent={workspace:scope,eventId,bindingId:"cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd1",calendarId:"fixture-calendar",bindingVersion:"7",...googleEventRetryIdentity(scope,eventId)};
beforeEach(()=>vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-event-marker-key-only"));
afterEach(()=>vi.unstubAllEnvs());
it("signs deterministic domain-separated compact private markers without serializing identity or secrets",()=>{
 const marker=googleEventProviderMarkers(intent,fingerprint,true);
 expect(marker).toEqual(googleEventProviderMarkers(intent,fingerprint,true));expect(marker.zeloOrigin).not.toBe(marker.zeloCreation);
 for(const [key,value] of Object.entries(marker)){expect(key.length).toBeLessThan(44);expect(value).toMatch(/^[a-f0-9]{64}$/);}
 expect(Object.isFrozen(marker)).toBe(true);expect(JSON.stringify(marker)).not.toContain("fixture");expect(JSON.stringify(marker)).not.toContain(scope.userId);
 expect(()=>assertGoogleEventProviderMarkers(intent,fingerprint,true,{...marker,otherProviderField:"allowed"})).not.toThrow();
});
it.each([null,{},[],{zeloOrigin:"a".repeat(64),zeloCreation:"b".repeat(64)}])("rejects missing/unsigned/foreign markers",value=>{
 expect(()=>assertGoogleEventProviderMarkers(intent,fingerprint,true,value)).toThrow("GOOGLE_EVENT_MARKER_INVALID");
});
it("rejects altered marker bytes, swapped domains and trailing newline",()=>{
 const marker=googleEventProviderMarkers(intent,fingerprint,true);
 for(const changed of [{...marker,zeloOrigin:marker.zeloOrigin.replace(/^./,marker.zeloOrigin[0]==="0"?"1":"0")},{zeloOrigin:marker.zeloCreation,zeloCreation:marker.zeloOrigin},{...marker,zeloCreation:marker.zeloCreation+"\n"}]){
  expect(()=>assertGoogleEventProviderMarkers(intent,fingerprint,true,changed)).toThrow("GOOGLE_EVENT_MARKER_INVALID");
 }
});
it("binds owner, workspace, account, original calendar/revision, event and operation payload",()=>{
 const marker=googleEventProviderMarkers(intent,fingerprint,true);
 const foreignScope={...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"};
 const otherId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
 for(const changed of [{...intent,workspace:foreignScope,...googleEventRetryIdentity(foreignScope,eventId)},{...intent,eventId:otherId,...googleEventRetryIdentity(scope,otherId)},
  {...intent,calendarId:"another-calendar"},{...intent,bindingVersion:"8"},{...intent,bindingId:"cccccccc-cccc-4ccc-8ccc-ccccccccccc2"},{...intent,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"}]){
  expect(()=>assertGoogleEventProviderMarkers(changed,fingerprint,true,marker)).toThrow("GOOGLE_EVENT_MARKER_INVALID");
 }
 expect(()=>assertGoogleEventProviderMarkers(intent,"b".repeat(64),true,marker)).toThrow("GOOGLE_EVENT_MARKER_INVALID");
 expect(()=>assertGoogleEventProviderMarkers(intent,fingerprint,false,marker)).toThrow("GOOGLE_EVENT_MARKER_INVALID");
 vi.stubEnv("DATA_ENCRYPTION_KEY","another-fictitious-key");expect(()=>assertGoogleEventProviderMarkers(intent,fingerprint,true,marker)).toThrow("GOOGLE_EVENT_MARKER_INVALID");
});
it.each([{...intent,remoteEventId:"0".repeat(64)},{...intent,conferenceRequestId:"0".repeat(64)},{...intent,bindingVersion:"0"},{...intent,bindingVersion:7},{...intent,calendarId:"bad\0calendar"},null])("rejects malformed intent before signing",value=>{
 expect(()=>googleEventProviderMarkers(value as GoogleEventIntent,fingerprint,true)).toThrow("GOOGLE_EVENT_MARKER_INVALID");
});
it("fails closed without a configured key and hides the underlying configuration diagnostic",()=>{
 vi.stubEnv("DATA_ENCRYPTION_KEY","");
 try{googleEventProviderMarkers(intent,fingerprint,true);throw Error("unexpected success");}catch(error){expect((error as Error).message).toBe("GOOGLE_EVENT_MARKER_UNAVAILABLE");expect((error as Error).cause).toBeUndefined();}
});
it("binds a separate command marker to immutable origin and one explicit persisted command",()=>{
 const operationId="ffffffff-ffff-4fff-8fff-fffffffffff1",command={operationId,headVersion:"3",kind:"conference" as const,payloadFingerprint:fingerprint,conferenceRequestId:googleEventCommandIdentity(scope,eventId,operationId)};
 const original=googleEventProviderMarkers(intent,fingerprint,true),marker=googleEventCommandMarker(intent,command);
 expect(marker).toMatch(/^[a-f0-9]{64}$/);expect(marker).not.toBe(original.zeloCreation);expect(marker).toBe(googleEventCommandMarker(intent,command));
 expect(()=>assertGoogleEventCommandMarker(intent,command,{...original,zeloCommand:marker})).not.toThrow();
 for(const changed of [{...command,headVersion:"4"},{...command,payloadFingerprint:"b".repeat(64)},{...command,kind:"update" as const,conferenceRequestId:null}]){
  expect(()=>assertGoogleEventCommandMarker(intent,changed,{zeloCommand:marker})).toThrow("GOOGLE_EVENT_COMMAND_MARKER_INVALID");
 }
 for(const changed of [{...command,operationId:"bad"},{...command,headVersion:"0"},{...command,conferenceRequestId:"0".repeat(64)}])expect(()=>googleEventCommandMarker(intent,changed)).toThrow("GOOGLE_EVENT_COMMAND_MARKER_INVALID");
 expect(()=>assertGoogleEventCommandMarker({...intent,calendarId:"other"},command,{zeloCommand:marker})).toThrow();
 expect(()=>assertGoogleEventCommandMarker(intent,command,{zeloCommand:marker+"\n"})).toThrow();
 expect(googleEventProviderMarkers(intent,fingerprint,true)).toEqual(original);
});
