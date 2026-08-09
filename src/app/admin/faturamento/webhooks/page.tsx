"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Config = {
  id: string;
  label: string;
  active: boolean;
  secretBodyField?: string;
  secretHeader?: string;
  secretValue?: string;
  emailPath: string;
  statusPath: string;
  activateValues: string[];
  deactivateValues: string[];
  planPath?: string;
  planMap?: Record<string, string>;
};

type Preset = Omit<Config, "id" | "active" | "secretValue">;

const EMPTY_FORM = {
  label: "", secretBodyField: "", secretHeader: "", secretValue: "",
  emailPath: "", statusPath: "", activateValues: "", deactivateValues: "", planPath: "",
};

export default function BillingWebhooksPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [appBaseUrl, setAppBaseUrl] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testPayload, setTestPayload] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  function load() {
    fetch("/api/admin/billing-webhooks").then(r => r.json()).then(d => {
      setConfigs(d.configs || []);
      setPresets(d.presets || {});
    });
    fetch("/api/admin/whatsapp").then(r => r.json()).then(d => setAppBaseUrl(d.appBaseUrl || ""));
  }
  useEffect(() => { load(); }, []);

  function applyPreset(key: string) {
    const p = presets[key];
    if (!p) return;
    setForm(f => ({
      ...f,
      label: p.label,
      secretBodyField: p.secretBodyField || "",
      secretHeader: p.secretHeader || "",
      emailPath: p.emailPath,
      statusPath: p.statusPath,
      activateValues: p.activateValues.join(", "),
      deactivateValues: p.deactivateValues.join(", "),
      planPath: p.planPath || "",
    }));
  }

  function openNew() { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }
  function openEdit(c: Config) {
    setForm({
      label: c.label, secretBodyField: c.secretBodyField || "", secretHeader: c.secretHeader || "",
      secretValue: c.secretValue || "", emailPath: c.emailPath, statusPath: c.statusPath,
      activateValues: c.activateValues.join(", "), deactivateValues: c.deactivateValues.join(", "),
      planPath: c.planPath || "",
    });
    setEditingId(c.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      label: form.label,
      secretBodyField: form.secretBodyField || undefined,
      secretHeader: form.secretHeader || undefined,
      secretValue: form.secretValue || undefined,
      emailPath: form.emailPath,
      statusPath: form.statusPath,
      activateValues: form.activateValues.split(",").map(s => s.trim()).filter(Boolean),
      deactivateValues: form.deactivateValues.split(",").map(s => s.trim()).filter(Boolean),
      planPath: form.planPath || undefined,
    };
    if (editingId) {
      await fetch(`/api/admin/billing-webhooks/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/admin/billing-webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setShowForm(false); setEditingId(null); load();
  }

  async function toggleActive(c: Config) {
    await fetch(`/api/admin/billing-webhooks/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/billing-webhooks/${id}`, { method: "DELETE" });
    load();
  }

  async function runTest(id: string) {
    const r = await fetch(`/api/admin/billing-webhooks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", payload: testPayload[id] || "{}" }),
    });
    const d = await r.json();
    setTestResult(t => ({ ...t, [id]: d.error ? `❌ ${d.error}` : `✓ ação: ${d.action}${d.email ? ` — ${d.email}` : ""}${d.detail ? ` (${d.detail})` : ""}` }));
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🔌 Webhooks de Venda</h1>
          <p className="text-slate-400 text-sm">Ativa/desativa cliente automaticamente conforme a plataforma de venda (Hotmart, Kiwify, etc.) avisa</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition">+ Nova integração</button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
        ⚠️ O mapeamento de campos (email, status) é uma sugestão baseada na documentação pública de cada plataforma — <b>confira sempre com um payload de teste real</b> (a plataforma tem um botão "enviar teste") antes de ativar, usando o botão "Testar" abaixo. Um mapeamento errado pode ativar/desativar o cliente errado.
      </div>

      <div className="space-y-3">
        {configs.map(c => {
          const url = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}/api/webhook/billing/${c.id}` : "";
          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={clsx("w-2 h-2 rounded-full", c.active ? "bg-emerald-500" : "bg-slate-300")} />
                  <p className="font-semibold text-slate-900">{c.label}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleActive(c)} className="text-xs text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1 transition">
                    {c.active ? "Desativar" : "Ativar"}
                  </button>
                  <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">Excluir</button>
                </div>
              </div>
              {url && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <code className="text-xs text-amber-700 flex-1 break-all">{url}</code>
                  <button onClick={() => navigator.clipboard.writeText(url)} className="text-xs text-slate-400 hover:text-slate-900 shrink-0">📋</button>
                </div>
              )}
              <p className="text-[11px] text-slate-400">email: <code>{c.emailPath}</code> · status: <code>{c.statusPath}</code> · ativa em: <code>{c.activateValues.join(", ") || "—"}</code> · desativa em: <code>{c.deactivateValues.join(", ") || "—"}</code></p>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <p className="text-[11px] text-slate-400">Cole aqui um payload de teste (JSON) pra ver se o mapeamento bate, sem mexer em nenhum cliente de verdade:</p>
                <textarea value={testPayload[c.id] || ""} onChange={e => setTestPayload(p => ({ ...p, [c.id]: e.target.value }))}
                  rows={3} placeholder='{"event": "PURCHASE_APPROVED", "data": {"buyer": {"email": "cliente@exemplo.com"}}}'
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono outline-none" />
                <div className="flex items-center gap-2">
                  <button onClick={() => runTest(c.id)} className="text-xs bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-700 transition">🧪 Testar</button>
                  {testResult[c.id] && <span className="text-xs text-slate-600">{testResult[c.id]}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {configs.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-400 text-sm">Nenhuma integração configurada ainda.</div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-4">{editingId ? "✏️ Editar integração" : "🔌 Nova integração"}</h3>
            {!editingId && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-2">Ponto de partida (ajuste depois de conferir):</p>
                <div className="flex gap-2">
                  {Object.entries(presets).map(([key, p]) => (
                    <button key={key} type="button" onClick={() => applyPreset(key)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 transition">{p.label}</button>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required
                placeholder="Nome (ex: Hotmart)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.secretBodyField} onChange={e => setForm(f => ({ ...f, secretBodyField: e.target.value }))}
                  placeholder="Campo do token no corpo (ex: hottok)" className="border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none" />
                <input value={form.secretHeader} onChange={e => setForm(f => ({ ...f, secretHeader: e.target.value }))}
                  placeholder="OU header do token" className="border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none" />
              </div>
              <input type="password" value={form.secretValue} onChange={e => setForm(f => ({ ...f, secretValue: e.target.value }))}
                placeholder="Valor do token/secret" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.emailPath} onChange={e => setForm(f => ({ ...f, emailPath: e.target.value }))} required
                placeholder="Caminho até o email (ex: data.buyer.email)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none font-mono" />
              <input value={form.statusPath} onChange={e => setForm(f => ({ ...f, statusPath: e.target.value }))} required
                placeholder="Caminho até o status/evento (ex: event)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none font-mono" />
              <input value={form.activateValues} onChange={e => setForm(f => ({ ...f, activateValues: e.target.value }))}
                placeholder="Valores que ATIVAM, separados por vírgula" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.deactivateValues} onChange={e => setForm(f => ({ ...f, deactivateValues: e.target.value }))}
                placeholder="Valores que DESATIVAM, separados por vírgula" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition">{editingId ? "Salvar" : "Criar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
