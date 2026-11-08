import Image from "next/image";
import type { ReactNode } from "react";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import { VIRTUAL_TEAM } from "@/lib/virtual-team";
import { AgentExamplePreview } from "./AgentExamplePreview";
import { agentExamples, type AgentExample } from "./agent-examples";
import PlanLink from "./PlanLink";
import s from "./agent-function-sections.module.css";

const areas = {
  Finanças: "wallet",
  Rotina: "calendar",
  Organização: "folder",
  Empresa: "users",
} as const satisfies Record<AgentExample["area"], UiIconName>;

function agentId(example: AgentExample) {
  return `agente-${VIRTUAL_TEAM[example.key].name.toLowerCase()}`;
}

function AgentSection({ example, children }: { example: AgentExample; children?: ReactNode }) {
  const { name } = VIRTUAL_TEAM[example.key];
  const id = agentId(example);
  return (
    <section id={id} className={s.agent} data-area={example.area} data-agent={example.key} aria-labelledby={`${id}-titulo`}>
      <div className={s.spread}>
        <div className={s.editorial}>
          <div className={s.copy}>
            <p className={s.topic}><i aria-hidden="true" />{example.topic}</p>
            <h3 id={`${id}-titulo`}>{example.title}</h3>
            <p className={s.description}>{example.description}</p>
            {example.note && <p className={s.note}>{example.note}</p>}
            <PlanLink />
          </div>
        </div>
        <div className={s.stage}>
          <div className={s.art}>
            <p className={s.signature}>{name}</p>
            <Image
              className={s.portrait}
              src={`/brand/team/ilustrados/${name.toLowerCase()}.webp`}
              width={512}
              height={512}
              sizes="(max-width: 719px) 52vw, (max-width: 1099px) 250px, (max-width: 1930px) 24vw, 450px"
              alt=""
            />
          </div>
          <div className={s.preview}><AgentExamplePreview example={example} agentName={name} /></div>
        </div>
      </div>
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
            <p>Escolha um assunto para conhecer seu agente e ver o que acontece quando você faz um pedido pelo WhatsApp.</p>
          </div>
          <PlanLink />
        </header>
        <nav className={s.directory} aria-label="Ir para uma função da Zelo">
          {Object.entries(areas).map(([area, icon]) => (
            <div key={area}>
              <strong><UiIcon name={icon} />{area}</strong>
              <ul>
                {agentExamples.filter((example) => example.area === area).map((example) => (
                  <li key={example.key}>
                    <a href={`#${agentId(example)}`}>
                      {example.topic}<span aria-hidden="true">↗</span>
                    </a>
                  </li>
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
