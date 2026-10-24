"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import { usePresentationMotion, useVisible } from "./PresentationMotion";
import s from "./cinematic-hero.module.css";

const ACTIVITY = [
  {
    person: "Rita",
    role: "Finanças",
    request: "Quanto tenho nas minhas contas?",
    result: "Seus bancos, na mesma conversa.",
    icon: "finance" as const,
  },
  {
    person: "Lucas",
    role: "Agenda",
    request: "Marque minha reunião para amanhã.",
    result: "Seu próximo compromisso, organizado.",
    icon: "calendar" as const,
  },
  {
    person: "Dora",
    role: "Arquivos",
    request: "Guarde este contrato para mim.",
    result: "O arquivo certo. Na hora que precisar.",
    icon: "folder" as const,
  },
];

export default function CinematicHero() {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const visible = useVisible(section);
  const { running, reduced } = usePresentationMotion();
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [activity, setActivity] = useState(0);
  useEffect(() => {
    const movie = video.current;
    if (!movie) return;
    const sync = () => {
      if (running && visible && !document.hidden)
        movie
          .play()
          .then(() => setBlocked(false))
          .catch(() => setBlocked(true));
      else movie.pause();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      movie.pause();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [running, visible, failed]);
  useEffect(() => {
    if (!running || !visible) return;
    const timer = setInterval(() => {
      if (!document.hidden)
        setActivity((value) => (value + 1) % ACTIVITY.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [running, visible]);
  const scene = ACTIVITY[activity];
  return (
    <section
      ref={section}
      id="inicio"
      className={s.hero}
      aria-label="Uma equipe de IA no seu WhatsApp"
    >
      <div className={s.film} aria-hidden="true">
        <Image
          src="/brand/cinematic/zelo-immersive-poster.webp"
          fill
          priority
          sizes="100vw"
          alt=""
        />
        {!reduced && !failed && (
          <video
            ref={video}
            muted
            loop
            playsInline
            preload="metadata"
            poster="/brand/cinematic/zelo-immersive-poster.webp"
            onError={() => setFailed(true)}
          >
            <source
              src="/brand/cinematic/zelo-immersive-mobile.mp4"
              media="(max-width:650px)"
              type="video/mp4"
            />
            <source
              src="/brand/cinematic/zelo-immersive-4k.mp4"
              type="video/mp4"
            />
          </video>
        )}
      </div>
      <div className={s.shade} />
      <div className={s.topline}>
        <span>
          <i /> IA NO WHATSAPP
        </span>
        <a href="#open-finance">
          AGORA COM OPEN FINANCE <span>↗</span>
        </a>
      </div>
      <div className={s.copy}>
        <h1>
          <span>Um time inteiro.</span>
          <span>No seu</span>
          <em>WhatsApp.</em>
        </h1>
        <p>
          Você tem muito para viver.
          <br />
          <strong>A Zelo tem uma equipe para organizar.</strong>
        </p>
        <p className={s.explain}>
          Finanças, bancos, agenda, tarefas e documentos. Peça com suas palavras
          e acompanhe cada ação na conversa e no painel.
        </p>
        <div className={s.actions}>
          <a className={s.primary} href="#equipe">
            Conheça seu time <UiIcon name="arrow" />
          </a>
          <a className={s.secondary} href="#como-funciona">
            <span>▶</span> Veja a Zelo em ação
          </a>
        </div>
      </div>
      <div className={s.activity} key={scene.person} aria-hidden="true">
        <div className={s.activityHead}>
          <Image
            src={`/brand/team/${scene.person.toLowerCase()}.png`}
            width={44}
            height={44}
            alt=""
          />
          <div>
            <strong>
              {scene.person}
              <span> · {scene.role}</span>
            </strong>
            <small>AGENTE VIRTUAL ZELO</small>
          </div>
          <i />
        </div>
        <p>“{scene.request}”</p>
        <div className={s.activityResult}>
          <UiIcon name={scene.icon} />
          <span>{scene.result}</span>
          <b>✓</b>
        </div>
        <div className={s.activityProgress}>
          <span />
        </div>
        <small className={s.demo}>EXEMPLO ILUSTRATIVO</small>
      </div>
      <div className={s.bottom}>
        <a href="#como-funciona" className={s.scroll}>
          ROLE. DESCUBRA. SIMPLIFIQUE.<span>↓</span>
        </a>
        <div className={s.teamMini}>
          <div>
            {["rita", "lucas", "dora", "nina"].map((name) => (
              <Image
                key={name}
                src={`/brand/team/${name}.png`}
                width={40}
                height={40}
                alt=""
              />
            ))}
          </div>
          <p>
            <strong>12 agentes. Uma só Zelo.</strong>
            <span>Seu pessoal e suas empresas, organizados.</span>
          </p>
        </div>
      </div>
      {blocked && !failed && running && (
        <button
          type="button"
          className={s.play}
          onClick={() =>
            video.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => {})
          }
        >
          ▶ Reproduzir vídeo
        </button>
      )}
    </section>
  );
}
