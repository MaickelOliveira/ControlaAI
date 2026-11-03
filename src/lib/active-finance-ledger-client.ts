"use client";
import type {FinanceLedgerData} from "./finance-ledger";
export type ActiveFinanceLedger=FinanceLedgerData&{mode:"personal"|"business"};
/** The authenticated server resolves the active mode and company. Start on
 * mount instead of waiting for a separate identity request. No result cache. */
export async function fetchActiveFinanceLedger(signal:AbortSignal,from:string,to:string,mode?:"personal"|"business"):Promise<ActiveFinanceLedger|null>{
 const response=await fetch(`/api/finances/ledger?${new URLSearchParams({from,to,...(mode?{mode}:{})})}`,{cache:"no-store",signal});
 if(response.status===401)return null;
 const body=await response.json();
 if(!response.ok)throw Error(typeof body.error==="string"?body.error:"LEDGER_UNAVAILABLE");
 if(body.mode!=="personal"&&body.mode!=="business")throw Error("LEDGER_MODE_UNAVAILABLE");
 return body;
}

/** A mounted tab keeps its selected mode, as before. A new page resolves the
 * current server selection again. Storage/access is still checked every time. */
export function createActiveFinanceLedgerReader(){
 let mode:"personal"|"business"|undefined;
 return async(signal:AbortSignal,from:string,to:string)=>{
  const data=await fetchActiveFinanceLedger(signal,from,to,mode);
  if(data&&!signal.aborted){
   if(mode&&data.mode!==mode)throw Error("LEDGER_MODE_CHANGED");
   mode??=data.mode;
  }
  return data;
 };
}
