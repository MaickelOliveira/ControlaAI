import Image from "next/image";
import type { ReactNode } from "react";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import { VIRTUAL_TEAM } from "@/lib/virtual-team";
import { agentExamples, type AgentExample } from "./agent-examples";
import PlanLink from "./PlanLink";
import s from "./agent-function-sections.module.css";

const icons = {
  finance: "wallet",
  agenda: "calendar",
  task: "task",
  reminder: "bell",
  drive: "folder",
  goal: "target",
  grocery: "cart",
  vehicle: "car",
  people: "client",
  employee: "users",
  nfse: "document",
  support: "search",
} satisfies Record<keyof typeof VIRTUAL_TEAM, UiIconName>;

const areas = ["Finanças", "Rotina", "Organização", "Empresa"] as const;

function agentId(example: AgentExample) {
  return `agente-${VIRTUAL_TEAM[example.key].name.toLowerCase()}`;
}

function AgentSection({ example, children }: { example: AgentExample; children?: ReactNode }) {
  const { name } = VIRTUAL_TEAM[example.key];
  const id = agentId(example);
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={s.agent} data-area={example.area}>
      <Image
        className={s.portrait}
        src={`/brand/team/ilustrados/${name.toLowerCase()}.webp`}
        width={512}
        height={512}
        sizes="(max-width: 600px) 86px, (max-width: 860px) 128px, (max-width: 1200px) 16vw, 210px"
        alt=""
      />
      <header className={s.identity}>
        <p className={s.byline}><strong>{name}</strong><span>{example.topic}</span></p>
        <h3 id={`${id}-titulo`}>{example.title}</h3>
      </header>
      <div className={s.copy}>
        <p>{example.description}</p>
        {example.note && <p className={s.note}>{example.note}</p>}
      </div>
      <div className={s.action}><PlanLink /></div>
      <figure className={s.example}>
        <figcaption>Exemplo de pedido</figcaption>
        <blockquote>{example.request}</blockquote>
        <div className={s.result} data-kind={example.key}>
          <div className={s.resultTitle}>
            <span className={s.icon}><UiIcon name={icons[example.key]} /></span>
            <h4>{example.resultTitle}</h4>
          </div>
          <dl className={s.rows}>
            {example.rows.map((row) => (
              <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
            ))}
          </dl>
          {example.progress && (
            <div className={s.progress}>
              <label htmlFor={`${id}-progresso`}>{example.progress.label}</label>
              <progress id={`${id}-progresso`} max={100} value={example.progress.value} />
            </div>
          )}
        </div>
      </figure>
      {children && <div className={s.more}>{children}</div>}
    </section>
  );
}

type GuideProps = { detailsByAgent?: Partial<Record<keyof typeof VIRTUAL_TEAM, ReactNode>> };

export default function AgentFunctionSections({ detailsByAgent }: GuideProps) {
  return (
    <section id="equipe" aria-labelledby="recursos" className={s.guide}>
      <div className={s.inner}>
        <header className={s.intro}>
          <div>
            <h2 id="recursos">O que você quer organizar?</h2>
            <p>Conheça os 12 agentes de IA da Zelo. Escolha um assunto para ver o que pedir pelo WhatsApp e como fica o resultado.</p>
          </div>
          <PlanLink />
        </header>
        <nav className={s.directory} aria-label="Ir para uma função da Zelo">
          {areas.map((area) => (
            <div key={area}>
              <strong>{area}</strong>
              <ul>
                {agentExamples.filter((example) => example.area === area).map((example) => (
                  <li key={example.key}><a href={`#${agentId(example)}`}>{example.topic}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={s.profiles} id="funcoes-dos-agentes">
          {agentExamples.map((example) => (
            <AgentSection key={example.key} example={example}>
              {detailsByAgent?.[example.key]}
            </AgentSection>
          ))}
        </div>
      </div>
    </section>
  );
}
