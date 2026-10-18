"use client";

import { useEffect, useRef, useState } from "react";
import { STORY_SCENES, storyFrame, storyScrollTarget } from "@/lib/landing-story";
import UiIcon from "@/components/UiIcon";
import StoryVisual from "./StoryVisuals";
import s from "./landing.module.css";

export default function ScrollStory() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(() => storyFrame(0, { top: 0, height: 1, viewport: 1 }));
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let request = 0;
    const measure = () => {
      request = 0;
      if (motion.matches) { setEnhanced(false); return; }
      setEnhanced(true);
      const box = section.getBoundingClientRect();
      const viewport = stage.current?.offsetHeight ?? window.innerHeight;
      setFrame(storyFrame(window.scrollY, { top: box.top + window.scrollY - 72, height: box.height, viewport }));
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

  function goToScene(scene: number) {
    if (!root.current || !enhanced) return;
    const box = root.current.getBoundingClientRect();
    window.scrollTo({ top: storyScrollTarget(scene, { top: box.top + window.scrollY - 72, height: box.height, viewport: stage.current?.offsetHeight ?? window.innerHeight }), behavior: "smooth" });
  }

  return <section ref={root} id="apresentacao" className={s.story} data-enhanced={enhanced} data-active-scene={frame.active} aria-label="Conheça o Zelo em seis cenas">
    <div ref={stage} className={s.stage}>
      <div className={s.storyTop}><span><i /> GESTÃO INTELIGENTE, DIRETO NO WHATSAPP</span><a href="#recursos">Explorar recursos <UiIcon name="arrow" /></a></div>
      <div className={s.storyGrid}>
        <div className={s.copyStack}>
          {STORY_SCENES.map((scene, index) => {
            const Heading = index === 0 ? "h1" : "h2";
            return <article key={scene.id} className={s.sceneCopy} aria-hidden={enhanced && frame.active !== index} style={enhanced ? { opacity: frame.weights[index], transform: `translateY(${(index - frame.position) * 24}px)`, visibility: frame.weights[index] > 0 ? "visible" : "hidden", pointerEvents: frame.active === index ? "auto" : "none" } : undefined}>
              <p className={s.eyebrow}>{scene.eyebrow}</p>
              <Heading>{scene.title}<br /><em>{scene.accent}</em></Heading>
              <p className={s.sceneDescription}>{scene.description}</p>
              <a href="#planos" className={s.primaryButton}>Quero meu Zelo <UiIcon name="arrow" /></a>
              <p className={s.sceneDetail}>{scene.detail}</p>
            </article>;
          })}
        </div>
        <div className={s.visualStack} aria-hidden="true">
          <div className={s.visualOrbit} />
          {STORY_SCENES.map((scene, index) => <div key={scene.id} className={s.visualLayer} style={enhanced ? { opacity: frame.weights[index], transform: `translateY(${(index - frame.position) * 28}px) scale(${0.96 + frame.weights[index] * 0.04})`, visibility: frame.weights[index] > 0 ? "visible" : "hidden" } : undefined}><StoryVisual scene={index} /></div>)}
        </div>
      </div>
      <div className={s.storyBottom}>
        <div className={s.scrollHint}><span>↓</span><div>Role para descobrir<small>Suba para rever cada detalhe.</small></div></div>
        <nav className={s.sceneNav} aria-label="Cenas da apresentação">{STORY_SCENES.map((scene, index) => <button key={scene.id} type="button" aria-label={`Cena ${index + 1}: ${scene.label}`} aria-current={frame.active === index ? "step" : undefined} onClick={() => goToScene(index)}><span>{String(index + 1).padStart(2, "0")}</span><b>{scene.label}</b></button>)}</nav>
        <small className={s.demoLabel}>Demonstração ilustrativa · dados fictícios</small>
      </div>
      <div className={s.progress} aria-hidden="true"><span style={{ transform: `scaleX(${frame.progress})` }} /></div>
    </div>
  </section>;
}
