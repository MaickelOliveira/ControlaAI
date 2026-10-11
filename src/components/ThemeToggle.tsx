"use client";
import {useSyncExternalStore} from "react";
import {AppTheme,THEME_STORAGE_KEY} from "@/lib/theme";

function snapshot():AppTheme{return document.documentElement.dataset.theme==="dark"?"dark":"light";}
function subscribe(callback:()=>void){
  function storage(event:StorageEvent){
    if(event.key!==THEME_STORAGE_KEY&&event.key!==null)return;
    document.documentElement.dataset.theme=event.newValue==="dark"?"dark":"light";
    callback();
  }
  window.addEventListener("storage",storage);
  window.addEventListener("zelo-theme-change",callback);
  return ()=>{window.removeEventListener("storage",storage);window.removeEventListener("zelo-theme-change",callback);};
}
function setTheme(theme:AppTheme){
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem(THEME_STORAGE_KEY,theme);}catch{/* The choice still works for this tab. */}
  window.dispatchEvent(new Event("zelo-theme-change"));
}
export default function ThemeToggle({es=false}:{es?:boolean}){
  const theme=useSyncExternalStore(subscribe,snapshot,()=>"light" as const);
  return <div className="z-theme-toggle" role="group" aria-label={es?"Apariencia":"Aparência"}>
    {(["light","dark"] as const).map(value=><button key={value} type="button" aria-pressed={theme===value} onClick={()=>setTheme(value)} title={value==="light"?"Claro":es?"Oscuro":"Escuro"}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{value==="light"?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>:<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>}</svg>
      <span>{value==="light"?"Claro":es?"Oscuro":"Escuro"}</span>
    </button>)}
  </div>;
}
