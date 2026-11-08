"use client";

import { useRef, useState } from "react";
import PlanLink from "./PlanLink";
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
    kind: "EMPRESA",
    icon: "business",
    records: [
      {
        icon: "wallet",
        label: "Conta PJ",
        example: "R$ 120 em materiais",
      },
      {
        icon: "client",
        label: "Cliente cadastrado",
        example: "Ateliê Horizonte",
      },
      {
        icon: "document",
        label: "Rascunho de NFS-e",
        example: "Consultoria para o ateliê",
      },
    ],
    explanation:
      "Aqui ficam apenas os registros do Estúdio Aurora. O Pessoal e a Loja Central têm seus próprios espaços.",
    request: "Registre R$ 120 de materiais na empresa.",
    answer: "Despesa registrada somente no Estúdio Aurora.",
  },
  {
    name: "Loja Central",
    kind: "EMPRESA",
    icon: "business",
    records: [
      {
        icon: "wallet",
        label: "Conta PJ",
        example: "Compras de mercadorias",
      },
      {
        icon: "users",
        label: "Funcionária cadastrada",
        example: "Júlia · Atendimento",
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
      id="modo-empresa"
      aria-labelledby="titulo-modo-empresa"
      ref={root}
      className={s.section}
      data-animate={running && visible}
    >
      <div className={s.wrap}>
        <div className={s.heading} id="espacos">
          <div>
            <p className={s.eyebrow}>MODO EMPRESA</p>
            <h2 id="titulo-modo-empresa">Gerencie as contas e a rotina <em>da sua empresa.</em></h2>
          </div>
          <div className={s.introduction}>
            <p>
              No painel, escolha <strong>Empresa</strong> e selecione o nome da
              empresa. Para consultar suas despesas de casa, volte ao <strong>Pessoal</strong>.
            </p>
            <p>
              Em cada empresa, acompanhe as entradas e saídas das contas PJ conectadas,
              cadastre clientes e consulte sua equipe de funcionários. Para uma
              prestação de serviço, prepare um rascunho de NFS-e para revisar.
            </p>
          </div>
        </div>

        <div className={s.experience} data-scroll-scene="workspace-journey">
          <div className={s.experienceHeader}>
            <span>ESCOLHA UM ESPAÇO PARA VER O PEDIDO</span>
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
                  <h3>Empresa</h3>
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
              <h3>Registrar uma despesa pelo WhatsApp</h3>
              <p>
                Se você tiver acesso a duas empresas e pedir para lançar uma despesa
                sem dizer em qual delas, a Zelo pergunta antes de registrar.
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
        </div>
        <PlanLink />
      </div>
    </section>
  );
}
