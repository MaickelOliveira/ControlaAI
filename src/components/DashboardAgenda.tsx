"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import UiIcon from "./UiIcon";
type Event={id:string;title:string;startAt:string;allDay:boolean;status:string};
export default function DashboardAgenda(){
  const [events,setEvents]=useState<Event[]|null>(null),[error,setError]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/agenda",{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();return response.json();}).then((data:Event[])=>{
      if(!Array.isArray(data))throw Error();
      const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
      setEvents(data.filter(e=>e.status==="scheduled"&&new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(e.startAt))>=today).sort((a,b)=>a.startAt.localeCompare(b.startAt)).slice(0,3));
    }).catch(()=>{if(!controller.signal.aborted)setError(true);});
    return()=>controller.abort();
  },[]);
  return <article className="z-card"><div className="z-card-heading"><h2>Na sua agenda</h2><Link href="/dashboard/agenda">Ver agenda →</Link></div>
    {error?<p className="z-empty">Não foi possível atualizar a agenda.</p>:events===null?<p className="z-empty">Carregando sua agenda…</p>:!events.length?<p className="z-empty">Nenhum compromisso agendado.<br/><Link href="/dashboard/agenda" className="text-amber-ink">Planejar meu dia →</Link></p>:events.map(event=><Link key={event.id} href="/dashboard/agenda" className="z-agenda-row"><span className="rounded-xl bg-blue-soft p-2 text-blue-ink h-fit"><UiIcon name="calendar" className="h-4 w-4"/></span><div className="min-w-0"><time dateTime={event.startAt}>{new Date(event.startAt).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit"})} · {event.allDay?"Dia todo":new Date(event.startAt).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"})}</time><p className="mt-1 truncate">{event.title}</p></div></Link>)}
  </article>;
}
