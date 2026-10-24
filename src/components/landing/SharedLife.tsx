"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import UiIcon from "@/components/UiIcon";
import { usePresentationMotion, useVisible } from "./PresentationMotion";
import s from "./shared-life.module.css";

const EXAMPLES = [
  {
    label: "Em família",
    space: "Pessoal",
    title: "A rotina da casa, com todo mundo junto.",
    description:
      "Compartilhem a organização das despesas, tarefas e planos da família.",
    people: [
      {
        name: "Você",
        role: "Titular",
        initials: "V",
        request: "Zelo, gastei R$ 80 na farmácia, no Pessoal.",
        result: "Farmácia",
        detail: "Saúde · R$ 80,00",
        author: "você",
      },
      {
        name: "Ana",
        role: "Família",
        initials: "A",
        request: "Zelo, gastei R$ 150 no mercado, no Pessoal.",
        result: "Mercado",
        detail: "Alimentação · R$ 150,00",
        author: "Ana",
      },
      {
        name: "Pedro",
        role: "Família",
        initials: "P",
        request: "Zelo, gastei R$ 25 com transporte, no Pessoal.",
        result: "Transporte",
        detail: "Transporte · R$ 25,00",
        author: "Pedro",
      },
    ],
  },
  {
    label: "Com sócios e equipe",
    space: "Empresarial",
    title: "O negócio anda. A organização acompanha.",
    description:
      "Sócios e equipe participam pelo próprio WhatsApp, com acesso ao modo Empresarial.",
    people: [
      {
        name: "Você",
        role: "Titular",
        initials: "V",
        request: "Zelo, registre R$ 200 de materiais no Estúdio Aurora.",
        result: "Materiais",
        detail: "Estúdio Aurora · R$ 200,00",
        author: "você",
      },
      {
        name: "Bruno",
        role: "Sócio",
        initials: "B",
        request: "Zelo, registre R$ 90 de combustível no Estúdio Aurora.",
        result: "Combustível",
        detail: "Estúdio Aurora · R$ 90,00",
        author: "Bruno",
      },
      {
        name: "Júlia",
        role: "Equipe",
        initials: "J",
        request: "Zelo, registre R$ 45 de entregas no Estúdio Aurora.",
        result: "Entregas",
        detail: "Estúdio Aurora · R$ 45,00",
        author: "Júlia",
      },
    ],
  },
] as const;

