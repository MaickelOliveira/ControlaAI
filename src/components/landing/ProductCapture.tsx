"use client";

import { useEffect, useId, useRef } from "react";
import Image from "next/image";
import x from "./experience.module.css";

type Props = { src:string; title:string; alt:string; width?:number; height?:number; initialPan?:number };
export default function ProductCapture({src,title,alt,width=1687,height=932,initialPan=150}:Props) {
  const dialog=useRef<HTMLDialogElement>(null);
  const pan=useRef<HTMLDivElement>(null);
  const id=useId();
  useEffect(()=>{ if(window.innerWidth<768&&pan.current)pan.current.scrollLeft=initialPan; },[initialPan]);
  return <figure className={x.productCapture}>
    <div className={x.captureBar}><span><i /><i /><i /></span><p>ZELO / {title}</p><button type="button" onClick={()=>dialog.current?.showModal()} aria-label={`Ampliar ${title}`}>Ampliar <span>↗</span></button></div>
    <div ref={pan} className={x.capturePan} tabIndex={0} role="region" aria-label={`${title}: deslize para explorar a captura`}><Image src={src} width={width} height={height} alt={alt} unoptimized /></div>
    <figcaption className={x.captureCaption}><span>Interface da plataforma · Dados de demonstração</span><span>Deslize para explorar ↔</span></figcaption>
    <dialog ref={dialog} className={x.captureDialog} aria-labelledby={id} onClick={event=>{if(event.target===dialog.current)dialog.current.close();}}><div className={x.captureDialogHead}><h3 id={id}>{title}</h3><button type="button" onClick={()=>dialog.current?.close()} autoFocus>Fechar <span>×</span></button></div><div className={x.captureDialogScroll}><Image src={src} width={width} height={height} alt={alt} unoptimized /></div><p className={x.dialogNote}>Captura da interface da Zelo com informações fictícias para apresentação.</p></dialog>
  </figure>;
}
