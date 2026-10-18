"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AGENT_SCENES, STORY_SCENES, storyFrame, storyScrollTarget } from "@/lib/landing-story";
import UiIcon from "@/components/UiIcon";
import ZeloCore from "./ZeloCore";
import s from "./landing.module.css";

export default function ScrollStory() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState(() => storyFrame(-1, { top: 0, height: 1, viewport: 1 }));
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let request = 0;
    const measure = () => {
      request = 0;
      if (motion.matches || window.innerHeight < 640 || (window.innerWidth < 768 && window.innerHeight < 740)) { setEnhanced(false); return; }
      setEnhanced(true);
      const box = section.getBoundingClientRect();
      setFrame(storyFrame(window.scrollY, { top: box.top + window.scrollY - 72, height: box.height, viewport: stage.current?.offsetHeight ?? window.innerHeight }));
    };
    const schedule = () => { if (!request) request = window.requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(section);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
    };
  }, []);

  useEffect(() => {
    const nav = rail.current;
    const button = nav?.children[frame.active] as HTMLElement | undefined;
    if (nav && button && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: button.offsetLeft - nav.offsetLeft - nav.clientWidth / 2 + button.offsetWidth / 2, behavior: "instant" });
    }
  }, [frame.active]);

  function goToScene(scene: number) {
    if (!root.current) return;
    if (!enhanced) { document.getElementById(STORY_SCENES[scene].id)?.scrollIntoView({ behavior: "instant" }); return; }
    const box = root.current.getBoundingClientRect();
    window.scrollTo({ top: storyScrollTarget(scene, { top: box.top + window.scrollY - 72, height: box.height, viewport: stage.current?.offsetHeight ?? window.innerHeight }), behavior: "smooth" });
  }

  const visibility = (index: number): CSSProperties | undefined => enhanced ? { visibility: frame.active === index ? "visible" : "hidden" } : undefined;
  const inactive = (index: number) => enhanced && frame.active !== index;

  return <section ref={root} id="apresentacao" className={s.story} data-enhanced={enhanced} data-active-scene={frame.active} aria-label="Conheça a equipe virtual da Zelo">
    <span id="como-funciona" />
    <div ref={stage} className={s.stage}>
      <div className={s.storyTop}><span><i /> SUA EQUIPE VIRTUAL. SEU UNIVERSO ORGANIZADO.</span><a href="#recursos">Explore o Zelo <UiIcon name="arrow" /></a></div>
      <div className={s.journeyBody}>
        <article id="universo" className={`${s.journeyScene} ${s.introScene}`} aria-hidden={inactive(0)} inert={inactive(0)} style={visibility(0)}>
          <div className={s.journeyCopy}>
            <p className={s.eyebrow}>12 ESPECIALISTAS. UMA ÚNICA CONVERSA.</p>
            <h1>Sua rotina.<br />Em outra<br /><em>dimensão.</em></h1>
            <p className={s.sceneDescription}>Conheça a equipe virtual que conecta suas finanças, seus compromissos e sua vida. Tudo no WhatsApp que você já usa.</p>
            <div className={s.heroActions}><a href="#planos" className={s.primaryButton}>Quero minha equipe <UiIcon name="arrow" /></a><button type="button" className={s.textButton} onClick={() => goToScene(1)}>Conhecer os agentes <span>↓</span></button></div>
            <div className={s.heroProof}><span className={s.miniFaces}>{AGENT_SCENES.slice(0, 4).map(agent => <Image key={agent.id} src={agent.portrait} alt="" width={40} height={40} sizes="40px" />)}</span><p><b>Sua vida e seus negócios.</b><span>Um Zelo para cada detalhe.</span></p></div>
          </div>
          <div className={s.universeArt} aria-hidden="true">
            <ZeloCore position={Math.min(frame.position, 1)} enabled={enhanced} />
            <span className={s.orbitPath} /><span className={s.orbitPath2} />
            {[0, 1, 2, 5, 7, 10].map((idx, i) => { const agent = AGENT_SCENES[idx]; return <div className={`${s.orbitPerson} ${s[`orbitPerson${i}`]}`} key={agent.id}><Image src={agent.portrait} alt="" width={144} height={144} sizes="(max-width: 767px) 72px, 144px" priority={i < 3} /><span>{agent.name}<small>{agent.role}</small></span></div>; })}
            <div className={s.coreCaption}><i /> ZELO INTELLIGENCE<span>12 especialidades conectadas</span></div>
          </div>
        </article>
        {AGENT_SCENES.map((agent, i) => {
          const index = i + 1;
          const offset = Math.max(-1, Math.min(1, frame.position - index));
          return <article id={agent.id} key={agent.id} data-agent={agent.id} className={`${s.journeyScene} ${s.agentScene}`} aria-hidden={inactive(index)} inert={inactive(index)} style={enhanced ? { visibility: frame.weights[index] > 0 ? "visible" : "hidden" } : undefined}>
            <div className={s.journeyCopy} style={visibility(index)}>
              <p className={s.eyebrow}><span>{String(index).padStart(2, "0")} / 12</span> · {agent.role.toUpperCase()}</p>
              <h2>Conheça {agent.gender === "m" ? "o" : "a"}<br />{" "}<em>{agent.name}.</em></h2>
              <h3>{agent.headline}</h3>
              <p className={s.agentDescription}>{agent.description}</p>
              <ul className={s.capabilities}>{agent.capabilities.map(capability => <li key={capability}><span>↗</span>{capability}</li>)}</ul>
              <p className={s.agentDetail}>{agent.detail}</p>
            </div>
            <div className={s.agentArt} style={enhanced ? { opacity: frame.weights[index], transform: `perspective(1200px) rotateY(${offset * -9}deg) translateY(${offset * -35}px)` } : undefined}>
              <span className={s.agentNumber}>{String(index).padStart(2, "0")}</span>
              <div className={s.portraitFrame}><Image src={agent.portrait} alt={`Retrato da personagem virtual ${agent.name}, de ${agent.role}`} fill sizes="(max-width: 767px) 82vw, 480px" loading="lazy" /><div className={s.portraitCaption}><span>ZELO / {agent.role}</span><b>{agent.name}</b><small>PERSONAGEM VIRTUAL</small></div></div>
              <div className={s.agentChat}><div className={s.chatLabel}><span /> EXEMPLO DE CONVERSA <small>WHATSAPP</small></div><p className={s.chatRequest}>{agent.example}</p><p className={s.chatReply}><b>{agent.name}</b>{agent.exampleReply}</p></div>
            </div>
          </article>;
        })}
        <article id="equipe" className={`${s.journeyScene} ${s.finaleScene}`} aria-hidden={inactive(13)} inert={inactive(13)} style={visibility(13)}>
          <div className={s.journeyCopy}><p className={s.eyebrow}>CADA ESPECIALIDADE. O MESMO CUIDADO.</p><h2>Sua equipe.<br /><em>Seu Zelo.</em></h2><p className={s.sceneDescription}>Você não precisa escolher com quem falar. Envie seu pedido naturalmente: a Zelo organiza cada detalhe no espaço certo.</p><a href="#planos" className={s.primaryButton}>Ter minha equipe agora <UiIcon name="arrow" /></a><p className={s.agentDetail}>Personagens virtuais da mesma plataforma. Seus dados e suas confirmações continuam na sua conta.</p></div>
          <div className={s.teamMosaic}>{AGENT_SCENES.map(agent => <div key={agent.id}><Image src={agent.portrait} alt={agent.name} width={150} height={150} sizes="(max-width: 767px) 22vw, 150px" /><span>{agent.name}<small>{agent.role}</small></span></div>)}</div>
        </article>
      </div>
      <div className={s.journeyFooter}>
        <div className={s.scrollHint}><span>↓</span><p>Role para conhecer<small>Suba para rever.</small></p></div>
        <nav ref={rail} className={s.agentRail} aria-label="Escolher agente da apresentação">{STORY_SCENES.map((scene, index) => <button key={scene.id} type="button" title={scene.label} aria-label={index > 0 && index < 13 ? `Conhecer ${scene.label}` : scene.label} aria-current={frame.active === index ? "step" : undefined} onClick={() => goToScene(index)}>{index > 0 && index < 13 ? <Image src={AGENT_SCENES[index - 1].portrait} alt="" width={42} height={42} sizes="42px" /> : <span>{index === 0 ? "✦" : "↗"}</span>}<b>{scene.label}</b></button>)}</nav>
        <a className={s.skipJourney} href="#recursos">Ir aos recursos <span>↗</span></a>
      </div>
      <div className={s.progress} aria-hidden="true"><span style={{ transform: `scaleX(${frame.progress})` }} /></div>
    </div>
  </section>;
}
