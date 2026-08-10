"use client";
import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";

export type FinanceFilters = {
  from: string;   // YYYY-MM-DD
  to: string;     // YYYY-MM-DD
  categories: string[]; // vazio = todas
  type: "all" | "income" | "expense";
  search: string;
};

type Preset = "this_month" | "last_month" | "last_3_months" | "custom";

function pad(n: number) { return String(n).padStart(2, "0"); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function monthRange(offsetMonths: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const last = new Date(now.getFullYear(), now.getMonth() - offsetMonths + 1, 0);
  return { from: toYMD(first), to: toYMD(last) };
}

function last3MonthsRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toYMD(first), to: toYMD(last) };
}

/** Intervalo imediatamente anterior, de mesma duração — usado pelos
 *  indicadores de tendência ("vs período anterior") no Dashboard. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  const days = Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(f);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: toYMD(prevFrom), to: toYMD(prevTo) };
}

export function defaultFilters(): FinanceFilters {
  const { from, to } = monthRange(0);
  return { from, to, categories: [], type: "all", search: "" };
}

export default function FinanceFilterBar({
  categories, value, onChange,
}: {
  categories: string[];
  value: FinanceFilters;
  onChange: (f: FinanceFilters) => void;
}) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [showCats, setShowCats] = useState(false);
  const [searchInput, setSearchInput] = useState(value.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);

  // Mantém a ref sincronizada com o valor mais recente pra o callback do
  // debounce (abaixo) não precisar de "value" nas deps — mutação de ref
  // fica num efeito, não durante o render, que pode ser reexecutado/
  // descartado em modo concorrente.
  useEffect(() => { valueRef.current = value; });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...valueRef.current, search: searchInput });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "this_month") onChange({ ...value, ...monthRange(0) });
    else if (p === "last_month") onChange({ ...value, ...monthRange(1) });
    else if (p === "last_3_months") onChange({ ...value, ...last3MonthsRange() });
  }

  function toggleCategory(c: string) {
    const has = value.categories.includes(c);
    onChange({ ...value, categories: has ? value.categories.filter(x => x !== c) : [...value.categories, c] });
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-2">
      {/* Período */}
      <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
        {([["this_month", "Este mês"], ["last_month", "Mês passado"], ["last_3_months", "Últimos 3 meses"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => applyPreset(v)}
            className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition",
              preset === v ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}>
            {l}
          </button>
        ))}
      </div>

      {/* Datas customizadas */}
      <div className="flex items-center gap-1.5">
        <input type="date" value={value.from} onChange={e => { setPreset("custom"); onChange({ ...value, from: e.target.value }); }}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" />
        <span className="text-slate-300 text-xs">até</span>
        <input type="date" value={value.to} onChange={e => { setPreset("custom"); onChange({ ...value, to: e.target.value }); }}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" />
      </div>

      {/* Tipo */}
      <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
        {([["all", "Todos"], ["income", "Receitas"], ["expense", "Despesas"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange({ ...value, type: v })}
            className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition",
              value.type === v ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}>
            {l}
          </button>
        ))}
      </div>

      {/* Categoria (multi-select) */}
      <div className="relative">
        <button type="button" onClick={() => setShowCats(s => !s)}
          className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
          🏷️ Categoria
          {value.categories.length > 0 && (
            <span className="bg-amber-100 text-amber-700 rounded-full px-1.5 text-[10px] font-bold">{value.categories.length}</span>
          )}
        </button>
        {showCats && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowCats(false)} />
            <div className="absolute z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-64 overflow-y-auto w-48">
              {value.categories.length > 0 && (
                <button type="button" onClick={() => onChange({ ...value, categories: [] })}
                  className="w-full text-left text-xs text-amber-600 hover:bg-amber-50 rounded-lg px-2 py-1.5 mb-1 font-medium">
                  Limpar seleção
                </button>
              )}
              {categories.map(c => (
                <label key={c} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={value.categories.includes(c)} onChange={() => toggleCategory(c)} className="accent-amber-600" />
                  {c}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Busca */}
      <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
        placeholder="🔍 Buscar por descrição..."
        className="flex-1 min-w-[160px] border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-amber-400 transition" />
    </div>
  );
}
