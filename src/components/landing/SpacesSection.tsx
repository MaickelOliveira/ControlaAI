"use client";

import { useState } from "react";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import s from "./landing.module.css";
const SPACES: { title:string; label:string; icon:UiIconName; description:string; rows:string[] }[] = [
  {title:"Sua vida pessoal",label:"Pessoal",icon:"home",description:"Finanças da casa, compras, contatos, metas e compromissos. Tudo no seu contexto, para você consultar sem misturar com os negócios.",rows:["Meta da viagem","Compras da semana","Contas da casa"]},
  {title:"Cada empresa",label:"Minha empresa",icon:"business",description:"Selecione a empresa antes de registrar ou consultar. Clientes, equipe, financeiro e arquivos pertencem àquele espaço. As conexões Google também são configuradas por espaço.",rows:["Clientes e propostas","Financeiro da empresa","Documentos e equipe"]},
  {title:"As pessoas com você",label:"Compartilhado",icon:"users",description:"Vincule família, sócios ou equipe para cada pessoa usar o próprio WhatsApp, conforme os acessos disponíveis. Os dados continuam no contexto pessoal ou empresarial correspondente.",rows:["Família e rotina","Sócios e decisões","Equipe e compromissos"]},
];
export default function SpacesSection() {
  const [selected,setSelected] = useState(0);
  const current=SPACES[selected];
  return <section id="espacos" className={s.spaces}><span id="modo" /><div className={s.spacesInner}>
    <div className={s.spacesCopy}><p className={s.eyebrow}>JUNTOS NA ROTINA. CADA UM NO SEU ESPAÇO.</p><h2>Uma vida.<br /><em>Vários mundos.</em></h2><p>Seu pessoal e seus negócios podem conviver.<br />A organização sabe o lugar de cada um.</p><div className={s.spaceChoices}>{SPACES.map((space,i)=><button type="button" key={space.label} aria-pressed={selected===i} onClick={()=>setSelected(i)}><UiIcon name={space.icon} /><span>{space.title}</span><b>{selected===i?"−":"+"}</b></button>)}</div><p className={s.spaceDescription}>{current.description}</p></div>
    <div className={s.spaceArt} aria-label={`Exemplo de organização no espaço ${current.label}`}><div className={s.spaceBackOne} /><div className={s.spaceBackTwo} /><div className={s.spaceWindow}><div className={s.spaceWindowTop}><span>zelo<span> / espaços</span></span><i>● ● ●</i></div><div className={s.spaceSymbol}><UiIcon name={current.icon} /></div><small>VOCÊ ESTÁ EM</small><h3>{current.label}</h3><div className={s.spaceWindowRows}>{current.rows.map((row,i)=><div key={row}><span>0{i+1}</span><b>{row}</b><UiIcon name="arrow" /></div>)}</div><div className={s.spaceWindowFoot}><span><i /> Tudo no contexto certo</span><small>DEMONSTRAÇÃO</small></div></div><span className={s.spaceOrbit}>SUA VIDA, BEM CONECTADA ↗</span></div>
  </div></section>;
}
