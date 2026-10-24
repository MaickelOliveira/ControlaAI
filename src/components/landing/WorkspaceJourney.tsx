"use client";

import { useRef, useState } from "react";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import { usePresentationMotion, useVisible } from "./PresentationMotion";
import s from "./workspace-journey.module.css";

const SPACES: {
  name: string;
  kind: string;
  icon: UiIconName;
  preview: string;
  items: string[];
  request: string;
  clarification?: string;
  answer: string;
  resultIcon: UiIconName;
  resultLabel: string;
  resultValue: string;
  resultTitle: string;
  resultDetail: string;
}[] = [
  {
    name: "Pessoal",
    kind: "SUA VIDA",
    icon: "person",
    preview: "Mais clareza para o seu dia.",
    items: ["Seu dinheiro", "Sua agenda", "Seus planos"],
    request: "Rita, quanto gastei com supermercado este mês?",
    answer: "No Pessoal, você registrou R$ 480,00 em supermercado neste mês.",
    resultIcon: "finance",
    resultLabel: "RESUMO DO MÊS",
    resultValue: "R$ 480,00",
    resultTitle: "Supermercado",
    resultDetail: "Despesas do espaço Pessoal.",
  },
  {
    name: "Estúdio Aurora",
    kind: "SEU NEGÓCIO",
    icon: "business",
    preview: "Mais espaço para fazer acontecer.",
    items: ["Financeiro", "Clientes", "Compromissos"],
    request: "Rita, marque uma reunião amanhã às 10h na empresa.",
    clarification:
      "Você tem duas empresas. Em qual delas: Estúdio Aurora ou Loja Central?",
    answer: "Reunião criada para amanhã, às 10h, no Estúdio Aurora.",
    resultIcon: "calendar",
    resultLabel: "NA AGENDA DA EMPRESA",
    resultValue: "10:00",
    resultTitle: "Reunião · amanhã",
    resultDetail: "Compromisso do Estúdio Aurora.",
  },
  {
    name: "Loja Central",
    kind: "OUTRA EMPRESA",
    icon: "business",
    preview: "Um novo negócio. Tudo no lugar.",
    items: ["Contas", "Registros", "Acessos"],
    request: "Rita, registre R$ 120 de estoque na empresa.",
    clarification:
      "Você tem duas empresas. Em qual delas: Estúdio Aurora ou Loja Central?",
    answer: "Despesa de R$ 120,00 registrada na Loja Central.",
    resultIcon: "wallet",
    resultLabel: "NO FINANCEIRO DA EMPRESA",
    resultValue: "−R$ 120,00",
    resultTitle: "Compra de estoque",
    resultDetail: "Lançamento da Loja Central.",
  },
];

