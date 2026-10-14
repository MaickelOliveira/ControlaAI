import {expect,it} from "vitest";
import {googleEventCommandIdentity,googleEventChangePayload,googleEventChangeBody,googleEventChangeMatches} from "./google-event-command-policy";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",operationId="ffffffff-ffff-4fff-8fff-fffffffffff1";
const input={summary:"Fixture",description:"Note",location:"Office",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"weekly",attendees:[{email:"Guest@example.test",displayName:"Local name"}]};
it("canonicalizes/freeze controlled edits without provider, owner or conference controls",()=>{
 const payload=googleEventChangePayload(input);expect(payload.startAt).toBe("2070-01-01T10:00:00.000Z");expect(Object.isFrozen(payload)).toBe(true);expect(Object.isFrozen(payload.attendees[0])).toBe(true);
 for(const key of ["withMeet","owner","calendarId","extendedProperties","conferenceData"]){expect(()=>googleEventChangePayload({...input,[key]:true})).toThrow("GOOGLE_EVENT_COMMAND_INVALID");}
 expect(()=>googleEventChangePayload({...input,startAt:"2070-01-01T10:00:00"})).toThrow();
});
it("reserves one stable new conference identity per explicit operation and exact workspace/event",()=>{
 const id=googleEventCommandIdentity(scope,eventId,operationId);expect(id).toMatch(/^[a-f0-9]{64}$/);
 expect(googleEventCommandIdentity(scope,eventId.toUpperCase(),operationId.toUpperCase())).toBe(id);
 expect(googleEventCommandIdentity({...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},eventId,operationId)).not.toBe(id);
 expect(googleEventCommandIdentity(scope,eventId,"ffffffff-ffff-4fff-8fff-fffffffffff2")).not.toBe(id);
 expect(()=>googleEventCommandIdentity(scope,eventId,"bad")).toThrow("GOOGLE_EVENT_COMMAND_INVALID");
});
it("creates a narrow full PATCH including explicit array clearing and no conference request",()=>{
 const payload=googleEventChangePayload({...input,repeat:"none",attendees:[]});const body=googleEventChangeBody(payload);
 expect(body).toEqual({summary:"Fixture",description:"Note",location:"Office",start:{dateTime:payload.startAt,timeZone:"America/Sao_Paulo"},end:{dateTime:payload.endAt,timeZone:"America/Sao_Paulo"},recurrence:[],attendees:[]});
 expect(body).not.toHaveProperty("id");expect(body).not.toHaveProperty("conferenceData");
});
it("reconciles controlled data while allowing Google enrichment, email case and equivalent instants",()=>{
 const payload=googleEventChangePayload(input),event={...googleEventChangeBody(payload),start:{dateTime:"2070-01-01T07:00:00-03:00",timeZone:"America/Sao_Paulo"},attendees:[{email:"guest@EXAMPLE.test",displayName:"Google name",responseStatus:"accepted"}]};
 expect(googleEventChangeMatches(payload,event)).toBe(true);
 for(const changed of [{summary:"Foreign title"},{location:"Other place"},{description:"Other note"},{recurrence:["RRULE:FREQ=DAILY"]},{start:{dateTime:"2070-01-01T09:00:00Z"}},{attendees:[{email:"another@example.test"}]}]){
  expect(googleEventChangeMatches(payload,{...event,...changed})).toBe(false);
 }
 expect(googleEventChangeMatches(payload,{...event,attendees:[...event.attendees,...event.attendees]})).toBe(false);
 expect(googleEventChangeMatches(payload,{...event,recurrence:["RRULE:FREQ=WEEKLY","EXDATE:20700102"]})).toBe(false);
});
it("keeps all-day exclusive dates and recognizes omitted empty fields without accepting malformed values",()=>{
 const payload=googleEventChangePayload({...input,description:"",location:"",startAt:"2070-01-01",endAt:"2070-01-02",allDay:true,repeat:"none",attendees:[]});
 const body=googleEventChangeBody(payload);expect(body.start).toEqual({date:"2070-01-01"});expect(body.end).toEqual({date:"2070-01-02"});
 expect(googleEventChangeMatches(payload,{summary:payload.summary,start:body.start,end:body.end})).toBe(true);
 for(const value of [null,[],{...body,start:{date:"2070-01-02"}},{...body,attendees:{}},{...body,location:42}])expect(googleEventChangeMatches(payload,value)).toBe(false);
});