export default function SharedLife() {
  const root = useRef<HTMLElement>(null);
  const visible = useVisible(root);
  const { running, reduced } = usePresentationMotion();
  const [group, setGroup] = useState(0);
  const [person, setPerson] = useState(0);
  const [manual, setManual] = useState(false);
  const [focused, setFocused] = useState(false);
  const animate = running && visible;
  const cycling = animate && !manual && !focused;
  const example = EXAMPLES[group];
  const selected = example.people[person];

  useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(
      () => setPerson((value) => (value + 1) % 3),
      5500,
    );
    return () => window.clearInterval(timer);
  }, [cycling, group]);

  return (
    <section
      id="compartilhar"
      ref={root}
      className={s.section}
      data-animate={animate}
      aria-labelledby="sharing-title"
    >
      <div className={s.wrap}>
        <div className={s.heading}>
          <div>
            <p className={s.eyebrow}>
              <UiIcon name="users" /> FAMÍLIA. SÓCIOS. EQUIPE.
            </p>
            <h2 id="sharing-title">
              A Zelo é sua.
              <br />
              <em>
                E de quem está
                <br />
                com você.
              </em>
            </h2>
          </div>
          <div className={s.intro}>
            <p>Inclua quem faz parte da sua vida.</p>
            <p>
              Cada pessoa conversa com a Zelo pelo{" "}
              <strong>próprio WhatsApp.</strong> Vocês organizam juntos a casa
              ou o negócio, com os acessos configurados na conta.
            </p>
            <div className={s.access}>
              <UiIcon name="settings" />
              <span>
                Você define o acesso:
                <br />
                <strong>Pessoal, Empresarial ou os dois.</strong>
              </span>
            </div>
          </div>
        </div>

        <div
          className={s.demonstration}
          onFocusCapture={(event) =>
            setFocused(event.target.matches(":focus-visible"))
          }
          onBlurCapture={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setFocused(false);
          }}
        >
          <div className={s.demoTop}>
            <div
              className={s.switcher}
              role="group"
              aria-label="Exemplos de uso compartilhado"
            >
              {EXAMPLES.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={group === index}
                  aria-controls="sharing-example"
                  onClick={() => {
                    setGroup(index);
                    setPerson(0);
                    setManual(true);
                  }}
                >
                  <UiIcon name={index === 0 ? "home" : "business"} />
                  {item.label}
                </button>
              ))}
            </div>
            <span className={s.demoLabel}>
              Demonstração · pessoas e valores fictícios
            </span>
          </div>

          <div id="sharing-example" className={s.example}>
            <div className={s.network}>
              <div className={s.networkHeading}>
                <h3>{example.title}</h3>
                <p>{example.description}</p>
              </div>
              <div
                className={s.people}
                role="group"
                aria-label="Escolha uma pessoa para ver o exemplo"
              >
                {example.people.map((item, index) => (
                  <button
                    className={s.person}
                    key={item.name}
                    type="button"
                    aria-pressed={person === index}
                    aria-label={`Ver exemplo de ${item.name}`}
                    aria-controls="sharing-message"
                    data-active={person === index}
                    onClick={() => {
                      setPerson(index);
                      setManual(true);
                    }}
                  >
                    <span className={s.avatar}>
                      {item.initials}
                      <i aria-hidden="true">
                        <UiIcon name="person" />
                      </i>
                    </span>
                    <strong>{item.name}</strong>
                    <span>{item.role}</span>
                    <small>Próprio WhatsApp</small>
                  </button>
                ))}
              </div>
              <div className={s.connection} aria-hidden="true">
                <svg
                  className={s.paths}
                  viewBox="0 0 600 110"
                  preserveAspectRatio="none"
                >
                  <path d="M100 0V30Q100 52 125 52H275Q300 52 300 78V110" />
                  <path d="M300 0V110" />
                  <path d="M500 0V30Q500 52 475 52H325Q300 52 300 78V110" />
                  <path
                    className={s.signal}
                    data-active={person === 0}
                    d="M100 0V30Q100 52 125 52H275Q300 52 300 78V110"
                  />
                  <path
                    className={s.signal}
                    data-active={person === 1}
                    d="M300 0V110"
                  />
                  <path
                    className={s.signal}
                    data-active={person === 2}
                    d="M500 0V30Q500 52 475 52H325Q300 52 300 78V110"
                  />
                </svg>
              </div>
              <div className={s.hub}>
                <span className={s.logo}>
                  <Image
                    src="/brand/zelo-wordmark-light.png"
                    width={108}
                    height={49}
                    alt="Zelo"
                  />
                </span>
                <div>
                  <strong>Uma conta. Mais gente participando.</strong>
                  <span>Exemplo no modo {example.space}</span>
                </div>
              </div>
            </div>

            <div
              className={s.conversation}
              id="sharing-message"
              aria-live={manual ? "polite" : "off"}
              aria-atomic="true"
            >
              <div className={s.conversationTop}>
                <span className={s.smallAvatar}>{selected.initials}</span>
                <div>
                  <strong>
                    {selected.name === "Você"
                      ? "No seu WhatsApp"
                      : `No WhatsApp de ${selected.name}`}
                  </strong>
                  <span>Conversa individual com a Zelo</span>
                </div>
                <UiIcon name="spark" />
              </div>
              <div className={s.messageSequence} key={`${group}-${person}`}>
                <p className={s.sent}>
                  <small>{selected.name}</small>
                  {selected.request}
                  <span aria-hidden="true">✓✓</span>
                </p>
                <p className={s.received}>
                  <small>ZELO</small>Pronto! Registrei a despesa no{" "}
                  {group === 0 ? "Pessoal" : "Estúdio Aurora"}.
                  <span>
                    <UiIcon name="task" /> Identificado quem registrou
                  </span>
                </p>
                <div className={s.record}>
                  <span className={s.recordLabel}>NA ORGANIZAÇÃO DE VOCÊS</span>
                  <div>
                    <UiIcon name="wallet" />
                    <p>
                      <strong>{selected.result}</strong>
                      <span>{selected.detail}</span>
                    </p>
                  </div>
                  <footer>
                    <UiIcon name="person" /> Registrado por {selected.author}
                  </footer>
                </div>
              </div>
            </div>
          </div>

          <div className={s.demoBottom}>
            <span>
              <i aria-hidden="true" />
              {!running
                ? "Escolha uma pessoa para ver o exemplo"
                : manual
                  ? "Exemplo escolhido por você"
                  : "Veja cada pessoa participar"}
            </span>
            <button
              type="button"
              aria-pressed={!running || manual}
              disabled={!running}
              onClick={() => setManual((value) => !value)}
            >
              {!running
                ? reduced
                  ? "Movimento reduzido ativo"
                  : "Animações pausadas no site"
                : manual
                  ? "▶ Trocar pessoas automaticamente"
                  : "Ⅱ Pausar troca de pessoas"}
            </button>
          </div>
        </div>

        <div className={s.footer}>
          <p>
            <strong>Mais mãos para organizar. Mais tempo para viver.</strong>
            <span>
              Vincule os números em Configurações → Vincular WhatsApp.
            </span>
          </p>
          <small>
            Cada pessoa precisa concluir a vinculação do próprio WhatsApp. Você
            pode ajustar ou remover os números vinculados nas configurações.
          </small>
        </div>
      </div>
    </section>
  );
}
