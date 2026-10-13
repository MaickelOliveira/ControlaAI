import {expect,it} from "vitest";
import {googleEventCreationPayload} from "./google-event-payload";
const input={summary:"Fixture event",description:"Line1\nLine2",location:"Fixture",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"none",attendees:[{email:"guest@example.test",displayName:"Fixture guest"}],withMeet:true};
it("copies and freezes only canonical creation fields before asynchronous storage/provider work",()=>{
 const result=googleEventCreationPayload(input);
 expect(result).toEqual({...input,startAt:"2070-01-01T10:00:00.000Z",endAt:"2070-01-01T11:00:00.000Z"});
 expect(result).not.toBe(input);expect(result.attendees).not.toBe(input.attendees);
 expect(Object.isFrozen(result)&&Object.isFrozen(result.attendees)&&Object.isFrozen(result.attendees[0])).toBe(true);
});
it("keeps explicit local all-day dates with exclusive end and supports existing recurrence modes",()=>{
 for(const repeat of ["none","daily","weekly","monthly","yearly"]){
  const result=googleEventCreationPayload({...input,allDay:true,startAt:"2070-01-01",endAt:"2070-01-02",repeat});
  expect(result.startAt).toBe("2070-01-01");expect(result.endAt).toBe("2070-01-02");expect(result.repeat).toBe(repeat);
 }
});
it("normalizes an explicit offset once and compares actual instants",()=>{
 expect(googleEventCreationPayload({...input,startAt:"2070-01-01T10:00:00-03:00",endAt:"2070-01-01T14:00:00Z"}).startAt).toBe("2070-01-01T13:00:00.000Z");
});
it.each([null,[],"raw",{...input,summary:""},{...input,summary:"x\nInjected"},{...input,summary:"x".repeat(513)},
 {...input,startAt:"2070-02-30T10:00:00Z"},{...input,startAt:"2070-01-01T10:00:00"},{...input,endAt:input.startAt},
 {...input,startAt:"2070-01-01T24:00:00Z"},{...input,startAt:"2070-01-01T10:60:00Z"},{...input,startAt:"2070-01-01T10:00:60Z"},{...input,startAt:"2070-01-01T10:00:00+24:00"},
 {...input,endAt:"2069-12-31T10:00:00Z"},{...input,allDay:true,startAt:"2070-02-30",endAt:"2070-03-01"},
 {...input,allDay:true,startAt:"2070-01-01",endAt:"2070-01-01"},{...input,allDay:true},{...input,withMeet:"true"},
 {...input,withMeet:undefined},{...input,allDay:undefined},{...input,repeat:"RRULE:FREQ=SECONDLY"},
 {...input,location:"bad\0location"},{...input,description:"bad\0description"},{...input,description:"x".repeat(8193)},
 {...input,description:"😀".repeat(5000)},{...input,attendees:null},{...input,attendees:new Array(101).fill(input.attendees[0])},
 {...input,attendees:[{email:"bad@",displayName:"Fixture"}]},{...input,attendees:[{email:"guest@example.test\n",displayName:"Fixture"}]},
 ...[".guest@example.test","guest..name@example.test","guest.@example.test","guest@example..test","guest@a.-bad.test","guest@bad-.test","x".repeat(65)+"@example.test","guest@"+"x".repeat(64)+".test"].map(email=>({...input,attendees:[{email,displayName:"Fixture"}]})),
 {...input,attendees:[input.attendees[0],input.attendees[0]]},{...input,attendees:[{email:"guest@example.test",organizer:true}]},
 {...input,attendees:[{email:"guest@example.test",displayName:"bad\nname"}]},
 ...["userId","companyId","grantId","calendarId","remoteEventId","conferenceData","extendedProperties","accessToken","sendUpdates"].map(key=>({...input,[key]:"fictitious-forged"}))
])("rejects malformed/excessive data and caller-supplied identities/provider controls",value=>{
 const error=(()=>{try{googleEventCreationPayload(value);}catch(e){return e;}})();
 expect(error).toBeInstanceOf(Error);expect((error as Error).message).toBe("GOOGLE_EVENT_PAYLOAD_INVALID");expect((error as Error).cause).toBeUndefined();
});
it("allows optional attendee display names and an empty attendee list without inferring invitations",()=>{
 expect(googleEventCreationPayload({...input,attendees:[]}).attendees).toEqual([]);
 expect(googleEventCreationPayload({...input,attendees:[{email:"guest@example.test"}]}).attendees).toEqual([{email:"guest@example.test",displayName:""}]);
});
