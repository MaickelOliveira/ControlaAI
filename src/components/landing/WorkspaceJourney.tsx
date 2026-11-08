"use client";

import Image from "next/image";
import { useState } from "react";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import PlanLink from "./PlanLink";
import s from "./workspace-journey.module.css";

type Space = {
  name: string;
  mode: "Pessoal" | "Empresa";
  icon: UiIconName;
  expense: string;
  amount: string;
  records: { icon: UiIconName; label: string; value: string }[];
  request: string;
  answer: string;
};

const SPACES: Space[] = [
  {
    name: "Estúdio Aurora", mode: "Empresa", icon: "business",
    expense: "Materiais de trabalho", amount: "R$ 120,00",
    records: [
      { icon: "client", label: "Cliente", value: "Ateliê Horizonte" },
      { icon: "document", label: "Nota de serviço em preparação", value: "Consultoria para o ateliê" },
    ],
    request: "Rita, gastei R$ 120 em materiais no Estúdio Aurora.",
    answer: "Despesa registrada somente no Estúdio Aurora.",
  },
  {
    name: "Loja Central", mode: "Empresa", icon: "cart",
    expense: "Compra de mercadorias", amount: "R$ 460,00",
    records: [
      { icon: "users", label: "Funcionária", value: "Júlia · Atendimento" },
      { icon: "folder", label: "Arquivo da loja", value: "Catálogo do fornecedor" },
    ],
    request: "Rita, registra R$ 460 de mercadorias na Loja Central.",
    answer: "Despesa registrada somente na Loja Central.",
  },
  {
    name: "Pessoal", mode: "Pessoal", icon: "home",
    expense: "Farmácia", amount: "R$ 90,00",
    records: [
      { icon: "calendar", label: "Minha agenda", value: "Consulta no dentista" },
      { icon: "folder", label: "Meu arquivo", value: "Apólice do seguro" },
    ],
    request: "Rita, registra R$ 90 de farmácia no Pessoal.",
    answer: "Despesa registrada somente no Pessoal.",
  },
];

export default function WorkspaceJourney() {
  const [active, setActive] = useState(0);
  const space = SPACES[active];

  return (
    <section id="modo-empresa" aria-labelledby="titulo-modo-empresa" className={s.section}>
      <div className={s.wrap}>
        <div className={s.heading} id="espacos">
          <div>
            <p className={s.eyebrow}><UiIcon name="business" /> Modo Empresa</p>
            <h2 id="titulo-modo-empresa">Cada empresa tem <em>seu próprio painel.</em></h2>
          </div>
          <p className={s.intro}>
            Escolha uma empresa para acompanhar as contas PJ, os clientes e a equipe.
            No WhatsApp, diga em qual empresa lançar o gasto. Se houver dúvida, a Zelo pergunta.
          </p>
        </div>

        <div className={s.console}>
          <div className={s.switcher}>
            <h3>Experimente trocar de espaço</h3>
            <div className={s.options} role="group" aria-label="Escolha um espaço de demonstração">
              {SPACES.map((item, index) => (
                <button key={item.name} type="button" aria-pressed={active === index}
                  aria-label={`Explorar ${item.name}`} aria-controls="workspace-demonstration"
                  onClick={() => setActive(index)}>
                  <UiIcon name={item.icon} /><span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div id="workspace-demonstration" className={s.workspace} aria-live="polite">
            <div className={s.overview}>
              <div className={s.cover} data-space={active}>
                <div className={s.coverCopy}>
                  <small>{space.mode === "Pessoal" ? "Minha conta" : "Conta PJ"}</small>
                  <h3>{space.name}</h3>
                  <span>Última despesa</span>
                  <strong>{space.amount}</strong>
                  <p>{space.expense}</p>
                </div>
                <div className={s.portrait}>
                  <Image src="/brand/team/ilustrados/rita.webp" alt="" width={400} height={400}
                    sizes="(max-width: 700px) 42vw, 240px" />
                </div>
              </div>
              <dl className={s.records}>
                {space.records.map(record => (
                  <div key={record.label}>
                    <dt><UiIcon name={record.icon} />{record.label}</dt>
                    <dd>{record.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className={s.chat}>
              <div className={s.chatHead}>
                <Image src="/brand/zelo-icon.png" width={38} height={38} alt="" />
                <div><strong>Rita no WhatsApp</strong><span>Agente de finanças da Zelo</span></div>
              </div>
              <p className={s.sent}>{space.request}</p>
              <p className={s.received}>{space.answer}</p>
              <div className={s.receipt}>
                <UiIcon name="task" />
                <div><small>Registrado no extrato de {space.name}</small><strong>{space.expense}</strong></div>
                <b>{space.amount}</b>
              </div>
            </div>
          </div>
        </div>
        <div className={s.foot}><small>Demonstração com dados fictícios.</small><PlanLink /></div>
      </div>
    </section>
  );
}
