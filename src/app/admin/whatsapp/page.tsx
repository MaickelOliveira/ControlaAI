"use client";
import { useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";

export default function AdminWhatsappPage() {
  const [cfg, setCfg] = useState({ wppServer: "", wppToken: "", wppSession: "controlaai", geminiApiKey: "", appBaseUrl: "", connectionStatus: "UNKNOWN" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/whatsapp");
    if (res.ok) setCfg(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!polling) return;
    const t = setInterval(async () => {
      const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status" }) });
      const d = await r.json();
      if (d.status === "CONNECTED") {
        setCfg(c => ({ ...c, connectionStatus: "CONNECTED" }));
        setQr(null); setPolling(false); setConnecting(false);
      } else {
        const qrR = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "qr" }) });
        const qrD = await qrR.json();
        if (qrD.qr) setQr(qrD.qr);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [polling]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/admin/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
  }

  async function connect() {
    setConnecting(true); setQr(null);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const d = await r.json();
    if (d.qr) { setQr(d.qr); setPolling(true); }
    else if (!r.ok) { alert(d.error || "Erro"); setConnecting(false); }
  }

  const statusCfg = {
    CONNECTED: { label: "Conectado", color: "text-emerald-400", bg: "bg-emerald-900/20 border-emerald-800" },
    DISCONNECTED: { label: "Desconectado", color: "text-red-400", bg: "bg-red-900/20 border-red-800" },
    UNKNOWN: { label: "Verificando...", color: "text-slate-400", bg: "bg-slate-800 border-slate-700" },
  }[cfg.connectionStatus] ?? { label: "?", color: "text-slate-400", bg: "bg-slate-800 border-slate-700" };

  const webhookUrl = cfg.appBaseUrl ? `${cfg.appBaseUrl.replace(/\/$/, "")}/api/webhook/wppconnect` : "";

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white">WhatsApp Bot</h1>
        <p className="text-slate-400 text-sm">Configure e conecte o número central da plataforma</p>
      </div>

      {/* Status */}
      <div className={clsx("border rounded-2xl p-4 flex items-center justify-between", statusCfg.bg)}>
        <div className="flex items-center gap-3">
          <div className={clsx("w-2.5 h-2.5 rounded-full", cfg.connectionStatus === "CONNECTED" ? "bg-emerald-400 animate-pulse" : cfg.connectionStatus === "DISCONNECTED" ? "bg-red-400" : "bg-slate-500")} />
          <div>
            <p className={clsx("font-medium text-sm", statusCfg.color)}>Bot {statusCfg.label}</p>
            <p className="text-slate-500 text-xs">Número central que recebe as mensagens dos clientes</p>
          </div>
        </div>
        <button onClick={load} className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition">Atualizar</button>
      </div>

      {/* QR Code */}
      {qr && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-white mb-1">📱 Escaneie o QR Code</h3>
          <p className="text-slate-400 text-sm mb-4">WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code" className="w-56 h-56 rounded-xl border-2 border-emerald-500/30 mx-auto" />
          <p className="text-slate-500 text-xs mt-3 animate-pulse">Aguardando conexão...</p>
        </div>
      )}

      {/* Config form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-4">Configurações WPPConnect</h2>
        <form onSubmit={save} className="space-y-4">
          {[
            { key: "wppServer", label: "URL do Servidor WPPConnect", placeholder: "https://wpp.seuservidor.com", type: "text" },
            { key: "wppToken", label: "Token", placeholder: "seu-token", type: "password" },
            { key: "wppSession", label: "Nome da sessão", placeholder: "controlaai", type: "text" },
            { key: "geminiApiKey", label: "Chave Gemini AI", placeholder: "AIza...", type: "password" },
            { key: "appBaseUrl", label: "URL da plataforma", placeholder: "https://app.controlaai.com", type: "text" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-slate-400 mb-1.5">{f.label}</label>
              <input type={f.type} value={(cfg as Record<string,string>)[f.key]}
                onChange={e => setCfg(c => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
            </div>
          ))}

          {webhookUrl && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">URL do Webhook (configurar no WPPConnect):</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-emerald-400 flex-1 break-all">{webhookUrl}</code>
                <button type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-2 py-1 shrink-0 transition">📋</button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
              {saving ? "Salvando..." : saved ? "✓ Salvo!" : "💾 Salvar"}
            </button>
            <button type="button" disabled={connecting || !cfg.wppServer || !cfg.wppToken} onClick={connect}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-40">
              {connecting ? "⏳ Aguardando..." : "📱 Conectar WhatsApp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
