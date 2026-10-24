"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { AgentScene } from "@/lib/landing-story";
import { AGENT_ACTIONS } from "@/lib/landing-agent-actions";
import x from "./experience.module.css";

export default function AgentDetails({agent,onClose}:{agent:AgentScene;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    dialog.current?.showModal();
    return()=>{document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};
  },[]);
  return <dialog ref={dialog} className={x.agentDialog} aria-labelledby="agent-detail-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===dialog.current)onClose();}}>
    <header className={x.agentDialogHeader}><span>ZELO / CADA ESPECIALIDADE, EM DETALHES</span><button type="button" autoFocus onClick={onClose}>Voltar à apresentação <span>×</span></button></header>
    <div className={x.agentDialogBody}><aside><Image src={agent.portrait} alt={`Personagem virtual ${agent.name}`} width={380} height={490}/><span>{agent.role}</span><h2 id="agent-detail-title">{agent.name}<b>↗</b></h2><p>{agent.description}</p><small>{agent.detail}</small></aside>
      <div className={x.agentActions}><p>O QUE VOCÊ PODE PEDIR</p>{AGENT_ACTIONS[agent.key].map((action,i)=><article key={action.title}><span>0{i+1}</span><div><h3>{action.title}</h3><p>{action.how}</p><blockquote>“{action.request}”</blockquote><div><b>O que você recebe</b><p>{action.result}</p></div></div></article>)}<p className={x.agentActionNote}>Exemplos ilustrativos. Complete os dados e as confirmações solicitadas. Recursos e integrações seguem a disponibilidade da sua conta.</p></div>
    </div>
  </dialog>;
}
