export type QuietMessage={role:"user"|"assistant";ts:number;channel?:"waba"|"evolution"};
export type WhatsAppQuietState={messages:readonly QuietMessage[];lastActivity:unknown;aiPaused:boolean;processing:boolean;pending:boolean;reserved:boolean};
export const CREDIT_PIX_QUIET_MS=120_000;
export function canAskCreditPixQuestion(state:WhatsAppQuietState,now=Date.now()):boolean {
 const validTime=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>0&&value<=now;
 if(!validTime(now)||!validTime(state.lastActivity)||state.aiPaused||state.processing||state.pending||state.reserved||!state.messages.length)return false;
 let lastInbound=0,lastActivity=state.lastActivity;
 for(const message of state.messages){
  if(!validTime(message.ts))return false;
  lastActivity=Math.max(lastActivity,message.ts);
  if(message.role==="user"&&message.channel==="waba")lastInbound=Math.max(lastInbound,message.ts);
 }
 return lastInbound>0&&now-lastInbound<86_400_000&&now-lastActivity>=CREDIT_PIX_QUIET_MS;
}
