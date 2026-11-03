"use client";
import {useCallback,useEffect,useState,type SetStateAction} from "react";
import {bankUpdatesPending,startBankUpdates} from "@/lib/open-finance-live";
export function useBankUpdates<T>(load:(signal:AbortSignal)=>Promise<T|null>,enabled=true,once=false) {
  const [state,setState]=useState<{load:typeof load;data:T|null}>({load,data:null});
  const [failure,setFailure]=useState({load,message:""});
  const setData=useCallback((value:SetStateAction<T|null>)=>setState(previous=>({load,data:typeof value==="function"?(value as (p:T|null)=>T|null)(previous.load===load?previous.data:null):value})),[load]);
  useEffect(()=>{if(!enabled)return;return startBankUpdates({load,once,needsFastUpdates:bankUpdatesPending,onData:data=>{setData(data);setFailure({load,message:""});},onError:()=>setFailure({load,message:"A atualização automática está temporariamente indisponível. Tentaremos novamente."}),isVisible:()=>document.visibilityState!=="hidden",subscribeWake:wake=>{window.addEventListener("focus",wake);document.addEventListener("visibilitychange",wake);return()=>{window.removeEventListener("focus",wake);document.removeEventListener("visibilitychange",wake);};}});},[load,setData,enabled,once]);
  return {data:state.load===load?state.data:null,setData,error:failure.load===load?failure.message:""};
}
