"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordFieldEs({ className = "", ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className} pr-20`}
      />
      <button
        type="button"
        onClick={() => setVisible(value => !value)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-semibold text-slate-500 transition hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
