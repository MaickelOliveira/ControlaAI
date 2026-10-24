"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useVisible } from "./PresentationMotion";
import s from "./bank-connections.module.css";

const BANKS = [
  { id: "nubank", name: "Nubank", x: 18, y: 22 },
  { id: "inter", name: "Inter", x: 50, y: 10 },
  { id: "santander", name: "Santander", x: 82, y: 22 },
  { id: "sicredi", name: "Sicredi", x: 18, y: 76 },
  { id: "banco-do-brasil", name: "Banco do Brasil", x: 50, y: 90 },
  { id: "bradesco", name: "Bradesco", x: 82, y: 76 },
];
const QUESTIONS = [
  {
    label: "Meus saldos",
    request: "Quanto tenho nas minhas contas?",
    answer:
      "Saldos recebidos por conta e instituição, com a informação disponível em cada conexão.",
  },
  {
    label: "Minhas parcelas",
    request: "Quanto ainda tenho parcelado?",
    answer:
      "Parcelas identificadas, valores e previsões disponíveis, sem tratar ausência de dados como zero.",
  },
  {
    label: "Meus empréstimos",
    request: "Quanto falta para quitar meu empréstimo?",
    answer:
      "Contratos e saldos devedores compartilhados pelo banco, com indicação do que não foi informado.",
  },
];

export default function BankConnections() {
  const [selected, setSelected] = useState(0);
  const network = useRef<HTMLDivElement>(null);
  const visible = useVisible(network);
  return (
    <div ref={network} className={s.connection} data-visible={visible}>
      <div
        className={s.network}
        aria-label="Ilustração: bancos conectados à IA da Zelo no WhatsApp"
      >
        <div className={s.orbit} />
        <div className={s.orbitInner} />
        <svg
          className={s.lines}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="zelo-flow-gold">
              <stop stopColor="#7b936c" stopOpacity=".15" />
              <stop offset=".5" stopColor="#e9d299" />
              <stop offset="1" stopColor="#7b936c" stopOpacity=".15" />
            </linearGradient>
          </defs>
          {BANKS.map((bank) => (
            <path
              key={bank.id}
              d={`M${bank.x},${bank.y} Q50,${bank.y} 50,50`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {BANKS.map((bank, index) => (
            <path
              key={`pulse-${bank.id}`}
              className={s.pulse}
              d={`M${bank.x},${bank.y} Q50,${bank.y} 50,50`}
              pathLength="100"
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${index * -0.7}s` }}
            />
          ))}
        </svg>
        {BANKS.map((bank) => (
          <div
            key={bank.id}
            className={s.bank}
            style={{ left: `${bank.x}%`, top: `${bank.y}%` }}
          >
            <div>
              <Image
                src={`/brand/banks/${bank.id}.svg`}
                alt=""
                width={43}
                height={43}
              />
              <span aria-hidden="true">✓</span>
            </div>
            <strong>{bank.name}</strong>
          </div>
        ))}
        <div className={s.hub}>
          <Image src="/brand/zelo-icon.png" alt="Zelo" width={62} height={62} />
          <strong>IA no WhatsApp</strong>
          <span>SUAS PERGUNTAS. SEUS DADOS.</span>
        </div>
        <span className={s.networkLabel}>
          OPEN FINANCE
          <br />
          <strong>Uma conexão com mais possibilidades.</strong>
        </span>
      </div>
      <div className={s.ask}>
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
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <div className={s.answer} aria-live="polite" key={selected}>
          <div>
            <span>VOCÊ PERGUNTA NO WHATSAPP</span>
            <p>“{QUESTIONS[selected].request}”</p>
          </div>
          <div>
            <span>A ZELO CONSULTA</span>
            <p>{QUESTIONS[selected].answer}</p>
          </div>
        </div>
      </div>
      <p className={s.note}>
        Demonstração ilustrativa. As instituições e informações disponíveis são
        verificadas durante a conexão na sua conta.
      </p>
    </div>
  );
}
