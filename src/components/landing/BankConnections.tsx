"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import { useVisible } from "./PresentationMotion";
import s from "./bank-connections.module.css";

const BANKS = [
  { id: "nubank", name: "Nubank", type: "Conta pessoal" },
  { id: "inter", name: "Inter", type: "Conta pessoal" },
  { id: "santander", name: "Santander", type: "Conta pessoal" },
  { id: "sicredi", name: "Sicredi", type: "Cooperativa" },
  { id: "banco-do-brasil", name: "Banco do Brasil", type: "Conta pessoal" },
  { id: "bradesco", name: "Bradesco", type: "Conta pessoal" },
];
const QUESTIONS = [
  {
    label: "Meus saldos",
    question: "Rita, quanto tenho nas minhas contas?",
    title: "Uma visão do seu dinheiro.",
    total: "R$ 8.420,00",
    caption: "TOTAL DESTE EXEMPLO",
    detail: "Aqui estão os saldos das três contas deste exemplo:",
    rows: [
      ["Nubank", "R$ 3.250,00"],
      ["Inter", "R$ 2.170,00"],
      ["Santander", "R$ 3.000,00"],
    ],
    note: "Na sua conta, a resposta considera os valores e as datas de atualização recebidos de cada banco.",
  },
  {
    label: "Minhas parcelas",
    question: "O que eu ainda tenho parcelado?",
    title: "Saiba o que vem pela frente.",
    total: "R$ 400,00",
    caption: "PRÓXIMAS PARCELAS DO EXEMPLO",
    detail: "Estas parcelas continuam nos próximos meses:",
    rows: [
      ["Notebook · 4/10 · 10/11", "R$ 280,00"],
      ["Curso · 2/6 · 15/11", "R$ 120,00"],
    ],
    note: "Parcelas, valores e vencimentos são mostrados quando informados. Previsão não é confirmação de pagamento.",
  },
  {
    label: "Meus empréstimos",
    question: "Quanto falta para quitar meu empréstimo?",
    title: "Entenda o que ainda falta.",
    total: "R$ 10.009,81",
    caption: "SALDO DEVEDOR ILUSTRATIVO",
    detail: "Encontrei um financiamento neste exemplo:",
    rows: [
      ["Financiamento de veículo", "Sicredi"],
      ["Saldo devedor", "R$ 10.009,81"],
      ["Próxima parcela", "Não informada"],
    ],
    note: "A Zelo apresenta o saldo informado pela instituição. Não inventa valores, parcelas ou condições de quitação.",
  },
] as const;

export default function BankConnections() {
  const [selected, setSelected] = useState(0);
  const network = useRef<HTMLDivElement>(null);
  const visible = useVisible(network);
  const chosen = QUESTIONS[selected];
  return (
    <div ref={network} className={s.connection} data-visible={visible}>
      <div className={s.flowHeader}>
        <span>01. VOCÊ CONECTA</span>
        <span>02. A ZELO REÚNE</span>
        <span>03. VOCÊ PERGUNTA</span>
      </div>
      <div className={s.flow}>
        <div className={s.sources}>
          <p className={s.smallTitle}>Seus bancos, com sua autorização.</p>
          <div className={s.bankList}>
            {BANKS.map((bank, index) => (
              <div
                className={s.bank}
                key={bank.id}
                style={{ "--delay": `${index * -0.8}s` } as React.CSSProperties}
              >
                <Image
                  src={`/brand/banks/${bank.id}.svg`}
                  width={34}
                  height={34}
                  alt=""
                />
                <div>
                  <strong>{bank.name}</strong>
                  <span>{bank.type}</span>
                </div>
                <i aria-hidden="true" />
                <span className={s.bankLine} aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
        <div className={s.intelligence}>
          <div className={s.connector} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className={s.core}>
            <div className={s.coreRing} />
            <Image
              src="/brand/zelo-icon.png"
              width={76}
              height={76}
              alt="Zelo"
            />
          </div>
          <strong>
            Conectou.
            <br />
            Pode perguntar.
          </strong>
          <p>
            Os dados chegam.
            <br />A Rita organiza a resposta.
          </p>
          <div className={s.signals}>
            <span>Saldos</span>
            <span>Movimentações</span>
            <span>Faturas</span>
            <span>Parcelas</span>
            <span>Investimentos</span>
            <span>Crédito</span>
          </div>
          <div className={s.toAnswer} aria-hidden="true">
            <i />
          </div>
        </div>
        <div className={s.response}>
          <div className={s.responseHead}>
            <Image src="/brand/team/rita.png" width={36} height={36} alt="" />
            <div>
              <strong>Rita</strong>
              <span>Sua agente de finanças no WhatsApp</span>
            </div>
            <UiIcon name="spark" />
          </div>
          <div className={s.question}>
            <p>{chosen.question}</p>
            <span>✓✓</span>
          </div>
          <div className={s.answer} key={selected} aria-live="polite">
            <p>{chosen.detail}</p>
            <span className={s.totalLabel}>{chosen.caption}</span>
            <strong className={s.total}>{chosen.total}</strong>
            <div className={s.rows}>
              {chosen.rows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className={s.answerNote}>{chosen.note}</p>
          </div>
        </div>
      </div>
      <div className={s.explore}>
        <div>
          <span>EXPERIMENTE UMA PERGUNTA</span>
          <h3>{chosen.title}</h3>
        </div>
        <div
          className={s.questionButtons}
          role="group"
          aria-label="Perguntas de exemplo sobre os bancos"
        >
          {QUESTIONS.map((question, index) => (
            <button
              type="button"
              key={question.label}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              {question.label}
              <span>↗</span>
            </button>
          ))}
        </div>
      </div>
      <p className={s.note}>
        Demonstração com valores fictícios. Instituições, produtos e informações
        disponíveis são verificados durante a conexão. Você autoriza o
        compartilhamento no banco.
      </p>
    </div>
  );
}
