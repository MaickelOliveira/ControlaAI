"use client";

import { useState } from "react";
import UiIcon from "@/components/UiIcon";
import s from "./landing.module.css";
import x from "./experience.module.css";
const EXAMPLES=[
  {label:"Pessoal",title:"A vida que é sua.",description:"Contas da casa, compras, documentos e a próxima conquista. Escolha o Pessoal para cuidar da sua rotina e consultar os registros desse espaço.",request:"Gastei R$ 85 no mercado, na conta pessoal.",value:"R$ 85,00",category:"Supermercado",rows:["Contas da casa","Compras da semana","Meta da viagem"]},
  {label:"Empresa",title:"O que você está construindo.",description:"Clientes, equipe, compromissos e financeiro no contexto da empresa escolhida. Cada negócio tem seus registros e suas conexões Google configuradas no próprio espaço.",request:"Recebi R$ 2.400 de um serviço. Registre na minha empresa.",value:"R$ 2.400,00",category:"Receita de serviços",rows:["Clientes e atendimentos","Equipe e documentos","Financeiro do negócio"]},
];
export default function SpacesSection(){
  const [selected,setSelected]=useState(0);
  const [organized,setOrganized]=useState(false);
  const current=EXAMPLES[selected];
  function select(index:number){setSelected(index);setOrganized(false);}
  return <section id="espacos" className={x.spacesExperience}><span id="modo"/>
    <div className={x.spacePriority}><span>01 / UM ZELO. DOIS CONTEXTOS.</span><span>PESSOAL + EMPRESAS</span></div><div className={x.spacesEditorial}><div><p className={s.eyebrow}>CABE TUDO NA SUA VIDA. NÃO NA MESMA CONTA.</p><h2>A vida é uma só.<br /><em>O controle é separado.</em></h2></div><p>O mercado da casa é pessoal. A receita de um serviço é da empresa. No Zelo, você escolhe o espaço de cada pedido — e acompanha cada contexto com clareza.</p></div>
    <div className={x.contextExperience}>
      <div className={x.contextGuide}><span>01 / ESCOLHA O DESTINO</span><nav aria-label="Escolher espaço de demonstração">{EXAMPLES.map((item,i)=><button key={item.label} type="button" aria-pressed={selected===i} onClick={()=>select(i)}><UiIcon name={i===0?"home":"business"}/>{item.label}</button>)}</nav><h3>{current.title}</h3><p>{current.description}</p><div className={x.contextRequest}><small>02 / UM PEDIDO DO DIA A DIA</small><p>“{current.request}”</p></div><button type="button" className={x.contextAction} onClick={()=>setOrganized(!organized)}>{organized?"Recomeçar exemplo":"Veja onde esse pedido fica"}<UiIcon name="arrow"/></button><p className={x.contextFeedback} aria-live="polite">{organized?`Demonstração: registro no ${current.label}. O outro espaço permanece separado.`:"Toque no botão e acompanhe o destino do exemplo. Simulação sem alterar sua conta."}</p></div>
      <div className={x.contextWorlds} aria-label="Dois espaços separados">{EXAMPLES.map((item,i)=><div key={item.label} className={x.contextWorld} data-active={selected===i} data-organized={selected===i&&organized} data-tone={i===0?"personal":"business"}><div className={x.contextWorldTop}><span>zelo</span><b><UiIcon name={i===0?"home":"business"}/>{item.label}</b></div><div className={x.contextWorldSymbol}><UiIcon name={i===0?"home":"business"}/></div><span className={x.contextScope}>{i===0?"VIDA PESSOAL · CONTAS PF":"SEU NEGÓCIO · CONTAS PJ"}</span><h3>{i===0?"O que é seu.":"O que é da empresa."}</h3><div className={x.contextRecord}>{selected===i&&organized?<><span>✓ REGISTRO ORGANIZADO</span><strong>{item.value}</strong><b>{item.category}</b><p>{item.label} · Exemplo de demonstração</p></>:<><span>CADA COISA NO SEU LUGAR</span>{item.rows.map((row,j)=><p key={row}><small>0{j+1}</small>{row}<span>↗</span></p>)}</>}</div><p className={x.contextWorldFooter}>{selected===i?"DESTINO SELECIONADO":"CONTEXTO SEPARADO"}</p></div>)}</div>
    </div>
    <div className={x.spaceReasons}><div><span>01</span><h3>Contas no contexto certo</h3><p>Contas bancárias PF no Pessoal e PJ na empresa correspondente, conforme a conexão disponível.</p></div><div><span>02</span><h3>Mais de uma empresa?</h3><p>Cada negócio tem seu espaço. Escolha a empresa para consultar e organizar os registros dela.</p></div><div><span>03</span><h3>Uma rotina mais clara</h3><p>Finanças, compromissos, tarefas e documentos acompanham o contexto em que foram organizados.</p></div></div>
    <div className={x.sharingStory}><div className={x.sharingPeople} aria-hidden="true"><span>F</span><span>S</span><span>E</span></div><div><h3>Com quem faz parte da sua vida.</h3><p>Família, sócios ou equipe podem usar o próprio número de WhatsApp, conforme os acessos disponíveis. As informações continuam no contexto pessoal ou empresarial correspondente.</p></div><span>FAMÍLIA · SÓCIOS · EQUIPE</span></div>
  </section>;
}
