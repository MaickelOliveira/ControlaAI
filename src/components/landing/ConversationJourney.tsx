"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePresentationMotion } from "./PresentationMotion";
import s from "./conversation-journey.module.css";

const STEPS = [
  {
    title: (
      <>
        Do seu jeito.
        <br />
        <em>Com suas palavras.</em>
      </>
    ),
    text: "Escreva, mande um áudio ou envie um arquivo. Não precisa aprender um novo jeito de pedir: explique o que precisa, como explicaria para alguém do seu time.",
    detail:
      "Um gasto, um compromisso, uma tarefa ou um documento. Tudo começa na conversa.",
    label: "VOCÊ PEDE",
  },
  {
    title: (
      <>
        O pedido encontra
        <br />
        <em>o agente certo.</em>
      </>
    ),
    text: "A Zelo identifica o que você quer fazer e organiza os dados para a ação. Quando falta valor, data, conta ou empresa, ela pergunta antes de continuar.",
    detail:
      "Mais de uma empresa? Você escolhe em qual delas a ação será feita.",
    label: "SEU TIME ORGANIZA",
  },
  {
    title: (
      <>
        Feito na conversa.
        <br />
        <em>Visível no painel.</em>
      </>
    ),
    text: "Depois da confirmação da ação, você acompanha o resultado no WhatsApp e na plataforma. Consulte, confira e continue a organização de onde estiver.",
    detail: "As informações continuam no espaço escolhido: pessoal ou empresa.",
    label: "VOCÊ ACOMPANHA",
  },
];

export default function ConversationJourney() {
  const section = useRef<HTMLElement>(null);
  const { reduced, running } = usePresentationMotion();
  const [stage, setStage] = useState(0);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 760px), (max-height: 650px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (compact || reduced) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = section.current?.getBoundingClientRect();
      if (!box) return;
      const p = Math.min(1, Math.max(0, -box.top / (box.height - innerHeight)));
      setStage(p < 0.32 ? 0 : p < 0.67 ? 1 : 2);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [compact, reduced]);
  const choose = (index: number) => {
    if (compact || reduced) {
      setStage(index);
      return;
    }
    const node = section.current;
    if (!node) return;
    scrollTo({
      top:
        node.getBoundingClientRect().top +
        scrollY +
        (node.offsetHeight - innerHeight) * [0, 0.48, 0.9][index],
      behavior: running ? "smooth" : "instant",
    });
  };
  const current = STEPS[stage];
  return (
    <section
      ref={section}
      id="como-funciona"
      className={`${s.journey} ${compact || reduced ? s.compact : ""}`}
    >
      <div className={s.sticky}>
        <div className={s.copy}>
          <p className={s.label}>01 / ASSIM A ZELO ENTRA NA SUA VIDA</p>
          <div className={s.chapterNumber} aria-hidden="true">
            0{stage + 1}
            <span>/ 03</span>
          </div>
          <div key={stage} className={s.copyChange}>
            <h2>{current.title}</h2>
            <p>{current.text}</p>
            <div className={s.detail}>
              <span>↗</span>
              {current.detail}
            </div>
          </div>
          <nav aria-label="Etapas da demonstração" className={s.navigation}>
            {STEPS.map((step, index) => (
              <button
                key={step.label}
                type="button"
                onClick={() => choose(index)}
                aria-current={stage === index ? "step" : undefined}
              >
                <span>0{index + 1}</span>
                {step.label}
              </button>
            ))}
          </nav>
        </div>
        <div className={s.visual} data-stage={stage} key={stage}>
          <div className={s.halo} />
          <div className={s.halo2} />
          {stage === 0 && (
            <div className={s.phone}>
              <div className={s.phoneTop}>
                <span>9:41</span>
                <span>••• ▰</span>
              </div>
              <div className={s.chatHead}>
                <Image
                  src="/brand/zelo-icon.png"
                  width={38}
                  height={38}
                  alt=""
                />
                <div>
                  <strong>Zelo</strong>
                  <small>Seu time de IA no WhatsApp</small>
                </div>
                <span>···</span>
              </div>
              <p className={s.demoTag}>DEMONSTRAÇÃO ILUSTRATIVA</p>
              <div className={s.chatMessages}>
                <div className={s.sent}>
                  Gastei R$ 85 no mercado, hoje, no débito da minha conta
                  pessoal.<small>09:41 ✓✓</small>
                </div>
                <div className={s.typing}>
                  <i />
                  <i />
                  <i />
                </div>
                <div className={s.reply}>
                  <strong>Rita · Finanças</strong>
                  <p>Vou organizar esse gasto no seu espaço Pessoal.</p>
                  <div>
                    <span>Alimentação</span>
                    <b>R$ 85,00</b>
                  </div>
                </div>
              </div>
              <div className={s.composer}>
                <span>+</span>
                <p>Converse com a Zelo…</p>
                <b>↗</b>
              </div>
            </div>
          )}
          {stage === 1 && (
            <div className={s.organizing}>
              <div className={s.agentBadge}>
                <Image
                  src="/brand/team/rita.png"
                  width={68}
                  height={68}
                  alt="Rita"
                />
                <div>
                  <span>RITA EM AÇÃO</span>
                  <strong>
                    Uma mensagem.
                    <br />
                    Tudo no lugar.
                  </strong>
                </div>
                <b>✦</b>
              </div>
              <div className={s.fields}>
                {[
                  ["Descrição", "Compra no mercado"],
                  ["Valor", "R$ 85,00"],
                  ["Categoria", "Alimentação"],
                  ["Espaço", "Pessoal"],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    style={{ animationDelay: `${index * 0.18}s` }}
                  >
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <b>✓</b>
                  </div>
                ))}
              </div>
              <p className={s.organizingNote}>
                <span>✓</span> Dados organizados para o lançamento.
              </p>
              <small>
                Exemplo ilustrativo. A Zelo pede os detalhes que faltarem.
              </small>
            </div>
          )}
          {stage === 2 && (
            <div className={s.resultPanel}>
              <div className={s.panelHeader}>
                <Image
                  src="/brand/zelo-icon.png"
                  alt=""
                  width={30}
                  height={30}
                />
                <span>Seu financeiro</span>
                <small>PESSOAL</small>
              </div>
              <p className={s.panelLabel}>DESPESA REGISTRADA</p>
              <div className={s.amount}>
                R$ <strong>85</strong>,00
              </div>
              <div className={s.miniBars} aria-hidden="true">
                {[24, 50, 36, 65, 45, 85, 70].map((height, index) => (
                  <span
                    key={index}
                    style={{
                      height: `${height}%`,
                      animationDelay: `${index * 0.1}s`,
                    }}
                  />
                ))}
              </div>
              <div className={s.transaction}>
                <span>↙</span>
                <div>
                  <strong>Compra no mercado</strong>
                  <small>Alimentação · WhatsApp</small>
                </div>
                <b>−R$ 85,00</b>
              </div>
              <div className={s.confirmed}>
                <span>✓</span> Organizado na conversa.
                <br />
                Disponível no seu painel.
              </div>
              <p className={s.demoTag}>INTERFACE E VALORES ILUSTRATIVOS</p>
            </div>
          )}
          <span className={s.visualCaption}>
            MENSAGEM → INTELIGÊNCIA → AÇÃO
          </span>
        </div>
      </div>
    </section>
  );
}
