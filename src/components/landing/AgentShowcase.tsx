"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { VIRTUAL_TEAM } from "@/lib/virtual-team";
import { AGENT_ACTIONS } from "@/lib/landing-agent-actions";
import { usePresentationMotion, useVisible } from "./PresentationMotion";
import s from "./agent-showcase.module.css";
import TeamEntrance from "./TeamEntrance";

const TEAM = [
  {
    key: "finance",
    title: "Seu dinheiro.\nUma visão inteira.",
    text: "Do cafezinho aos dados dos seus bancos. A Rita reúne os registros para você entender o presente e acompanhar os próximos compromissos.",
    tags: ["Open Finance", "Receitas e despesas", "Faturas e parcelas"],
    color: "#fec307",
  },
  {
    key: "agenda",
    title: "Seu tempo merece\nmais espaço.",
    text: "O Lucas organiza compromissos, ajuda a mudar os planos e conecta sua agenda ao Google do espaço escolhido.",
    tags: ["Google Agenda", "Google Meet", "Compromissos"],
    color: "#a5cce0",
  },
  {
    key: "task",
    title: "Ideias viram planos.\nPlanos viram ação.",
    text: "O Theo transforma o que você precisa fazer em tarefas com contexto, prazo e prioridade. O próximo passo fica claro.",
    tags: ["Prazos", "Prioridades", "Andamento"],
    color: "#d6b6e8",
  },
  {
    key: "reminder",
    title: "Lembre do que importa.\nNa hora certa.",
    text: "A Bia ajuda você a programar avisos e lembretes recorrentes para receber no WhatsApp. Sua rotina com menos esquecimentos.",
    tags: ["Avisos no WhatsApp", "Recorrências", "Horários"],
    color: "#b7dfbf",
  },
  {
    key: "drive",
    title: "Pare de procurar.\nComece a encontrar.",
    text: "A Dora guarda, organiza e encontra documentos. Do contrato ao comprovante, seu arquivo volta para você na conversa.",
    tags: ["PDFs e fotos", "Pastas", "Busca de arquivos"],
    color: "#b8ccf3",
  },
  {
    key: "goal",
    title: "Dê um próximo passo\naos seus sonhos.",
    text: "A Nina ajuda a definir objetivos, registrar conquistas e acompanhar o progresso. Você sabe quanto avançou e o que ainda falta.",
    tags: ["Objetivos", "Progresso", "Prazos"],
    color: "#e9b4c5",
  },
  {
    key: "grocery",
    title: "Sua lista em dia.\nSuas compras também.",
    text: "A Lia organiza itens e quantidades, acompanha o que já foi comprado e consulta os preços que você registrou.",
    tags: ["Lista de compras", "Histórico", "Supermercado"],
    color: "#cbdc9d",
  },
  {
    key: "vehicle",
    title: "Seu carro tem história.\nE cada gasto conta.",
    text: "O Caio reúne abastecimentos, seguros, manutenções e outros custos no histórico de cada veículo.",
    tags: ["Abastecimento", "Manutenção", "Custos por veículo"],
    color: "#edc3a2",
  },
  {
    key: "people",
    title: "Conexões que você\nnão quer perder.",
    text: "A Clara organiza clientes e contatos, encontra informações e mantém cada cadastro atualizado no espaço certo.",
    tags: ["Clientes", "Contatos", "Dados atualizados"],
    color: "#c0d8e5",
  },
  {
    key: "employee",
    title: "Sua empresa cresce.\nA organização acompanha.",
    text: "O Hugo cuida dos cadastros administrativos dos funcionários, dos cargos e das informações da equipe de cada empresa.",
    tags: ["Funcionários", "Cargos e salários", "Cadastros"],
    color: "#c7c3eb",
  },
  {
    key: "nfse",
    title: "Sua preparação fiscal.\nCom tudo no lugar.",
    text: "O Otto organiza dados fiscais, serviços e rascunhos de NFS-e. Emissão direta e PDF oficial ainda aguardam homologação.",
    tags: ["Dados fiscais", "Serviços", "Rascunhos de NFS-e"],
    color: "#fec307",
  },
  {
    key: "support",
    title: "Não sabe por onde ir?\nComece pela Zoe.",
    text: "A Zoe apresenta os caminhos da Zelo, explica como usar os recursos e ajuda nas pesquisas de informações públicas.",
    tags: ["Primeiros passos", "Ajuda", "Pesquisa"],
    color: "#a8d3bd",
  },
] as const;

