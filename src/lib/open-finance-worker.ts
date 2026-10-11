import "server-only";
import {getSupabase} from "./supabase";
import {getUserById} from "./users";
import {getOpenFinanceAccess,isPublicOpenFinanceEnabled} from "./open-finance-access";
import {runBankSyncPage} from "./open-finance-sync";
import {polpObject,polpUuid} from "./polp-production";
import {isBankRetirementEnabled,runBankRetirement} from "./open-finance-retirement";

export async function runPublicBankSync(mode:"personal"|"business") {
  const ownerEmail=process.env.OPEN_FINANCE_ENABLED==="true"&&process.env.OPEN_FINANCE_OWNER_BUSINESS_ENABLED==="true"?process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase()??null:null;
  const {data,error}=await getSupabase().rpc("zelo_of_worker_scope",{p_mode:mode,p_owner_email:ownerEmail});
  if(error)throw Error("OF_WORKER_UNAVAILABLE");
  if(!data)return "idle" as const;
  const selected=polpObject(data),user=await getUserById(polpUuid(selected.userId));
  const scope=user?await getOpenFinanceAccess(user,mode,{throwOnStorageError:true}):null;
  if(!scope || selected.mode!==mode || selected.environment!=="production")throw Error("OF_ACCESS_DENIED");
  return runBankSyncPage(scope);
}

/** PostgreSQL leases coordinate instances; queries never download bank history. */
export function startOpenFinanceWorker():()=>void {
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,mode:"personal"|"business"="personal";
  let nextSchedulesCheck=0;
  let nextRetirementCheck=0;
  async function tick(){
    if(stopped)return;
    if(isBankRetirementEnabled()&&Date.now()>=nextRetirementCheck){
      try {
        const result=await runBankRetirement();
        nextRetirementCheck=Date.now()+(result==="idle"?30000:10000);
        if(result==="failed")console.error("[open-finance] Cancelamento bancário aguardando nova tentativa");
      } catch {
        nextRetirementCheck=Date.now()+30000;
        console.error("[open-finance] Cancelamento bancário temporariamente indisponível");
      }
    }
    try{if(isPublicOpenFinanceEnabled()&&process.env.OPEN_FINANCE_SYNC_ENABLED==="true"){
      if(Date.now()>=nextSchedulesCheck){
        const ownerEmail=process.env.OPEN_FINANCE_OWNER_BUSINESS_ENABLED==="true"?process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase()??null:null;
        const {data,error}=await getSupabase().rpc("zelo_of_prepare_schedules",{p_owner_email:ownerEmail});
        nextSchedulesCheck=Date.now()+(error?60000:Number(data)>0?30000:900000);
      }
      await runPublicBankSync(mode);
    }}
    catch{console.error("[open-finance] Sincronização temporariamente indisponível");}
    mode=mode==="personal"?"business":"personal";
    if(!stopped)timer=setTimeout(()=>void tick(),2000);
  }
  void tick();
  return ()=>{stopped=true;clearTimeout(timer);};
}
