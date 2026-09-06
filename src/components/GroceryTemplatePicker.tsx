"use client";

import { useEffect, useMemo, useState } from "react";

type TemplateItem = { name: string; category: string; quantity: string };

type Props = {
  templateKey: string;
  templateLabel: string;
  existingNames: string[];
  locale: "pt-BR" | "pt-PT" | "es";
  onClose: () => void;
  onAdded: () => void;
};

const COPY = {
  "pt-BR": {
    title: "Escolha os itens",
    subtitle: "Marque somente os produtos que deseja adicionar à sua lista.",
    selectAll: "Selecionar todos",
    clear: "Limpar seleção",
    existing: "já está na lista",
    cancel: "Cancelar",
    add: (count: number) => `Adicionar ${count} ${count === 1 ? "item" : "itens"}`,
    loading: "Carregando produtos...",
    error: "Não consegui carregar os produtos. Tente novamente.",
  },
  "pt-PT": {
    title: "Escolhe os itens",
    subtitle: "Marca apenas os produtos que queres adicionar à tua lista.",
    selectAll: "Selecionar todos",
    clear: "Limpar seleção",
    existing: "já está na lista",
    cancel: "Cancelar",
    add: (count: number) => `Adicionar ${count} ${count === 1 ? "item" : "itens"}`,
    loading: "A carregar produtos...",
    error: "Não consegui carregar os produtos. Tenta novamente.",
  },
  es: {
    title: "Elige los artículos",
    subtitle: "Marca solamente los productos que quieres agregar a tu lista.",
    selectAll: "Seleccionar todos",
    clear: "Limpiar selección",
    existing: "ya está en la lista",
    cancel: "Cancelar",
    add: (count: number) => `Agregar ${count} ${count === 1 ? "artículo" : "artículos"}`,
    loading: "Cargando productos...",
    error: "No pude cargar los productos. Inténtalo de nuevo.",
  },
} as const;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function GroceryTemplatePicker({ templateKey, templateLabel, existingNames, locale, onClose, onAdded }: Props) {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const copy = COPY[locale];
  const existing = useMemo(() => new Set(existingNames.map(normalize)), [existingNames]);
  const availableItems = useMemo(() => items.filter(item => !existing.has(normalize(item.name))), [items, existing]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/grocery?view=templates")
      .then(response => {
        if (!response.ok) throw new Error("templates");
        return response.json() as Promise<Record<string, TemplateItem[]>>;
      })
      .then(data => { if (active) setItems(data[templateKey] ?? []); })
      .catch(() => { if (active) setError(copy.error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [templateKey, copy.error]);

  function toggle(name: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function addSelected() {
    if (!selected.size) return;
    setSaving(true);
    setError("");
    const response = await fetch("/api/admin/grocery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_from_template", template: templateKey, selectedNames: [...selected] }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(copy.error);
      return;
    }
    onAdded();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-bold text-slate-900">{templateLabel} — {copy.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{copy.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.cancel} className="text-slate-400 hover:text-slate-700 p-1">✕</button>
        </div>

        {!loading && !error && (
          <div className="flex gap-3 mb-3 text-xs font-semibold">
            <button type="button" onClick={() => setSelected(new Set(availableItems.map(item => item.name)))} className="text-amber-700 hover:underline">
              {copy.selectAll}
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">
              {copy.clear}
            </button>
          </div>
        )}

        <div className="overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 min-h-32">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-400">{copy.loading}</p>
          ) : error ? (
            <p className="p-8 text-center text-sm text-red-500">{error}</p>
          ) : items.map(item => {
            const alreadyAdded = existing.has(normalize(item.name));
            return (
              <label key={item.name} className={`flex items-center gap-3 px-4 py-3 ${alreadyAdded ? "bg-slate-50 opacity-60" : "hover:bg-amber-50 cursor-pointer"}`}>
                <input type="checkbox" disabled={alreadyAdded} checked={selected.has(item.name)} onChange={() => toggle(item.name)}
                  className="w-4 h-4 accent-amber-600" />
                <span className="text-sm text-slate-700 flex-1">{item.name}</span>
                <span className="text-xs text-slate-400">{alreadyAdded ? copy.existing : item.quantity}</span>
              </label>
            );
          })}
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">
            {copy.cancel}
          </button>
          <button type="button" onClick={addSelected} disabled={saving || selected.size === 0}
            className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50">
            {saving ? "..." : copy.add(selected.size)}
          </button>
        </div>
      </div>
    </div>
  );
}
