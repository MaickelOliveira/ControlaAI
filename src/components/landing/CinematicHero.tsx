"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import { usePresentationMotion, useVisible } from "./PresentationMotion";
import s from "./cinematic-hero.module.css";

const SCENES = [
  {
    label: "Uma conversa",
    eyebrow: "SUA VIDA TEM UM NOVO CONTATO.",
    lines: ["Sua vida organizada.", "No seu", "WhatsApp."],
    accent: 2,
    text: "Finanças, agenda, tarefas e documentos. Resolva com seu time de IA, no WhatsApp que você já usa.",
    agent: "Rita",
    role: "Finanças",
    question: "Rita, quanto tenho nas minhas contas?",
    intro: "Você tem R$ 8.420,00 nas contas conectadas. Aqui está o resumo:",
    kind: "balance",
    result: "Seu dinheiro, em uma resposta.",
  },
  {
    label: "Seus bancos",
    eyebrow: "OPEN FINANCE + INTELIGÊNCIA ARTIFICIAL.",
    lines: ["Seus bancos.", "Agora na", "conversa."],
    accent: 2,
    text: "Conecte as contas que você autorizar. Pergunte por saldos, faturas, parcelas e empréstimos. A Rita consulta os dados recebidos.",
    agent: "Rita",
    role: "Finanças",
    question: "E quanto ainda tenho parcelado?",
    intro: "Nos dados recebidos, identifiquei estas próximas parcelas:",
    kind: "installments",
    result: "Mais clareza sobre o que vem aí.",
  },
  {
    label: "Tudo organizado",
    eyebrow: "PEDIU NO WHATSAPP. APARECEU NO PAINEL.",
    lines: ["Uma mensagem.", "Tudo", "no lugar."],
    accent: 2,
    text: "Conte o que aconteceu. A Zelo organiza os detalhes e, quando falta alguma informação, pergunta antes de continuar.",
    agent: "Rita",
    role: "Finanças",
    question:
      "Gastei R$ 85 no mercado hoje. Na minha conta Dinheiro, no Pessoal.",
    intro: "Registrado no seu espaço Pessoal!",
    kind: "expense",
    result: "Converse. Confira. Continue seu dia.",
  },
  {
    label: "Seu time",
    eyebrow: "12 AGENTES. UM SÓ ZELO.",
    lines: ["Você pede.", "Seu time", "resolve."],
    accent: 2,
    text: "A Rita cuida das finanças. O Lucas organiza a agenda. A Dora encontra seus arquivos. E seu time tem muito mais para fazer por você.",
    agent: "Lucas",
    role: "Agenda",
    question: "Lucas, marque a reunião com a Ana amanhã às 10h no Pessoal.",
    intro: "Compromisso criado na sua agenda pessoal:",
    kind: "agenda",
    result: "Sua rotina, com uma equipe ao lado.",
  },
] as const;

const BANKS = [
  { id: "nubank", name: "Nubank", value: "R$ 3.250,00" },
  { id: "inter", name: "Inter", value: "R$ 2.170,00" },
  { id: "santander", name: "Santander", value: "R$ 3.000,00" },
];

function scrollGeometry(section: HTMLElement, frame: HTMLElement) {
  const top = Number.parseFloat(getComputedStyle(frame).top) || 0;
  return {
    start: section.getBoundingClientRect().top + scrollY - top,
    travel: Math.max(1, section.offsetHeight - frame.offsetHeight),
  };
}

