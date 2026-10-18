"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import { ROUTINE_REQUESTS, routineJourney } from "@/lib/landing-story";
import h from "./hero.module.css";

const TARGETS=[.305,.638,.99];
const STEPS=[
  {label:"Seu dinheiro",title:"Um gasto contado. Um detalhe cuidado.",description:"Conte o que gastou, informe a conta e o espaço. O pedido ganha categoria e um lugar no seu financeiro.",reply:"R$ 85 em supermercado, no débito e no Pessoal. Os detalhes do exemplo estão organizados."},
  {label:"Seu tempo",title:"Tempo para estar presente.",description:"Assunto, data, horário e espaço reunidos em um compromisso. Você acompanha sua agenda e o que vem pela frente.",reply:"Reunião da empresa, amanhã às 10h. O exemplo ganhou lugar na agenda."},
  {label:"Seus arquivos",title:"Guardado agora. Encontrado depois.",description:"Envie um documento, peça para guardar e encontre pelo assunto. Quando localizado, o próprio arquivo pode voltar na conversa.",reply:"Contrato guardado no exemplo do Drive. Depois, peça: encontre o contrato do fornecedor."},
];

function ChatIcon({kind}:{kind:"call"|"video"|"mic"|"camera"}) {
  const paths={call:"M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 3-6 3-11-2S2 3 5 3Z",video:"M3 6h12v12H3V6Zm12 4 6-3v10l-6-3",mic:"M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0V4Zm-3 7a6 6 0 0 0 12 0m-6 6v5m-4 0h8",camera:"M3 6h5l2-3h4l2 3h5v15H3V6Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"};
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}

