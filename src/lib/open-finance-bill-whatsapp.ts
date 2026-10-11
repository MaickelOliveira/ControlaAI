import "server-only";
import {parseBillRequest} from "./open-finance-bill-selection";
import {prepareBankBill} from "./open-finance-bills";
import {getUserById,hasAccess,type User} from "./users";
import {getPhoneAccess} from "./wpp-phone-links";
import {getOpenFinanceAccess} from "./open-finance-access";
import {sendFile,sendText} from "./whatsapp";

export async function sendRequestedBankBill(user:User,mode:"personal"|"business",phone:string,message:string,today:string):Promise<boolean>{
  if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED!=="true"||!parseBillRequest(message,today))return false;
  const requested=/\b(empresa|empresarial|pj)\b/i.test(message)?"business":/\b(pessoal|pf)\b/i.test(message)?"personal":mode;
  const allowed=async()=>{
    const current=await getUserById(user.id);if(!current||!hasAccess(current))return null;
    const access=await getPhoneAccess(user.id,phone);if(access!=="both"&&access!==requested)return null;
    return await getOpenFinanceAccess(current,requested,{throwOnStorageError:true})?current:null;
  };
  try{
    const access=await getPhoneAccess(user.id,phone);
    if(!access)return true;
    if(access!=="both"&&access!==requested){await sendText(phone,"Este número não tem acesso a esse modo da Zelo.",{privateFinancial:true});return true;}
    const current=await allowed();if(!current)return true;
    const result=await prepareBankBill(current,requested,message,today);if(!result)return false;
    if(!await allowed())return true;
    if(result.buffer&&result.filename){
      const accepted=await sendFile(phone,result.buffer,result.filename,"application/pdf",result.text,{privateFinancial:true});
      if(!accepted&&await allowed())await sendText(phone,"Não consegui confirmar o envio do arquivo. Você também pode baixar o demonstrativo da Zelo em Contas → seu cartão → Faturas.",{privateFinancial:true});
    }else await sendText(phone,result.text,{privateFinancial:true});
    return true;
  }catch{
    if(await allowed().catch(()=>null))await sendText(phone,"Não consegui consultar a fatura completa agora. Tente novamente ou veja as faturas em Contas.",{privateFinancial:true});
    return true;
  }
}