export default function WorkspaceJourney() {
  const [active, setActive] = useState(1);
  const root = useRef<HTMLElement>(null);
  const { running } = usePresentationMotion();
  const visible = useVisible(root);
  const chosen = SPACES[active];
  return (
    <section
      id="espacos"
      ref={root}
      className={s.section}
      data-animate={running && visible}
    >
      <div className={s.wrap}>
        <div className={s.heading}>
          <div>
            <p className={s.eyebrow}>
              <span>03</span> PESSOAL. EMPRESAS. CADA UM NO SEU ESPAÇO.
            </p>
            <h2>
              Sua vida tem
              <br />
              mais de um lado.
              <br />
              <em>A Zelo acompanha.</em>
            </h2>
          </div>
          <div className={s.introduction}>
            <p>
              A casa, a empresa, o próximo negócio.
              <br />
              <strong>Uma conversa para organizar cada parte.</strong>
            </p>
            <p>
              Suas finanças, compromissos e arquivos ficam no espaço escolhido.
              Você muda de assunto. A Zelo mantém cada registro no lugar.
            </p>
            <div className={s.rule}>
              <UiIcon name="business" />
              <span>
                Mais de uma empresa?
                <br />
                <strong>A IA pergunta em qual delas agir.</strong>
              </span>
            </div>
          </div>
        </div>

        <div className={s.experience} data-scroll-scene="workspace-journey">
          <div className={s.experienceHeader}>
            <span>
              <b>01</b> ESCOLHA UM ESPAÇO PARA EXPLORAR
            </span>
            <small>Demonstração · dados fictícios</small>
          </div>
          <div className={s.spaces} role="group" aria-label="Exemplo de espaço">
            {SPACES.map((space, index) => (
              <button
                key={space.name}
                type="button"
                aria-pressed={active === index}
                aria-controls="workspace-demonstration"
                onClick={() => setActive(index)}
                className={s.space}
                data-active={active === index}
              >
                <div className={s.spaceTop}>
                  <UiIcon name={space.icon} />
                  <span>{space.kind}</span>
                  <b aria-hidden="true">{active === index ? "✓" : "↗"}</b>
                </div>
                <h3>{space.name}</h3>
                <p>{space.preview}</p>
                <div className={s.spaceItems}>
                  {space.items.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className={s.route} aria-hidden="true">
            <span />
            <i />
            <b>Zelo</b>
            <i />
            <span />
          </div>

          <div id="workspace-demonstration" className={s.stage}>
            <div className={s.conversation}>
              <div className={s.chatTop}>
                <div className={s.zeloAvatar}>Z</div>
                <div>
                  <strong>Rita · Zelo</strong>
                  <span>Sua IA no WhatsApp</span>
                </div>
                <small>02 / A CONVERSA</small>
              </div>
              <div className={s.messages} key={`conversation-${active}`}>
                <p className={s.sent}>
                  {chosen.request}
                  <small>
                    Você <span aria-hidden="true">✓✓</span>
                  </small>
                </p>
                {chosen.clarification && (
                  <>
                    <p className={s.received}>{chosen.clarification}</p>
                    <p className={s.sent}>
                      {chosen.name}
                      <small>
                        Você <span aria-hidden="true">✓✓</span>
                      </small>
                    </p>
                  </>
                )}
                <p className={s.received}>
                  {chosen.answer}
                  <span className={s.confirmation}>
                    ✓ Espaço: {chosen.name}
                  </span>
                </p>
              </div>
              <div className={s.chatBottom}>
                <span>Peça com suas palavras.</span>
                <UiIcon name="spark" />
              </div>
            </div>
            <div className={s.result} aria-live="polite" aria-atomic="true">
              <p className={s.resultStep}>03 / NO LUGAR CERTO</p>
              <div key={`result-${active}`} className={s.resultInner}>
                <div className={s.resultSpace}>
                  <UiIcon name={chosen.icon} />
                  <strong>{chosen.name}</strong>
                  <span>ESPAÇO ESCOLHIDO</span>
                </div>
                <div className={s.resultData}>
                  <UiIcon name={chosen.resultIcon} />
                  <p>{chosen.resultLabel}</p>
                  <strong>{chosen.resultValue}</strong>
                  <h3>{chosen.resultTitle}</h3>
                  <span>{chosen.resultDetail}</span>
                </div>
                <p className={s.resultNote}>
                  <span aria-hidden="true">✓</span> Pessoal e outras empresas
                  continuam com seus próprios registros.
                </p>
              </div>
            </div>
          </div>
          <div className={s.foundation}>
            <div>
              <UiIcon name="wallet" />
              <span>
                <strong>Contas e registros</strong>Cada espaço com suas
                finanças.
              </span>
            </div>
            <div>
              <UiIcon name="calendar" />
              <span>
                <strong>Agenda e arquivos</strong>Conexões do espaço escolhido.
              </span>
            </div>
            <div>
              <UiIcon name="users" />
              <span>
                <strong>Pessoas e acessos</strong>Quem participa de cada espaço.
              </span>
            </div>
          </div>
          <p className={s.note}>
            Exemplos ilustrativos. Recursos empresariais conforme o acesso
            contratado; integrações exigem autorização.
          </p>
        </div>
      </div>
    </section>
  );
}