export default function ProductHero(){
  const root=useRef<HTMLElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const [enhanced,setEnhanced]=useState(false);
  const [ready,setReady]=useState(false);
  const [progress,setProgress]=useState(0);
  const [manual,setManual]=useState<number|null>(null);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)");let raf=0;
    const measure=()=>{raf=0;const e=root.current;if(!e)return;const useScroll=!media.matches&&innerHeight>=(innerWidth<360?820:740);setReady(true);setEnhanced(useScroll);if(useScroll){const top=e.getBoundingClientRect().top+scrollY-72;setProgress(Math.min(1,Math.max(0,(scrollY-top)/Math.max(1,e.offsetHeight-(stage.current?.offsetHeight??innerHeight)))));}};
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(measure);};const observer=new ResizeObserver(schedule);if(root.current)observer.observe(root.current);
    addEventListener("scroll",schedule,{passive:true});addEventListener("resize",schedule);media.addEventListener("change",schedule);schedule();
    return()=>{cancelAnimationFrame(raf);observer.disconnect();removeEventListener("scroll",schedule);removeEventListener("resize",schedule);media.removeEventListener("change",schedule);};
  },[]);
  const value=ready?(enhanced?progress:manual===null?0:TARGETS[manual]):0;
  const journey=routineJourney(value);
  const {active,results,mobileReveal}=journey;
  const initialStatic=ready&&!enhanced&&manual===null;
  const typing=initialStatic?1:journey.typing;
  const typed=initialStatic?ROUTINE_REQUESTS[0]:journey.typed;
  const current=STEPS[active];
  function select(i:number){const e=root.current;if(enhanced&&e)scrollTo({top:e.getBoundingClientRect().top+scrollY-72+TARGETS[i]*(e.offsetHeight-(stage.current?.offsetHeight??innerHeight)),behavior:"smooth"});else setManual(i);}
  return <section ref={root} id="inicio" className={h.heroStory} data-enhanced={enhanced} data-routine-step={active} data-results={results.map(n=>n.toFixed(3)).join(",")} aria-label="Conheça o Zelo">
    <span id="como-funciona"/>
    <div ref={stage} className={h.heroStage}>
      <div className={h.heroTop}><span><i/> CADA COISA ENCONTRA SEU LUGAR.</span><span>WHATSAPP + PAINEL WEB</span></div>
      <div className={h.heroGrid}>
        <div className={h.heroCopy}><p className={h.kicker}>MAIS VIDA. MENOS COISAS NA CABEÇA.</p><h1>Seu dia{" "}<br/>acontece.{" "}<br/><em>O Zelo organiza.</em></h1><p className={h.heroLead}>Uma conversa cuida dos detalhes. Seu dinheiro, seus compromissos e seus documentos ganham lugar — no pessoal e na empresa.</p><div className={h.heroActions}><a href="#planos">Quero meu Zelo <UiIcon name="arrow"/></a><a href="#espacos">Pessoal e empresa <span>↓</span></a></div><p className={h.heroTrust}>Converse pelo WhatsApp. Acompanhe também no painel.</p></div>
        <div className={h.heroArt} data-active={active} style={{"--mobile-reveal":mobileReveal} as CSSProperties} role="img" aria-label={`Conversa ilustrativa no WhatsApp com o Zelo: ${current.label}. ${current.description}`}>
          <div className={h.artBackdrop} aria-hidden="true"><span>menos pendências.<br/><b>mais presença.</b></span><i/><i/><i/></div>
          <div className={h.artHeading} aria-hidden="true"><span>DA CONVERSA PARA A SUA ROTINA</span><b>↗</b></div>
          <div className={h.phoneShell} aria-hidden="true"><div className={h.phone}>
            <div className={h.phoneStatus}><span>9:41</span><i/><span>● ▰</span></div>
            <div className={h.whatsappLabel}>WhatsApp</div>
            <div className={h.phoneHeader}><span>‹</span><Image src="/brand/zelo-icon.png" alt="" width={37} height={37}/><div><b>Zelo</b><small>Gestão inteligente</small></div><ChatIcon kind="video"/><ChatIcon kind="call"/></div>
            <div className={h.phoneChat}><span className={h.chatDate}>HOJE</span><span className={h.chatPrivacy}>Conversa de demonstração · dados fictícios</span><div className={h.chatWelcome}>Olá! O que vamos tirar da sua cabeça hoje?<small>09:40</small></div><div className={h.phoneMessage} key={active}>{active===2&&<div className={h.phoneAttachment}><UiIcon name="document"/><span>Contrato.pdf<small>DOCUMENTO DE EXEMPLO</small></span></div>}<p>{typed}{typing<1&&<i/>}</p><small>09:41 <b>{typing<1?"· digitando":"✓✓"}</b></small></div><div className={h.phoneReply} style={{opacity:results[active]}}><b>Zelo</b>{current.reply}<small>09:41</small></div></div>
            <div className={h.phoneInput}><span>+</span><p>{typing<1?"Digitando…":"Mensagem"}</p><ChatIcon kind="camera"/><i><ChatIcon kind="mic"/></i></div>
            <div className={h.phoneKeyboard}>{["qwertyuiop","asdfghjkl","zxcvbnm"].map(row=><div key={row}>{row.split("").map(letter=><span key={letter} data-active={typing<1&&typed.at(-1)?.toLowerCase()===letter}>{letter}</span>)}</div>)}<div><span>123</span><b>espaço</b><span>↵</span></div></div>
          </div></div>
          <div className={h.resultStack} aria-hidden="true">
            {[0,1,2].map(i=><div className={h.resultSlot} key={i} data-active={active===i}>
              <div className={h.resultGuide} style={{opacity:1-results[i]}}><span>0{i+1}</span><UiIcon name={i===0?"wallet":i===1?"calendar":"folder"}/><b>{i===0?"O gasto ganha contexto.":i===1?"O compromisso ganha horário.":"O arquivo ganha lugar."}</b></div>
              <div className={h.resultCard} data-result={i} data-complete={results[i]===1} style={{"--reveal":results[i],"--origin-y":`${162-i*191}px`,opacity:results[i],transform:`translate(${-130*(1-results[i])}px,calc(var(--entry-y) * ${1-results[i]})) scale(${.78+.22*results[i]}) rotate(${-5*(1-results[i])}deg)`,visibility:results[i]>0?"visible":"hidden"} as CSSProperties}>
                {i===0?<><div className={h.resultEyebrow}><span>✓ GASTO ORGANIZADO</span><b>Pessoal</b></div><strong>R$ 85<span>,00</span></strong><div className={h.expenseDetail}><UiIcon name="cart"/><p>Supermercado<small>Débito · Conta pessoal</small></p><span>↗</span></div></>:i===1?<><div className={h.resultEyebrow}><span>✓ COMPROMISSO NA AGENDA</span><b>Empresa</b></div><div className={h.meetingResult}><div><span>AMANHÃ</span><strong>10<span>h</span></strong></div><p>Reunião com<br/>a equipe<small>O próximo passo está à vista.</small></p></div><div className={h.meetingAgendaStrip}>{["SEG","TER","QUA","QUI","SEX"].map((day,j)=><span key={day} data-day={j===0}>{day}<i/></span>)}</div></>:<><div className={h.resultEyebrow}><span>✓ ARQUIVO GUARDADO</span><b>Drive</b></div><div className={h.documentResult}><span><UiIcon name="document"/>PDF</span><p>Contrato.pdf<small>Contratos / Documento de exemplo</small></p><UiIcon name="arrow"/></div><div className={h.fileHint}><UiIcon name="search"/>Depois, peça: “Encontre meu contrato.”</div></>}
              </div>
            </div>)}
          </div>
          <span className={h.artDemo} aria-hidden="true">EXEMPLOS ILUSTRATIVOS · DADOS FICTÍCIOS</span>
        </div>
      </div>
      <div className={h.heroBottom}><nav aria-label="Etapas da demonstração">{STEPS.map((step,i)=><button type="button" key={step.label} onClick={()=>select(i)} aria-current={active===i?"step":undefined}><span>0{i+1}</span><b>{step.label}</b><i/></button>)}</nav><div className={h.stepNarrative}><b>{current.title}</b><p>{current.description}</p></div><a href="#espacos">{enhanced?"Role e veja acontecer":"Continue para conhecer"}<span>↓</span></a></div>
      <div className={h.heroProgress} aria-hidden="true"><span style={{transform:`scaleX(${value})`}}/></div>
    </div>
  </section>;
}
