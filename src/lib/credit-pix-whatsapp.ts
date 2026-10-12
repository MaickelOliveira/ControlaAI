import "server-only";
import {getSupabase} from "./supabase";
import {getUserById,hasAccess} from "./users";
import {getPhonesForUser,getUserIdByPhone} from "./wpp-phone-links";
import {getAiPaused,addMessage,phoneVariants} from "./conversations";
import {isAccountHolderRelation} from "./wpp-link-identity";
import {getOpenFinanceAccess,type OpenFinanceScope} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {getConfig} from "./whatsapp-config";
import {claimWhatsAppQuestion} from "./whatsapp-activity";
import {sendCreditPixButtons} from "./waba";
import {sendText} from "./whatsapp";
import {creditPixCents} from "./credit-funded-payment";
import {polpObject,polpUuid} from "./polp-production";
import type {CreditPixAnswer} from "./credit-pix-question";
export {parseCreditPixAnswer} from "./credit-pix-question";
const enabled=()=>process.env.OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED==="true"&&process.env.OPEN_FINANCE_WHATSAPP_ENABLED==="true";
const label=(value:unknown)=>typeof value==="string"?value.replace(/[\u0000-\u001f*_`~]/g," ").slice(0,80).trim():"";
const currency=(value:unknown)=>{
 const cents=creditPixCents(value);if(cents===null)throw Error("OF_QUESTION_INVALID");
 return (Number(cents)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
};
function text(q:Record<string,unknown>,workspace:string){
 const date=typeof q.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(q.date)?q.date.split("-").reverse().join("/"):"";
 if(!date)throw Error("OF_QUESTION_INVALID");
 return `Uma conferência rápida · ${workspace}\n\nVocê pegou dinheiro do cartão, pelo Pix, para fazer esse pagamento?\n\n${label(q.bank)} · ${date}\nPagamento: ${label(q.paymentName)}\nPix: *${currency(q.paymentAmount)}*\nCobrança no cartão: *${currency(q.gross)}*\nDiferença: *${currency(q.charges)}* de juros/taxas.\n\nAo confirmar, o gasto será contado uma vez e os juros/taxas separados. Isso não paga nem reduz sua dívida no cartão.\n\nUse os botões abaixo. Se forem pagamentos diferentes, escolha “Não”.`;
}
async function allowed(phone:string,expectedUser?:string,expectedMode?:string,expectedCompany?:string|null){
 const userId=await getUserIdByPhone(phone);
 if(!userId||expectedUser&&userId!==expectedUser||await getAiPaused(phone))return null;
 const user=await getUserById(userId);if(!user||!hasAccess(user))return null;
 const variants=phoneVariants(phone),link=(await getPhonesForUser(userId)).find(item=>variants.includes(item.phone));
 if(!link||!isAccountHolderRelation(link.relation))return null;
 const mode=link.access==="both"?link.activeWorkspaceMode??user.activeMode:link.access;
 if(expectedMode&&mode!==expectedMode||mode==="business"&&(!link.activeCompanyId||expectedCompany&&link.activeCompanyId!==expectedCompany))return null;
 const scope=await getOpenFinanceAccess(user,mode,{throwOnStorageError:true,companyId:mode==="business"?link.activeCompanyId:null});
 if(!scope||scope.userId!==userId||scope.mode!==mode||scope.environment!=="production"||mode==="business"&&scope.companyId!==link.activeCompanyId)return null;
 return {scope,phone:link.phone};
}
export async function prepareCreditPixQuestions(scope:OpenFinanceScope):Promise<void>{
 if(enabled())await openFinanceRpc(scope,"zelo_of_prepare_credit_pix_questions");
}
/** One bounded pass in the existing minute cron; no extra provider polling or templates. */
export async function runCreditPixQuestions():Promise<number>{
 if(!enabled()||(await getConfig()).provider!=="waba")return 0;
 const {data,error}=await getSupabase().rpc("zelo_of_credit_pix_targets");
 if(error||!Array.isArray(data)||data.length>20)throw Error("OF_QUESTIONS_UNAVAILABLE");
 let sent=0;
 for(const raw of data){
  const target=polpObject(raw),id=polpUuid(target.id),userId=polpUuid(target.userId),mode=target.mode;
  if((mode!=="personal"&&mode!=="business")||typeof target.phone!=="string"||!/^\d{8,20}$/.test(target.phone))continue;
  const companyId=target.companyId===null?null:polpUuid(target.companyId);
  const current=await allowed(target.phone,userId,mode,companyId);if(!current)continue;
  const lease=await claimWhatsAppQuestion(current.phone);if(!lease)continue;
  let token:string|undefined;let attempted=false;let finished=false;
  try{
   const question=polpObject(await openFinanceRpc(current.scope,"zelo_of_get_credit_pix_question",{p_question:id}));
   const claimed=await openFinanceRpc(current.scope,"zelo_of_claim_credit_pix_question",{p_question:id,p_phone:current.phone});if(!claimed)continue;token=polpUuid(claimed);
   if(question.valid!==true)continue;
   const fresh=await allowed(target.phone,userId,mode,companyId);
   if(!fresh||!await lease.ready())continue;
   if(await openFinanceRpc(current.scope,"zelo_of_arm_credit_pix_question",{p_question:id,p_token:token})!==true)continue;
   const finalAccess=await allowed(target.phone,userId,mode,companyId);
   const finalQuestion=polpObject(await openFinanceRpc(current.scope,"zelo_of_get_credit_pix_question",{p_question:id}));
   if(!finalAccess||finalQuestion.valid!==true)continue;
   const message=text(finalQuestion,mode==="business"?label(current.scope.companyName)||"Empresa":"Pessoal");
   // New inbound work invalidates the reservation even if its handler has already finished.
   if(!await lease.ready())continue;
   attempted=true;
   const accepted=await sendCreditPixButtons(current.phone,id,message);
   await openFinanceRpc(current.scope,"zelo_of_finish_credit_pix_question",{p_question:id,p_token:token,p_status:accepted?"asked":"uncertain"});finished=true;
   if(accepted){sent++;await addMessage(current.phone,{role:"assistant",content:message,ts:Date.now(),channel:"waba",privateFinancial:true});}
  }finally{
   if(token&&!finished)await openFinanceRpc(current.scope,"zelo_of_finish_credit_pix_question",{p_question:id,p_token:token,p_status:attempted?"uncertain":"pending"}).catch(()=>{});
   await lease.finish().catch(()=>{});
  }
 }
 return sent;
}
/** Only a signed button ID reaches here. A generic yes stays in normal conversation. */
export async function answerCreditPixQuestion(from:string,answer:CreditPixAnswer):Promise<boolean>{
 if(!enabled()||typeof answer.confirmed!=="boolean")return false;
 const current=await allowed(from);if(!current)return false;
 try{
  const result=polpObject(await openFinanceRpc(current.scope,"zelo_of_answer_credit_pix_question",{p_question:polpUuid(answer.questionId),p_phone:current.phone,p_confirmed:answer.confirmed}));
  const reply=result.status==="confirmed"?"Conferência registrada! O Pix será contado uma vez e os juros/taxas separados. Sua dívida no cartão continua igual.":result.status==="rejected"?"Tudo certo! São pagamentos diferentes. Mantive os gastos como estavam.":"Os dados desse pagamento mudaram. Confira novamente em Finanças antes de confirmar.";
  await sendText(current.phone,reply,{privateFinancial:true});
 }catch{await sendText(current.phone,"Essa pergunta não está mais disponível neste modo ou empresa. Confira o pagamento em Finanças.",{privateFinancial:true});}
 return true;
}
