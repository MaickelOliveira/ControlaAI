"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import { usePresentationMotion } from "./PresentationMotion";
import s from "./team-entrance.module.css";
const PEOPLE = [
  { name: "Rita", role: "Finanças", index: 0 },
  { name: "Lucas", role: "Agenda", index: 1 },
  { name: "Theo", role: "Tarefas", index: 2 },
  { name: "Dora", role: "Arquivos", index: 4 },
  { name: "Nina", role: "Metas", index: 5 },
  { name: "Zoe", role: "Ajuda", index: 11 },
];
export default function TeamEntrance({
  onChoose,
}: {
  onChoose: (index: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { running, reduced } = usePresentationMotion();
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const node = root.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const p = running
        ? Math.max(
            0,
            Math.min(
              1,
              (innerHeight * 0.65 - r.top) / (r.height - innerHeight * 0.5),
            ),
          )
        : 1;
      node.style.setProperty("--spread", String(0.15 + p * 0.85));
      node.style.setProperty("--rise", `${(1 - p) * 100}px`);
      node.style.setProperty("--reveal", String(p));
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroll();
    addEventListener("scroll", scroll, { passive: true });
    addEventListener("resize", scroll);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", scroll);
      removeEventListener("resize", scroll);
    };
  }, [running]);
  return (
    <div
      ref={root}
      id="equipe"
      className={`${s.entrance} ${reduced ? s.reduced : ""}`}
    >
      <div className={s.sticky}>
        <p className={s.eyebrow}>SEU TIME DE AGENTES DE IA NO WHATSAPP</p>
        <h2>
          Veja tudo o que
          <br />
          a Zelo pode fazer
          <br />
          <em>por você.</em>
        </h2>
        <span className={s.number} aria-hidden="true">
          12
        </span>
        <div className={s.fan}>
          {PEOPLE.map((person, i) => (
            <button
              type="button"
              key={person.name}
              className={s.person}
              style={
                {
                  "--offset": i - 2.5,
                  "--lift": Math.abs(i - 2.5),
                  "--order": i,
                } as React.CSSProperties
              }
              onClick={() => onChoose(person.index)}
              aria-label={`Conhecer ${person.name} e suas funções`}
            >
              <Image
                src={`/brand/team/${person.name.toLowerCase()}.png`}
                width={300}
                height={400}
                alt=""
                sizes="(max-width:700px) 120px, 17vw"
              />
              <span>
                <strong>{person.name}</strong>
                <small>{person.role}</small>
              </span>
              <b>↗</b>
            </button>
          ))}
        </div>
        <div className={s.foot}>
          <span>12 AGENTES VIRTUAIS ZELO</span>
          <p>
            Um time de agentes de IA,
            <br />
            cada um cuidando de uma parte da sua rotina.
          </p>
          <span>ROLE E CONHEÇA ↓</span>
        </div>
      </div>
    </div>
  );
}
