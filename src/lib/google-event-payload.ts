export type GoogleEventCreationPayload=Readonly<{
 summary:string;description:string;location:string;startAt:string;endAt:string;allDay:boolean;
 repeat:"none"|"daily"|"weekly"|"monthly"|"yearly";
 attendees:readonly Readonly<{email:string;displayName:string}>[];withMeet:boolean;
}>;
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error();
 const row=value as Record<string,unknown>;if(Object.keys(row).some(key=>!keys.includes(key)))throw Error();return row;
}
function text(value:unknown,max:number,multiline=false):string{
 if(typeof value!=="string"||value.length>max||/\p{Cc}/u.test(multiline?value.replace(/[\n\r\t]/g,""):value))throw Error();return value;
}
function date(value:unknown):string{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error();
 if(new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw Error();return value;
}
function instant(value:unknown):string{
 if(typeof value!=="string")throw Error();
 const match=value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/);
 if(!match||Number(match[1])>23||Number(match[2])>59||Number(match[3])>59||Number(match[4]??0)>23||Number(match[5]??0)>59)throw Error();
 date(value.slice(0,10));const result=new Date(value).toISOString();if(result.length!==24)throw Error();return result;
}
function emailAddress(value:unknown):string{
 const email=text(value,254),parts=email.split("@");if(parts.length!==2)throw Error();
 const [local,domain]=parts;
 if(local.length>64||!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:[.][A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local))throw Error();
 if(!domain.split(".").every(label=>label.length<=63&&/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)))throw Error();return email;
}
/** Canonical private creation data. The authenticated consumer supplies explicit
 * times (date-only with exclusive end for all-day). No owner or provider controls
 * are accepted here. This is validation, not permission to invite or synchronize. */
export function googleEventCreationPayload(value:unknown):GoogleEventCreationPayload{
 try{
  const row=record(value,["summary","description","location","startAt","endAt","allDay","repeat","attendees","withMeet"]);
  if(typeof row.allDay!=="boolean"||typeof row.withMeet!=="boolean"||!Array.isArray(row.attendees)||row.attendees.length>100)throw Error();
  const summary=text(row.summary,512);if(!summary.trim())throw Error();
  const description=text(row.description,8192,true),location=text(row.location,1024);
  const startAt=row.allDay?date(row.startAt):instant(row.startAt),endAt=row.allDay?date(row.endAt):instant(row.endAt);
  if(endAt<=startAt)throw Error();
  const repeat=row.repeat;if(repeat!=="none"&&repeat!=="daily"&&repeat!=="weekly"&&repeat!=="monthly"&&repeat!=="yearly")throw Error();
  const seen=new Set<string>();
  const attendees=Object.freeze(row.attendees.map(value=>{
   const attendee=record(value,["email","displayName"]),email=emailAddress(attendee.email);
   if(seen.has(email.toLowerCase()))throw Error();
   seen.add(email.toLowerCase());return Object.freeze({email,displayName:attendee.displayName===undefined?"":text(attendee.displayName,256)});
  }));
  const payload=Object.freeze({summary,description,location,startAt,endAt,allDay:row.allDay,repeat,attendees,withMeet:row.withMeet});
  // Leave room for PostgreSQL JSONB's whitespace/escaping within its32KiB cap.
  if(Buffer.byteLength(JSON.stringify(payload),"utf8")>16384)throw Error();return payload;
 }catch{throw Error("GOOGLE_EVENT_PAYLOAD_INVALID");}
}
