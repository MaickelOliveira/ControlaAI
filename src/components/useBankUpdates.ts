"use client";
import {useCallback,useEffect,useState,type SetStateAction} from "react";
import {startBankUpdates} from "@/lib/open-finance-live";
export function useBankUpdates<T>(load:(signal:AbortSignal)=>Promise<T|null>,enabled=true) {
  const [state,setState]=useState<{load:typeof load;data:T|null}>({load,data:null});
  const [error,setError]=useState("");
  const setData=useCallback((value:SetStateAction<T|null>)=>setState(previous=>({load,data:typeof value==="function"?(value as (p:T|null)=>T|null)(previous.load===load?previous.data:null):value})),[load]);
  useEffect(()=>{if(!enabled)return;return startBankUpdates({load,onData:data=>{setData(data);setError("");},onError:()=>setError("A atualização automática está temporariamente indisponível. Tentaremos novamente."),isVisible:()=>document.visibilityState!=="hidden",subscribeWake:wake=>{window.addEventListener("focus",wake);document.addEventListener("visibilitychange",wake);return()=>{window.removeEventListener("focus",wake);document.removeEventListener("visibilitychange",wake);};}});},[load,setData,enabled]);
  return {data:state.load===load?state.data:null,setData,error};
}
