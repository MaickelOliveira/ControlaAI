"use client";

import { useRef, useState } from "react";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import { usePresentationMotion, useVisible } from "./PresentationMotion";
import s from "./workspace-journey.module.css";

type Space = {
  name: string;
  kind: string;
  icon: UiIconName;
  records: { icon: UiIconName; label: string; example: string }[];
  explanation: string;
  request: string;
  answer: string;
};

const SPACES: Space[] = [
  {
    name: "Meu espaço pessoal",
    kind: "MINHA VIDA",
    icon: "person",
    records: [
      { icon: "wallet", label: "Minhas finanças", example: "Despesas da casa" },
      {
        icon: "calendar",
        label: "Minha agenda",
        example: "Consulta no dentista",
      },
      { icon: "folder", label: "Meus arquivos", example: "Apólice do seguro" },
    ],
    explanation:
      "Aqui ficam os registros da sua vida pessoal. Cada empresa tem seu próprio espaço.",
    request: "Registre R$ 90 de farmácia no Pessoal.",
    answer: "Despesa registrada somente no Pessoal.",
  },
  {
    name: "Estúdio Aurora",
    kind: "EMPRESA 01",
    icon: "business",
    records: [
      {
        icon: "wallet",
        label: "Finanças do estúdio",
        example: "Custos dos projetos",
      },
      {
        icon: "calendar",
        label: "Agenda do estúdio",
        example: "Reunião com cliente",
      },
      {
        icon: "folder",
        label: "Arquivos do estúdio",
        example: "Contrato do projeto",
      },
    ],
    explanation:
      "Aqui ficam apenas os registros do Estúdio Aurora. O Pessoal e a Loja Central têm seus próprios espaços.",
    request: "Registre R$ 120 de materiais na empresa.",
    answer: "Despesa registrada somente no Estúdio Aurora.",
  },
  {
    name: "Loja Central",
    kind: "EMPRESA 02",
    icon: "business",
    records: [
      {
        icon: "wallet",
        label: "Finanças da loja",
        example: "Compras de mercadorias",
      },
      {
        icon: "calendar",
        label: "Agenda da loja",
        example: "Visita do fornecedor",
      },
      {
        icon: "folder",
        label: "Arquivos da loja",
        example: "Catálogo do fornecedor",
      },
    ],
    explanation:
      "Aqui ficam apenas os registros da Loja Central. O Pessoal e o Estúdio Aurora têm seus próprios espaços.",
    request: "Registre R$ 120 de materiais na empresa.",
    answer: "Despesa registrada somente na Loja Central.",
  },
];

export default function WorkspaceJourney() {
  const [active, setActive] = useState(1);
  const root = useRef<HTMLElement>(null);
  const { running } = usePresentationMotion();
  const visible = useVisible(root);
  const chosen = SPACES[active];

  function spaceButton(space: Space, index: number) {
    return (
      <button
        key={space.name}
        type="button"
        className={s.space}
        data-active={active === index}
        aria-pressed={active === index}
        aria-label={`Explorar ${space.name}`}
        aria-controls="workspace-demonstration"
        onClick={() => setActive(index)}
      >
        <div className={s.spaceTop}>
          <span>{space.kind}</span>
          <b aria-hidden="true">{active === index ? "✓" : "↗"}</b>
        </div>
        <h4>{space.name}</h4>
        <ul className={s.previewRows}>
          {space.records.map((record) => (
            <li key={record.label}>
              <UiIcon name={record.icon} />
              <div>
                <small>{record.label}</small>
                <strong>{record.example}</strong>
              </div>
            </li>
          ))}
        </ul>
        <span className={s.spaceCaption}>
          {index === 0
            ? "Só os seus registros pessoais."
            : "Só os registros desta empresa."}
        </span>
      </button>
    );
  }

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
              Sua vida pessoal
              <br />e sua empresa.
              <br />
              <em>Cada uma no seu espaço.</em>
            </h2>
          </div>
          <div className={s.introduction}>
            <p>
              Organize o pessoal e o empresarial separadamente.
              <br />
              <strong>Com a mesma IA no WhatsApp.</strong>
            </p>
            <p>
              Um espaço para você. Um espaço para cada empresa. Cada um com suas
              finanças, agenda, arquivos e permissões.
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
            <span>VEJA COMO FICA SEPARADO</span>
            <small>Demonstração · dados fictícios</small>
          </div>
          <div
            className={s.spaceMap}
            role="group"
            aria-label="Exemplo de espaço"
          >
            <div className={s.personalGroup}>
              <div className={s.groupHeading}>
                <UiIcon name="person" />
                <div>
                  <h3>Pessoal</h3>
                  <p>Sua vida, no seu espaço.</p>
                </div>
              </div>
              {spaceButton(SPACES[0], 0)}
            </div>
            <div className={s.businessGroup}>
              <div className={s.groupHeading}>
                <UiIcon name="business" />
                <div>
                  <h3>Empresarial</h3>
                  <p>Um espaço para cada empresa.</p>
                </div>
              </div>
              <div className={s.businessSpaces}>
                {SPACES.slice(1).map((space, index) =>
                  spaceButton(space, index + 1),
                )}
              </div>
            </div>
          </div>
          <div
            className={s.selectionNote}
            aria-live="polite"
            aria-atomic="true"
          >
            <UiIcon name={chosen.icon} />
            <p>
              <strong>Espaço {chosen.name} selecionado.</strong>
              <span>{chosen.explanation}</span>
            </p>
          </div>

          <div id="workspace-demonstration" className={s.whatsappExample}>
            <div className={s.exampleIntro}>
              <span>NA MESMA CONVERSA DO WHATSAPP</span>
              <h3>
                Você pede.
                <br />A Zelo separa.
              </h3>
              <p>
                Se o pedido não indicar qual empresa, a IA pergunta antes de
                agir.
              </p>
            </div>
            <div className={s.exampleMessages} key={active}>
              <p className={s.sent}>
                <small>VOCÊ</small>
                {chosen.request}
              </p>
              {active !== 0 && (
                <>
                  <p className={s.received}>
                    <small>ZELO</small>Em qual empresa: Estúdio Aurora ou Loja
                    Central?
                  </p>
                  <p className={s.companyAnswer}>
                    <span aria-hidden="true">✓</span>
                    {chosen.name}
                    <small>VOCÊ ESCOLHE</small>
                  </p>
                </>
              )}
              <p className={s.confirmation}>
                <span aria-hidden="true">✓</span>
                {chosen.answer}
              </p>
            </div>
          </div>
          <p className={s.note}>
            Selecione um espaço para ver o exemplo. Dados fictícios. Recursos
            empresariais conforme o acesso contratado; integrações exigem
            autorização.
          </p>
        </div>
      </div>
    </section>
  );
}
