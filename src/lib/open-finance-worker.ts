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
  if(process.env.MULTI_COMPANY_ENABLED==="true"&&selected.companyId===undefined)throw Error("OF_COMPANY_SCOPE_MISSING");
  const scope=user?await getOpenFinanceAccess(user,mode,{throwOnStorageError:true,companyId:selected.companyId===null?null:selected.companyId===undefined?undefined:polpUuid(selected.companyId)}):null;
  if(!scope || selected.mode!==mode || selected.environment!=="production")throw Error("OF_ACCESS_DENIED");
  return runBankSyncPage(scope);
}

/** PostgreSQL leases coordinate instances; queries never download bank history. */
export function startOpenFinanceWorker():()=>void {
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,mode:"personal"|"business"="personal";
  let nextSchedulesCheck=0;
  let nextRetirementCheck=0;
  const nextSyncCheck={personal:0,business:0},failures={personal:0,business:0};
  const nextErrorLog:Record<string,number>={};
  function reportFailure(key:string,message:string){
    if(Date.now()>=(nextErrorLog[key]??0)){console.error(message);nextErrorLog[key]=Date.now()+300_000;}
  }
  async function tick(){
    if(stopped)return;
    if(isBankRetirementEnabled()&&Date.now()>=nextRetirementCheck){
      try {
        const result=await runBankRetirement();
        nextRetirementCheck=Date.now()+(result==="idle"||result==="failed"?30000:10000);
        if(result==="failed")reportFailure("retirement","[open-finance] Cancelamento bancário aguardando nova tentativa");
      } catch {
        nextRetirementCheck=Date.now()+30000;
        reportFailure("retirement","[open-finance] Cancelamento bancário temporariamente indisponível");
      }
    }
    try{if(isPublicOpenFinanceEnabled()&&process.env.OPEN_FINANCE_SYNC_ENABLED==="true"){
      if(Date.now()>=nextSchedulesCheck){
        const ownerEmail=process.env.OPEN_FINANCE_OWNER_BUSINESS_ENABLED==="true"?process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase()??null:null;
        const {data,error}=await getSupabase().rpc("zelo_of_prepare_schedules",{p_owner_email:ownerEmail});
        nextSchedulesCheck=Date.now()+(error?60000:Number(data)>0?30000:900000);
      }
      if(Date.now()>=nextSyncCheck[mode]){
        const result=await runPublicBankSync(mode);
        failures[mode]=result==="failed"?failures[mode]+1:0;
        nextSyncCheck[mode]=Date.now()+(result==="idle"?30000:result==="failed"?Math.min(300000,30000*2**Math.min(failures[mode]-1,4)):2000);
      }
    }}
    catch{
      failures[mode]++;
      nextSyncCheck[mode]=Date.now()+Math.min(300000,30000*2**Math.min(failures[mode]-1,4));
      reportFailure(`sync-${mode}`,"[open-finance] Sincronização temporariamente indisponível");
    }
    mode=mode==="personal"?"business":"personal";
    if(!stopped)timer=setTimeout(()=>void tick(),2000);
  }
  void tick();
  return ()=>{stopped=true;clearTimeout(timer);};
}
