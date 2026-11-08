"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import UiIcon from "@/components/UiIcon";
import { usePresentationMotion } from "./PresentationMotion";
import s from "./cinematic-hero.module.css";

const QUESTION = "Rita, quanto tenho no Nubank, Inter e Santander?";
const TYPING_MS = 720;

const DEMO_ACCOUNTS = [
  { id: "nubank", name: "Nubank", value: "R$ 3.250,00" },
  { id: "inter", name: "Inter", value: "R$ 2.170,00" },
  { id: "santander", name: "Santander", value: "R$ 3.000,00" },
];

const OTHER_BANKS = [
  { id: "sicredi", name: "Sicredi" },
  { id: "banco-do-brasil", name: "Banco do Brasil" },
  { id: "bradesco", name: "Bradesco" },
];

function BankNodes({ banks, className }: {
  banks: { id: string; name: string }[];
  className: string;
}) {
  return (
    <div className={className}>
      {banks.map((bank) => (
        <div key={bank.id} className={s.bankNode}>
          <div className={s.bankChip}>
            <Image src={`/brand/banks/${bank.id}.svg`} width={48} height={48} alt="" />
            <span>{bank.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CinematicHero() {
  const { running } = usePresentationMotion();
  const chat = useRef<HTMLDivElement>(null);
  const typedText = useRef<HTMLSpanElement>(null);
  const played = useRef(false);

  useEffect(() => {
    const body = chat.current;
    const letters = typedText.current;
    if (!running || played.current || !body || !letters || !("IntersectionObserver" in window)) return;

    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < 0.5) return;
      observer.disconnect();
      played.current = true;
      body.dataset.typing = "true";
      const start = performance.now();
      const type = (now: number) => {
        const progress = Math.min(1, Math.max(0, now - start) / TYPING_MS);
        const length = Math.floor(QUESTION.length * progress);
        letters.textContent = QUESTION.slice(0, length);
        if (length < QUESTION.length) frame = requestAnimationFrame(type);
      };
      frame = requestAnimationFrame(type);
    }, { threshold: 0.5 });
    observer.observe(body);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      delete body.dataset.typing;
      letters.textContent = "";
    };
  }, [running]);

  return (
    <section id="inicio" className={s.hero} aria-labelledby="hero-title">
      <div className={s.backdrop} aria-hidden="true">
        <span className={s.giantWord}>ZELO</span>
        <div className={s.yellowDisc} />
        <div className={s.trackOne} />
        <div className={s.trackTwo} />
      </div>
      <div className={s.sceneGrid}>
        <div className={s.copy}>
          <div className={s.headline}>
            <h1 id="hero-title">
              <span>Sua vida organizada.</span>{" "}
              <span>No seu</span>{" "}
              <span className={s.accent}>WhatsApp.</span>
            </h1>
            <p>Consulte suas finanças, marque compromissos e organize tarefas e documentos em uma conversa com a Zelo.</p>
          </div>
          <div className={s.actions}>
            <a className={s.primary} href="#planos">Ver planos <UiIcon name="arrow" /></a>
            <p>Plano mensal <strong>R$ 47,00</strong></p>
          </div>
          <div className={s.proof}>
            <div>
              {["rita", "lucas", "bia", "dora"].map((name) => (
                <Image key={name} src={`/brand/team/ilustrados/${name}.webp`} width={38} height={38} alt="" />
              ))}
            </div>
            <a href="#equipe"><strong>Conheça os 12 agentes de IA</strong><span>Veja o que você pode pedir a cada um ↓</span></a>
          </div>
        </div>
        <figure className={s.stage} id="como-funciona" aria-labelledby="conexoes-da-zelo">
          <div className={s.connectionScene}>
            <BankNodes className={s.bankGroupLeft} banks={DEMO_ACCOUNTS} />
            <div className={s.phoneWrap}>
              <div className={s.phone}>
                <div className={s.deviceTop} aria-hidden="true"><span>9:41</span><b /><span>▮▮▮ ▰</span></div>
                <div className={s.chatHeader}>
                  <span className={s.back} aria-hidden="true">‹</span>
                  <Image src="/brand/zelo-icon.png" width={40} height={40} alt="" />
                  <div><strong>Zelo</strong><small>Seu time de IA</small></div>
                </div>
                <div className={s.chatBody} ref={chat}>
                  <p className={s.demoLabel}>Demonstração com valores fictícios</p>
                  <div className={s.outgoing}>
                    <p className={s.question}>
                      <span className={s.transcript}>{QUESTION}</span>
                      <span className={s.typedText} ref={typedText} aria-hidden="true" />
                    </p>
                    <small aria-hidden="true">09:41 ✓✓</small>
                  </div>
                  <div className={s.reply}>
                    <span className={s.typingIndicator} aria-hidden="true">Rita está digitando…</span>
                    <div className={s.incoming}>
                      <strong className={s.agentLabel}>Rita <span>· Finanças</span></strong>
                      <p>Suas três contas somam <strong>R$ 8.420,00</strong>.</p>
                      <div className={s.bankRows}>
                        {DEMO_ACCOUNTS.map((bank) => (
                          <div key={bank.id}>
                            <Image src={`/brand/banks/${bank.id}.svg`} width={20} height={20} alt="" />
                            <span>{bank.name}</span><b>{bank.value}</b>
                          </div>
                        ))}
                      </div>
                      <small className={s.time} aria-hidden="true">09:41</small>
                    </div>
                  </div>
                </div>
                <div className={s.composer} aria-hidden="true"><span>+</span><div>Mensagem</div></div>
                <div className={s.homeIndicator} />
              </div>
            </div>
            <BankNodes className={s.bankGroupRight} banks={OTHER_BANKS} />
          </div>
          <figcaption className={s.networkCaption} id="conexoes-da-zelo">
            Você escolhe quais bancos conectar à Zelo pelo Open Finance.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