export default function AgentShowcase() {
  const section = useRef<HTMLElement>(null);
  const visible = useVisible(section);
  const { running } = usePresentationMotion();
  const [selected, setSelected] = useState(0);
  const [action, setAction] = useState(0);
  const [manual, setManual] = useState(false);
  const [hovered, setHovered] = useState(false);
  const agent = TEAM[selected];
  const identity = VIRTUAL_TEAM[agent.key];
  const actions = AGENT_ACTIONS[agent.key];
  const chosen = actions[action] ?? actions[0];
  const pick = (index: number) => {
    setSelected((index + TEAM.length) % TEAM.length);
    setAction(0);
    setManual(true);
  };
  useEffect(() => {
    if (!running || !visible || manual || hovered) return;
    const timer = setInterval(() => {
      if (!document.hidden) {
        setSelected((value) => (value + 1) % TEAM.length);
        setAction(0);
      }
    }, 18000);
    return () => clearInterval(timer);
  }, [running, visible, manual, hovered]);
  return (
    <>
      <TeamEntrance
        onChoose={(index) => {
          pick(index);
          document
            .getElementById("funcoes-dos-agentes")
            ?.scrollIntoView({ behavior: running ? "smooth" : "instant" });
        }}
      />
      <section
        id="funcoes-dos-agentes"
        ref={section}
        data-visible={visible}
        className={s.team}
        style={{ "--agent-color": agent.color } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setManual(true)}
      >
        <span id="recursos" className={s.anchor} />
        <div className={s.heading}>
          <p className={s.label}>04 / TODAS AS FUNÇÕES. UM TIME AO SEU LADO.</p>
          <h2>
            Você não precisa
            <br />
            dar conta de <em>tudo sozinho.</em>
          </h2>
          <p>
            Conheça os 12 agentes virtuais da Zelo. Cada um apresenta uma área
            da plataforma — todos na mesma conversa do WhatsApp.
          </p>
        </div>
        <div
          className={s.roster}
          role="group"
          aria-label="Conheça os 12 agentes e suas funções"
        >
          {TEAM.map((item, index) => {
            const person = VIRTUAL_TEAM[item.key];
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected === index}
                onClick={() => pick(index)}
              >
                <Image
                  src={`/brand/team/${person.name.toLowerCase()}.png`}
                  width={72}
                  height={72}
                  alt=""
                />
                <span>
                  {person.name}
                  <small>{person.role}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className={s.stage}>
          <div className={s.portrait} key={agent.key}>
            <Image
              src={`/brand/team/${identity.name.toLowerCase()}.png`}
              alt={`${identity.name}, personagem virtual de ${identity.role} da Zelo`}
              fill
              sizes="(max-width:760px) 100vw, 45vw"
            />
            <div className={s.orbit} />
            <div className={s.portraitShade} />
            <span className={s.index}>
              ZELO INTELLIGENCE / {String(selected + 1).padStart(2, "0")}
            </span>
            <div className={s.agentName}>
              <span>CONHEÇA {identity.gender === "f" ? "A" : "O"}</span>
              <h3>{identity.name}</h3>
              <p>Seu agente de {identity.role}</p>
            </div>
            <div className={s.portraitFoot}>
              <span>
                <i /> IA NO WHATSAPP
              </span>
              <span>PERSONAGEM VIRTUAL</span>
            </div>
          </div>
          <div className={s.detail}>
            <div className={s.detailTop}>
              <span>{String(selected + 1).padStart(2, "0")} / 12</span>
              <div>
                <button
                  type="button"
                  aria-label="Agente anterior"
                  onClick={() => pick(selected - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Próximo agente"
                  onClick={() => pick(selected + 1)}
                >
                  →
                </button>
              </div>
            </div>
            <h3>
              {agent.title.split("\n").map((line, index) => (
                <span key={line}>{index === 1 ? <em>{line}</em> : line}</span>
              ))}
            </h3>
            <p className={s.intro}>{agent.text}</p>
            <div className={s.tags}>
              {agent.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <p className={s.actionLabel}>ESCOLHA O QUE QUER FAZER</p>
            <div
              className={s.actionTabs}
              role="group"
              aria-label={`Funções de ${identity.name}`}
            >
              {actions.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  aria-pressed={action === index}
                  onClick={() => {
                    setAction(index);
                    setManual(true);
                  }}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item.title}
                  <b>{index === action ? "−" : "+"}</b>
                </button>
              ))}
            </div>
            <div
              className={s.actionDemo}
              key={action}
              aria-live={manual ? "polite" : "off"}
            >
              <p className={s.how}>{chosen.how}</p>
              <div className={s.request}>
                <span>VOCÊ PEDE</span>
                <p>“{chosen.request}”</p>
                <small>✓✓</small>
              </div>
              <div className={s.result}>
                <span>O QUE VOCÊ RECEBE</span>
                <p>{chosen.result}</p>
              </div>
            </div>
          </div>
        </div>
        <div className={s.teamFoot}>
          <span>
            Escolha qualquer agente para explorar suas funções. Exemplos
            ilustrativos.
          </span>
          <button
            type="button"
            onClick={() => setManual((value) => !value)}
            aria-pressed={!manual}
          >
            {manual ? "▷ Apresentação automática" : "Ⅱ Parar troca automática"}
          </button>
        </div>
      </section>
    </>
  );
}