export default function CinematicHero() {
  const section = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const visible = useVisible(section);
  const { running, reduced } = usePresentationMotion();
  const [scene, setScene] = useState(0);
  const [beat, setBeat] = useState(0);
  const [shortWideViewport, setShortWideViewport] = useState(false);
  const staticMode = reduced || shortWideViewport;
  const current = SCENES[scene];

  useEffect(() => {
    const query = matchMedia(
      "(min-width: 701px) and (max-height: 620px), (orientation: landscape) and (max-height: 620px)",
    );
    const sync = () => setShortWideViewport(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (staticMode) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const node = section.current;
      const pinned = sticky.current;
      if (!node || !pinned) return;
      // Use the rendered sticky frame: mobile browser bars can make innerHeight
      // differ from the stable viewport used by the layout.
      const { start, travel } = scrollGeometry(node, pinned);
      const progress = Math.min(1, Math.max(0, (scrollY - start) / travel));
      node.style.setProperty("--scroll", String(progress));
      node.style.setProperty("--travel", `${progress * -150}px`);
      node.style.setProperty("--rotation", `${-15 + progress * 35}deg`);
      setScene(Math.min(3, Math.floor(progress * 4)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    if (section.current) observer.observe(section.current);
    if (sticky.current) observer.observe(sticky.current);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [staticMode]);

  useEffect(() => {
    // Reveal the exact same demonstration text, rather than generating financial claims.
    const start = setTimeout(() => setBeat(running ? 0 : 3), 0);
    if (!running || !visible) return () => clearTimeout(start);
    const timers = [800, 1700, 2900].map((ms, index) =>
      setTimeout(() => setBeat(index + 1), ms),
    );
    return () => {
      clearTimeout(start);
      timers.forEach(clearTimeout);
    };
  }, [scene, running, visible]);

  const choose = (index: number) => {
    if (staticMode) {
      setScene(index);
      return;
    }
    const node = section.current;
    const pinned = sticky.current;
    if (!node || !pinned) return;
    const { start, travel } = scrollGeometry(node, pinned);
    scrollTo({
      top: start + travel * [0, 0.33, 0.59, 0.86][index],
      behavior: running ? "smooth" : "instant",
    });
  };

  return (
    <section
      ref={section}
      id="inicio"
      className={`${s.hero} ${staticMode ? s.static : ""}`}
      data-scene={scene}
      data-beat={beat}
      aria-label="Veja a Zelo funcionando no WhatsApp"
    >
      <span id="como-funciona" className={s.anchor} />
      <div ref={sticky} className={s.sticky}>
        <div className={s.backdrop} aria-hidden="true">
          <span className={s.giantWord}>ZELO</span>
          <div className={s.yellowDisc} />
          <div className={s.trackOne} />
          <div className={s.trackTwo} />
          <span className={s.plusOne}>+</span>
          <span className={s.plusTwo}>+</span>
        </div>
        <div className={s.sceneGrid}>
          <div className={s.copy}>
            <p className={s.eyebrow}>
              <i />
              {current.eyebrow}
            </p>
            <div className={s.headline} key={`title-${scene}`}>
              <h1>
                {current.lines.map((line, index) => (
                  <span
                    key={line}
                    className={index === current.accent ? s.accent : undefined}
                  >
                    {line}
                  </span>
                ))}
              </h1>
              <p>{current.text}</p>
            </div>
            <div className={s.actions}>
              <a className={s.primary} href="#planos">
                Quero meu time <UiIcon name="arrow" />
              </a>
              <button
                className={s.secondary}
                type="button"
                onClick={() => choose((scene + 1) % 4)}
              >
                Veja acontecer <span>↘</span>
              </button>
            </div>
            <div className={s.proof}>
              <div>
                {["rita", "lucas", "dora", "theo"].map((name) => (
                  <Image
                    key={name}
                    src={`/brand/team/${name}.png`}
                    width={38}
                    height={38}
                    alt=""
                  />
                ))}
              </div>
              <p>
                <strong>Seu pessoal. Suas empresas.</strong>
                <span>12 agentes, na mesma conversa.</span>
              </p>
            </div>
          </div>

          <div className={s.stage}>
            <div className={s.phoneWrap}>
              <div className={s.phone}>
                <div className={s.deviceTop}>
                  <span>9:41</span>
                  <b />
                  <span>▮▮▮ ▰</span>
                </div>
                <div className={s.chatHeader}>
                  <span className={s.back}>‹</span>
                  <Image
                    src="/brand/zelo-icon.png"
                    width={40}
                    height={40}
                    alt=""
                  />
                  <div>
                    <strong>
                      Zelo <span>✓</span>
                    </strong>
                    <small>
                      {beat === 1
                        ? `${current.agent} está digitando…`
                        : "Seu time de IA"}
                    </small>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path d="M5 3h4l2 5-3 2c2 4 3 5 7 7l2-3 5 2v4c0 2-2 3-4 2C9 20 3 14 2 6c0-2 1-3 3-3Z" />
                  </svg>
                  <span>⋮</span>
                </div>
                <div className={s.chatBody} key={`chat-${scene}`}>
                  <p className={s.today}>HOJE</p>
                  <p className={s.demoLabel}>
                    Conversa demonstrativa · valores fictícios
                  </p>
                  <div className={s.outgoing}>
                    <p>{current.question}</p>
                    <small>
                      09:41 <b>✓✓</b>
                    </small>
                  </div>
                  {beat < 2 && (
                    <div
                      className={s.typing}
                      aria-label="Demonstração de resposta sendo preparada"
                    >
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                  {beat >= 2 && (
                    <div className={s.incoming}>
                      <strong className={s.agentLabel}>
                        {current.agent} <span>· {current.role}</span>
                      </strong>
                      <p>{current.intro}</p>
                      {current.kind === "balance" && (
                        <div className={s.bankRows}>
                          {BANKS.map((bank) => (
                            <div key={bank.id}>
                              <Image
                                src={`/brand/banks/${bank.id}.svg`}
                                width={20}
                                height={20}
                                alt=""
                              />
                              <span>{bank.name}</span>
                              <b>{bank.value}</b>
                            </div>
                          ))}
                          <p>
                            Valores ilustrativos. Consulte a data dos dados
                            recebidos na sua conta.
                          </p>
                        </div>
                      )}
                      {current.kind === "installments" && (
                        <div className={s.installments}>
                          <div>
                            <span>Notebook · parcela 4/10</span>
                            <b>R$ 280,00</b>
                            <small>Vencimento: 10/11</small>
                          </div>
                          <div>
                            <span>Curso · parcela 2/6</span>
                            <b>R$ 120,00</b>
                            <small>Vencimento: 15/11</small>
                          </div>
                          <p>
                            Total deste exemplo: <strong>R$ 400,00</strong>
                          </p>
                        </div>
                      )}
                      {current.kind === "expense" && (
                        <div className={s.expense}>
                          <span>SAÍDA REGISTRADA</span>
                          <strong>R$ 85,00</strong>
                          <dl>
                            <div>
                              <dt>Categoria</dt>
                              <dd>Alimentação</dd>
                            </div>
                            <div>
                              <dt>Conta</dt>
                              <dd>Dinheiro</dd>
                            </div>
                            <div>
                              <dt>Espaço</dt>
                              <dd>Pessoal</dd>
                            </div>
                          </dl>
                        </div>
                      )}
                      {current.kind === "agenda" && (
                        <div className={s.appointment}>
                          <span>AMANHÃ</span>
                          <strong>10:00</strong>
                          <p>Reunião com a Ana</p>
                          <small>Agenda · Pessoal</small>
                        </div>
                      )}
                      <small className={s.time}>09:41</small>
                    </div>
                  )}
                  {beat >= 3 && (
                    <div className={s.receipt}>
                      <span>✓</span>
                      {current.kind === "balance" ||
                      current.kind === "installments"
                        ? "Dados conectados. Resposta organizada."
                        : "Também disponível no seu painel."}
                    </div>
                  )}
                </div>
                <div className={s.composer}>
                  <span>+</span>
                  <div>
                    Mensagem <span>☺</span>
                  </div>
                  <b>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <rect x="9" y="2" width="6" height="13" rx="3" />
                      <path d="M6 11a6 6 0 0 0 12 0M12 17v5m-4 0h8" />
                    </svg>
                  </b>
                </div>
                <div className={s.homeIndicator} />
              </div>
            </div>
            <div className={s.floatingTop} key={`float-${scene}`}>
              <span className={s.badgeIcon}>
                {scene < 2 ? (
                  <UiIcon name="wallet" />
                ) : scene === 2 ? (
                  <UiIcon name="finance" />
                ) : (
                  <UiIcon name="calendar" />
                )}
              </span>
              <div>
                <small>
                  {scene < 2
                    ? "OPEN FINANCE"
                    : scene === 2
                      ? "SEU PAINEL"
                      : "SUA AGENDA"}
                </small>
                <strong>
                  {scene < 2
                    ? "Seus bancos conectados"
                    : scene === 2
                      ? "Despesa organizada"
                      : "Compromisso marcado"}
                </strong>
              </div>
              <span className={s.check}>✓</span>
            </div>
            <div className={s.floatingBottom}>
              <Image
                src={`/brand/team/${current.agent.toLowerCase()}.png`}
                width={46}
                height={46}
                alt=""
              />
              <div>
                <span>
                  {current.agent} · {current.role}
                </span>
                <strong>{current.result}</strong>
              </div>
            </div>
            <div className={s.bankSatellites} aria-hidden="true">
              {BANKS.map((bank, index) => (
                <Image
                  key={bank.id}
                  src={`/brand/banks/${bank.id}.svg`}
                  width={45}
                  height={45}
                  alt=""
                  style={{ "--i": index } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
        <div className={s.bottom}>
          <div className={s.scrollCue}>
            <span>↓</span>
            <p>
              {staticMode
                ? "ESCOLHA UMA CONVERSA ABAIXO"
                : "ROLE PARA VER A ZELO AGIR"}
              <small>
                {staticMode
                  ? "Explore os quatro exemplos."
                  : "A conversa avança com você."}
              </small>
            </p>
          </div>
          <nav
            className={s.chapters}
            aria-label="Cenas da demonstração no WhatsApp"
          >
            {SCENES.map((item, index) => (
              <button
                type="button"
                key={item.label}
                aria-current={scene === index ? "step" : undefined}
                onClick={() => choose(index)}
              >
                <span>0{index + 1}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <span className={s.count}>
            0{scene + 1}
            <small>/ 04</small>
          </span>
        </div>
        <div className={s.progress} aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
