"use client";

import { useId, useState, type ReactNode } from "react";
import s from "./agent-example-preview.module.css";

export function AgentExampleControls({ choices, legend }: {
  choices: { label: string; conversation: ReactNode }[];
  legend: string;
}) {
  const [selected, setSelected] = useState(0);
  const resultId = useId();
  return (
    <>
      <fieldset className={s.controls}>
        <legend>{legend}</legend>
        <div className={s.choices}>
          {choices.map(({ label }, index) => (
            <button
              key={label}
              type="button"
              aria-controls={resultId}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div id={resultId} className={s.conversation} aria-live="polite" aria-atomic="true">
        {choices[selected].conversation}
      </div>
    </>
  );
}
