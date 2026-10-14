"use client";
import {useEffect,useMemo,useState} from "react";
import {createGoogleAgendaController,emptyGoogleAgendaState,type GoogleAgendaConflictActions} from "@/lib/google-agenda-client";
import {useGoogleSettingsWorkspace} from "./GoogleSettingsWorkspace";
export function useGoogleAgenda(){
 const target=useGoogleSettingsWorkspace(),[state,setState]=useState(emptyGoogleAgendaState);
 const controller=useMemo(()=>createGoogleAgendaController({fetch:(url,init)=>fetch(url,init),uuid:()=>crypto.randomUUID(),changed:setState}),[]);
 const conflictActions=useMemo<GoogleAgendaConflictActions>(()=>Object.freeze({choice:state.conflict,check:controller.checkConflict,confirm:controller.confirmConflict,cancel:controller.cancelConflict}),[controller,state.conflict]);
 useEffect(()=>{void controller.setTarget(target);return()=>controller.clear(false);},[controller,target]);
 useEffect(()=>{
  let polls=0;const clear=()=>controller.clear(),wake=()=>{if(document.visibilityState==="visible")void controller.reload();};
  const interval=window.setInterval(()=>{const state=controller.state();if(polls>=24||document.visibilityState!=="visible"||state.loading||state.busy||!state.appointments.some(row=>["queued","running","waiting"].includes(row.googleSyncState)))return;polls++;void controller.reload();},5000);
  window.addEventListener("focus",wake);window.addEventListener("pagehide",clear);window.addEventListener("beforeunload",clear);
  return()=>{window.clearInterval(interval);window.removeEventListener("focus",wake);window.removeEventListener("pagehide",clear);window.removeEventListener("beforeunload",clear);};
 },[controller]);
 return {state,controller,conflictActions};
}
