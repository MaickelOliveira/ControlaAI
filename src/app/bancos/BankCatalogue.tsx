"use client";

import { useState } from "react";
import { matchesBank } from "@/lib/open-finance-display";
import type { BankInstitution } from "@/lib/open-finance-institutions";

export type CatalogueEntry = Pick<BankInstitution, "id" | "name" | "type"> & { available: boolean };

const MODES = { ALL: "Todos", PERSONAL: "Pessoal", BUSINESS: "Empresa" } as const;
const PROFILE = { PERSONAL: "Pessoal", BUSINESS: "Empresa", BOTH: "Pessoal e Empresa" } as const;
const PAGE_SIZE = 24;

export default function BankCatalogue({ entries }: { entries: CatalogueEntry[] }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<keyof typeof MODES>("ALL");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const matches = entries.filter(bank =>
    (mode === "ALL" || bank.type === "BOTH" || bank.type === mode) && matchesBank(bank, query)
  );

  return (
    <>
      <label htmlFor="bank-search" className="block text-sm font-semibold">Nome do banco</label>
      <input id="bank-search" type="search" placeholder="Ex. Nubank, Sicredi ou Itaú" value={query}
        onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
        className="mt-2 w-full rounded-xl border border-[#898c80] bg-white px-4 py-3 text-base placeholder:text-[#61665c]" />
      <div role="group" aria-label="Tipo de conta" className="my-4 flex flex-wrap gap-2">
        {(Object.keys(MODES) as (keyof typeof MODES)[]).map(option => (
          <button type="button" key={option} aria-pressed={mode === option}
            onClick={() => { setMode(option); setLimit(PAGE_SIZE); }}
            className="cursor-pointer rounded-full border border-[#c5c8bb] px-4 py-2.5 text-sm font-semibold aria-pressed:border-[#20241f] aria-pressed:bg-[#20241f] aria-pressed:text-white">
            {MODES[option]}
          </button>
        ))}
      </div>
      <p role="status" className="text-sm text-[#55594e]">
        {matches.length === 0 ? "Nenhuma opção encontrada." : matches.length === 1 ? "1 opção de conexão" : `${matches.length} opções de conexão`}
      </p>
      {matches.length === 0 && (query || mode !== "ALL") && (
        <button type="button" onClick={() => { setMode("ALL"); setQuery(""); setLimit(PAGE_SIZE); }}
          className="mt-2 cursor-pointer py-2 font-semibold underline underline-offset-4">Limpar filtros</button>
      )}
      <ul className="mt-3 divide-y divide-[#e3e3d9] border-t border-[#e3e3d9]">
        {matches.slice(0, limit).map(bank => (
          <li key={bank.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
            <strong className="min-w-0 [overflow-wrap:anywhere]">{bank.name}</strong>
            <span className="text-sm text-[#55594e]">{PROFILE[bank.type]}</span>
            {!bank.available && <span className="w-full text-sm text-[#805016]">Conexão temporariamente indisponível</span>}
          </li>
        ))}
      </ul>
      {limit < matches.length && (
        <button type="button" onClick={() => setLimit(count => count + PAGE_SIZE)}
          className="mt-4 cursor-pointer rounded-xl border border-[#898c80] px-4 py-3 font-semibold">Mostrar mais bancos</button>
      )}
    </>
  );
}
