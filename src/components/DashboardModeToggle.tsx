"use client";
import {useState} from "react";
import {usePathname} from "next/navigation";
import {updateDashboardMode} from "@/lib/dashboard-me-client";
import {modeSwitchDestination} from "@/lib/dashboard-mode-navigation";

export default function DashboardModeToggle({mode,es=false}:{mode:string;es?:boolean}){
  const pathname=usePathname();
  const [changing,setChanging]=useState(false);
  const [error,setError]=useState("");
  async function selectMode(next:"personal"|"business"){
    if(next===mode||changing)return;
    setChanging(true);setError("");
    try {
      await updateDashboardMode(next);
      const destination=modeSwitchDestination(pathname,next);
      if(destination)window.location.assign(destination);
      else window.location.reload();
    }
    catch {setError(es?"No se pudo guardar el modo. Inténtalo de nuevo.":"Não foi possível salvar o modo. Tente novamente.");}
    finally {setChanging(false);}
  }
  return <div className="z-mode-control">
    <div className="z-mode-selector" role="group" aria-label="Modo de uso">
      <button disabled={changing} aria-pressed={mode!=="business"} onClick={()=>void selectMode("personal")}>{es?"Personal":"Pessoal"}</button>
      <button disabled={changing} aria-pressed={mode==="business"} onClick={()=>void selectMode("business")}>Empresa</button>
    </div>
    {error&&<p role="alert" className="z-mode-error">{error}</p>}
  </div>;
}
