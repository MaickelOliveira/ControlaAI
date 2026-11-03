"use client";
import type {FinanceLedgerData} from "./finance-ledger";
export type ActiveFinanceLedger=FinanceLedgerData&{mode:"personal"|"business"};
/** The authenticated server resolves the active mode and company. Start on
 * mount instead of waiting for a separate identity request. No result cache. */
export async function fetchActiveFinanceLedger(signal:AbortSignal,from:string,to:string):Promise<ActiveFinanceLedger|null>{
 const response=await fetch(`/api/finances/ledger?${new URLSearchParams({from,to})}`,{cache:"no-store",signal});
 if(response.status===401)return null;
 const body=await response.json();
 if(!response.ok)throw Error(typeof body.error==="string"?body.error:"LEDGER_UNAVAILABLE");
 if(body.mode!=="personal"&&body.mode!=="business")throw Error("LEDGER_MODE_UNAVAILABLE");
 return body;
}
