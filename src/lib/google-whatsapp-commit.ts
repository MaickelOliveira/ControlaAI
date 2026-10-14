import "server-only";
import {setPendingAction} from "./pending-actions";
import {captureGoogleWhatsAppWorkspace,replayGoogleWhatsAppIntent,type GoogleWhatsAppIntent} from "./google-whatsapp-intent";
import type {GoogleWorkspace} from "./google-workspace-policy";

export type GoogleWhatsAppReceipt=Readonly<{clientMutationId:string;recordId:string}>;
export type GoogleWhatsAppEffects<T extends {id:string}>=Readonly<{
 execute:(scope:GoogleWorkspace,intent:GoogleWhatsAppIntent)=>Promise<T>;
 read:(scope:GoogleWorkspace,intent:GoogleWhatsAppIntent,recordId:string)=>Promise<T|null>;
}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function capturedReceipts(intents:readonly GoogleWhatsAppIntent[],value:unknown):readonly GoogleWhatsAppReceipt[]{
 if(!Array.isArray(value)||value.length>intents.length)throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
 const seen=new Set<string>();return Object.freeze(value.map(value=>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");const row=value as Record<string,unknown>;
  if(Object.keys(row).some(key=>!["clientMutationId","recordId"].includes(key))||typeof row.clientMutationId!=="string"||typeof row.recordId!=="string"||!UUID.test(row.clientMutationId)||!UUID.test(row.recordId))throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
  const clientMutationId=row.clientMutationId.toLowerCase(),recordId=row.recordId.toLowerCase(),intent=intents.find(intent=>intent.clientMutationId===clientMutationId);
  if(!intent||seen.has(clientMutationId)||intent.appointmentId!==null&&intent.appointmentId!==recordId)throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");seen.add(clientMutationId);return Object.freeze({clientMutationId,recordId});
 }));
}
/** Callers supply only scoped service operations. Keep this pending state until
 * the caller has sent its acknowledgement; retry uses confirmed reads or the
 * same idempotent operation, never a newly generated creation identity. */
export async function commitGoogleWhatsAppIntents<T extends {id:string}>(userId:string,phone:string,intents:readonly GoogleWhatsAppIntent[],effects:GoogleWhatsAppEffects<T>,acknowledged:readonly GoogleWhatsAppReceipt[]=[]):Promise<readonly Readonly<{intent:GoogleWhatsAppIntent;result:T|null;replayed:boolean}>[]>{
 if(!Array.isArray(intents)||!intents.length||intents.length>30)throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
 const selected=Object.freeze(intents.map(intent=>replayGoogleWhatsAppIntent(userId,intent)));
 if(new Set(selected.map(intent=>intent.clientMutationId)).size!==selected.length)throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");
 let receipts=capturedReceipts(selected,acknowledged);
 async function save(){await setPendingAction(phone,{type:"google_agenda_commit",intent:"agenda_create",userId,intents:selected,receipts});}
 await save();const results=[];
 for(const stored of selected){
  const intent=replayGoogleWhatsAppIntent(userId,stored),scope=captureGoogleWhatsAppWorkspace(userId),receipt=receipts.find(receipt=>receipt.clientMutationId===intent.clientMutationId);
  if(receipt){
   const result=await effects.read(scope,intent,receipt.recordId);
   replayGoogleWhatsAppIntent(userId,intent);
   if(result!==null&&(!result||typeof result.id!=="string"||result.id.toLowerCase()!==receipt.recordId))throw Error("GOOGLE_WHATSAPP_RESULT_INVALID");
   results.push(Object.freeze({intent,result,replayed:true}));continue;
  }
  const result=await effects.execute(scope,intent);
  if(!result||typeof result.id!=="string"||!UUID.test(result.id)||intent.appointmentId!==null&&result.id.toLowerCase()!==intent.appointmentId)throw Error("GOOGLE_WHATSAPP_RESULT_INVALID");
  // Recheck before persisting: a changed participant context must never rewrite
  // the outer pending-action scope and make an old intent appear current.
  replayGoogleWhatsAppIntent(userId,intent);
  receipts=Object.freeze([...receipts,Object.freeze({clientMutationId:intent.clientMutationId,recordId:result.id.toLowerCase()})]);await save();replayGoogleWhatsAppIntent(userId,intent);
  results.push(Object.freeze({intent,result,replayed:false}));
 }
 return Object.freeze(results);
}
