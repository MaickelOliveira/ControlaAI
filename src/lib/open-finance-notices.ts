import "server-only";
import {getSupabase} from "./supabase";
import {getUserById,hasAccess} from "./users";
import {getPhoneAccess} from "./wpp-phone-links";
import {getOpenFinanceAccess,isPublicOpenFinanceEnabled} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {polpObject,polpUuid} from "./polp-production";
import {collectBankAgenda,formatBankAgenda,type BankAgenda} from "./open-finance-schedules";
import {sendReminderTemplate,buildReminderTemplateDispatch} from "./whatsapp";

const ownerEmail=()=>process.env.OPEN_FINANCE_OWNER_BUSINESS_ENABLED==="true"?process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase()??null:null;
export async function runBankDueNotices():Promise<number>{
  if(!isPublicOpenFinanceEnabled()||process.env.OPEN_FINANCE_WHATSAPP_ENABLED!=="true"||process.env.OPEN_FINANCE_NOTICES_ENABLED==="false")return 0;
  const {data,error}=await getSupabase().rpc("zelo_of_notice_targets",{p_owner_email:ownerEmail()});
  if(error||!Array.isArray(data)||data.length>20)throw Error("OF_NOTICES_UNAVAILABLE");
  let sent=0;
  for(const raw of data){
    let receipt:string|null=null;
    let scope:Awaited<ReturnType<typeof getOpenFinanceAccess>>=null;
    try{
      const target=polpObject(raw),userId=polpUuid(target.userId),mode=target.mode;
      if(mode!=="personal"&&mode!=="business"||typeof target.phone!=="string"||!/^\d{8,20}$/.test(target.phone)||typeof target.itemKey!=="string"||!/^(bill|recurring):[a-f0-9-]{36}$/.test(target.itemKey))throw Error("OF_NOTICE_INVALID");
      const phone=target.phone,itemKey=target.itemKey;
      const allowed=async()=>{
        const user=await getUserById(userId);
        if(!user||!hasAccess(user))return null;
        const currentScope=await getOpenFinanceAccess(user,mode,{throwOnStorageError:true});
        const access=await getPhoneAccess(userId,phone);
        return currentScope&&(access==="both"||access===mode)?{user,scope:currentScope}:null;
      };
      const current=await allowed();if(!current)continue;scope=current.scope;
      const token=await openFinanceRpc(scope,"zelo_of_notice_claim",{p_item:itemKey,p_phone:phone,p_owner_email:ownerEmail()});
      if(!token)continue;receipt=polpUuid(token);
      const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
      const agenda=await openFinanceRpc(scope,"zelo_of_agenda",{p_from:today,p_to:today,p_undated:false}) as BankAgenda;
      const item=collectBankAgenda(agenda.items,{from:today,to:today,forNotification:true}).find(i=>`${i.kind}:${i.id}`===itemKey);
      const fresh=await allowed();
      if(!fresh||!item){await openFinanceRpc(scope,"zelo_of_notice_finish",{p_receipt:receipt,p_status:"skipped"});continue;}
      const text=`Hoje na Zelo · ${mode==="business"?"Empresa":"Pessoal"}${formatBankAgenda([item],agenda.incomplete)}`;
      const dispatch=buildReminderTemplateDispatch({message:text,recipientType:"self",mode,locale:fresh.user.locale});
      const accepted=await sendReminderTemplate(phone,dispatch.templateName,text,dispatch.params,fresh.user.locale,{privateFinancial:true});
      await openFinanceRpc(scope,"zelo_of_notice_finish",{p_receipt:receipt,p_status:accepted?"sent":"uncertain"});
      if(accepted)sent++;
    }catch{
      if(receipt&&scope)await openFinanceRpc(scope,"zelo_of_notice_finish",{p_receipt:receipt,p_status:"uncertain"}).catch(()=>{});
      console.error("[open-finance] Aviso financeiro não confirmado; sem repetição automática");
    }
  }
  return sent;
}
