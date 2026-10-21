"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import x from "./experience.module.css";

const STEPS=[
  {title:"Você escolhe",headline:"Começa com uma escolha sua.",text:"No painel, escolha o espaço Pessoal para a conta PF ou a empresa para a conta PJ. Depois, selecione de qual instituição quer compartilhar os dados.",assurance:"Nenhuma conexão começa só por visitar esta página."},
  {title:"Você autoriza",headline:"A senha fica no seu banco.",text:"Confira as categorias de dados, a finalidade e o prazo da autorização. A autenticação acontece no ambiente do banco, na jornada da Celcoin. O Zelo não pede sua senha bancária.",assurance:"Você decide sobre o compartilhamento antes de confirmar."},
  {title:"Você acompanha",headline:"A informação chega. O controle continua seu.",text:"Os dados autorizados chegam ao painel e podem ser consultados pelo WhatsApp. Compartilhar informações não transfere o seu dinheiro. Você pode revogar o consentimento.",assurance:"Dados e atualização dependem da instituição e da autorização."},
];

export default function OpenFinanceJourney(){
  const root=useRef<HTMLDivElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const [enhanced,setEnhanced]=useState(false);
  const [progress,setProgress]=useState(0);
  const [manual,setManual]=useState(0);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)");let raf=0;
    const measure=()=>{raf=0;const e=root.current;if(!e)return;const enable=!media.matches&&innerHeight>=740;setEnhanced(enable);if(enable){const box=e.getBoundingClientRect();setProgress(Math.min(1,Math.max(0,(92-box.top)/Math.max(1,e.offsetHeight-(stage.current?.offsetHeight??600)))));}};
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(measure);};const observer=new ResizeObserver(schedule);if(root.current)observer.observe(root.current);
    addEventListener("scroll",schedule,{passive:true});addEventListener("resize",schedule);media.addEventListener("change",schedule);schedule();
    return()=>{cancelAnimationFrame(raf);observer.disconnect();removeEventListener("scroll",schedule);removeEventListener("resize",schedule);media.removeEventListener("change",schedule);};
  },[]);
  const active=enhanced?Math.min(2,Math.floor(progress*3)):manual;
  function select(i:number){const e=root.current;if(enhanced&&e)scrollTo({top:scrollY+e.getBoundingClientRect().top-92+(i+.35)/3*(e.offsetHeight-(stage.current?.offsetHeight??600)),behavior:"smooth"});else setManual(i);}
  return <div ref={root} className={x.ofJourney} data-enhanced={enhanced} data-bank-step={active}>
    <div ref={stage} className={x.ofStage} style={{"--flow":enhanced?progress:(active+.5)/3} as CSSProperties}>
      <div className={x.ofJourneyTop}><span>ENTENDA O OPEN FINANCE</span><span>{enhanced?"ROLE PARA ACOMPANHAR ↓":"ESCOLHA UMA ETAPA ↓"}</span></div>
      <div className={x.ofStageBody}>
        <div className={x.ofExplanation}><span>0{active+1} / 03</span><h3>{STEPS[active].headline}</h3><p>{STEPS[active].text}</p><div><span>✓</span>{STEPS[active].assurance}</div></div>
        <div className={x.ofVisual} role="img" aria-label={`Demonstração: ${STEPS[active].title}. ${STEPS[active].headline}`}>
          <div className={x.ofOrbits} aria-hidden="true"><i/><i/><i/></div>
          <div className={x.ofConnectionLine} aria-hidden="true"><span/></div>
          <div className={x.ofBankNode} aria-hidden="true"><Image src="/brand/banks/inter.svg" alt="" width={35} height={35} unoptimized/><span>SEU BANCO</span><b>{active===0?"Conta PF ou PJ":"Dados de origem"}</b></div>
          <div className={x.ofSecureNode} data-active={active>=1} aria-hidden="true"><svg viewBox="0 0 80 90" fill="none"><path d="M40 5 70 17v26c0 20-30 39-30 39S10 63 10 43V17L40 5Z" stroke="currentColor" strokeWidth="2"/><path d="m26 43 10 10 20-24" stroke="currentColor" strokeWidth="3"/></svg><span>CELCOIN / POLP</span><b>{active===0?"Aguarda sua decisão":"Jornada de autorização"}</b></div>
          <div className={x.ofZeloNode} data-active={active===2} aria-hidden="true"><b>zelo</b><span>SEU PAINEL</span><small>{active===2?"Dados autorizados":"Aguarda autorização"}</small></div>
          <div className={x.ofDetailCard} aria-hidden="true" key={active}>
            {active===0?<><small>01 / ESCOLHA A ORIGEM</small><h4>De onde vêm<br/>seus dados?</h4><div className={x.ofBankChoices}>{[["nubank","Nubank"],["inter","Inter"],["bradesco","Bradesco"]].map(([slug,name])=><span key={slug}><Image src={`/brand/banks/${slug}.svg`} alt="" width={28} height={28} unoptimized/>{name}<b>↗</b></span>)}</div><p>Exemplos de instituições. Confira as conexões disponíveis na sua conta.</p></>:active===1?<><small>02 / AUTORIZAÇÃO NO BANCO</small><h4>Você confere.<br/>Você decide.</h4><ul><li>✓ Quais dados serão compartilhados</li><li>✓ Para qual finalidade</li><li>✓ Por quanto tempo</li></ul><div className={x.ofSecureStamp}>SUA SENHA NÃO É PEDIDA PELO ZELO</div></>:<><small>03 / DADOS ORGANIZADOS</small><h4>Uma visão<br/>mais completa.</h4><div className={x.ofReceived}><span>Conta<b>Saldo e movimentações</b></span><span>Cartão<b>Limite e informações disponíveis</b></span></div><div className={x.ofSecureStamp}>SEU DINHEIRO CONTINUA NO BANCO</div></>}
          </div>
        </div>
      </div>
      <nav className={x.ofControls} aria-label="Etapas do Open Finance">{STEPS.map((step,i)=><button key={step.title} type="button" aria-current={active===i?"step":undefined} onClick={()=>select(i)}><span>0{i+1}</span>{step.title}<i/></button>)}</nav>
      <p className={x.ofDemoNote}>Demonstração explicativa. Nenhuma conexão, autorização ou movimentação é feita aqui.</p>
    </div>
  </div>;
}
