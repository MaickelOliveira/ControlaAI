import "server-only";
import {createHash} from "node:crypto";
import {captureGoogleWhatsAppWorkspace} from "./google-whatsapp-intent";
import {googleWorkspaceKey} from "./google-workspace-policy";

export type GoogleWhatsAppProviderEnvelope=Readonly<{channel:"waba"|"evolution";providerMessageId:string}>;
/** Populate only from an authenticated provider envelope, never model/text data. */
export function googleWhatsAppProviderEnvelope(provider:unknown,value:unknown):GoogleWhatsAppProviderEnvelope{
 if((provider!=="waba"&&provider!=="evolution")||typeof value!=="string"||!value||value.length>512||/[\s\p{Cc}]/u.test(value))throw Error("GOOGLE_WHATSAPP_MESSAGE_INVALID");
 return Object.freeze({channel:provider,providerMessageId:value});
}
/** Stable message/item identity contains no payload, operation or current global
 * user mode. A repeated ID with changed payload must conflict in the service. */
export function googleWhatsAppMessageUUID(userId:string,message:unknown,itemOrdinal:number):string{
 const workspace=captureGoogleWhatsAppWorkspace(userId);
 if(!message||typeof message!=="object"||Array.isArray(message)||!Number.isInteger(itemOrdinal)||itemOrdinal<0||itemOrdinal>=30)throw Error("GOOGLE_WHATSAPP_MESSAGE_INVALID");
 const row=message as Record<string,unknown>,envelope=googleWhatsAppProviderEnvelope(row.channel,row.providerMessageId);
 const bytes=createHash("sha256").update(JSON.stringify(["zelo-google-whatsapp-intent-v1",envelope.channel,googleWorkspaceKey(workspace),envelope.providerMessageId,itemOrdinal])).digest().subarray(0,16);
 bytes[6]=(bytes[6]&0x0f)|0x80;bytes[8]=(bytes[8]&0x3f)|0x80;const hex=bytes.toString("hex");
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
