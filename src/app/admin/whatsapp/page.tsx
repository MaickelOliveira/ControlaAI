"use client";
import { useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";

export default function AdminWhatsappPage() {
  const [cfg, setCfg] = useState({
    wppServer: "", wppSecretKey: "", wppToken: "", hasToken: false,
    wppSession: "controlaai", geminiApiKey: "", hasGemini: false,
    appBaseUrl: "", connectionStatus: "UNKNOWN",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/whatsapp");
    if (r.ok) setCfg(await r.json());
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

  async function generateToken() {
    setGenerating(true); setGenMsg(null);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_token" }) });
    const d = await r.json();
    if (r.ok) {
      setGenMsg({ type: "ok", text: `✓ Token gerado! (${d.token})` });
      await load();
    } else {
      setGenMsg({ type: "err", text: d.error || "Falha ao gerar token" });
    }
    setGenerating(false);
  }

  async function connect() {
    setConnecting(true); setQr(null);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const d = await r.json();
    if (d.qr) { setQr(d.qr); setPolling(true); }
    else if (!r.ok) { alert(d.error || "Erro"); setConnecting(false); }
  }

  const statusInfo = {
    CONNECTED:    { label: "Conectado", dot: "bg-emerald-400 animate-pulse", bar: "bg-emerald-950/30 border-emerald-900/50", text: "text-emerald-400" },
    DISCONNECTED: { label: "Desconectado", dot: "bg-red-400", bar: "bg-red-950/30 border-red-900/50", text: "text-red-400" },
    UNKNOWN:      { label: "Verificando...", dot: "bg-slate-500", bar: "bg-slate-800 border-slate-700", text: "text-slate-400" },
  }[cfg.connectionStatus] ?? { label: "?", dot: "bg-slate-500", bar: "bg-slate-800 border-slate-700", text: "text-slate-400" };

  const webhookUrl = cfg.appBaseUrl ? `${cfg.appBaseUrl.replace(/\/$/, "")}/api/webhook/wppconnect` : "";

  const steps = [
    { num: 1, done: !!cfg.wppServer, label: "URL do servidor preenchida" },
    { num: 2, done: !!cfg.wppSecretKey || cfg.wppSecretKey === "••••••••", label: "Secret key preenchida" },
    { num: 3, done: cfg.hasToken, label: "Token gerado" },
    { num: 4, done: cfg.hasGemini, label: "Chave Gemini preenchida" },
    { num: 5, done: !!cfg.appBaseUrl, label: "URL da plataforma preenchida" },
    { num: 6, done: cfg.connectionStatus === "CONNECTED", label: "WhatsApp conectado" },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white">📱 WhatsApp Bot</h1>
        <p className="text-slate-400 text-sm">Configure o número central que recebe as mensagens dos clientes</p>
      </div>

      {/* Status */}
      <div className={clsx("border rounded-2xl p-4 flex items-center justify-between", statusInfo.bar)}>
        <div className="flex items-center gap-3">
          <div className={clsx("w-2.5 h-2.5 rounded-full", statusInfo.dot)} />
          <div>
            <p className={clsx("font-medium text-sm", statusInfo.text)}>Bot {statusInfo.label}</p>
            <p className="text-slate-500 text-xs">Número central que recebe as mensagens dos clientes</p>
          </div>
        </div>
        <button onClick={load} className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition">
          Atualizar
        </button>
      </div>

      {/* Checklist de setup */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Progresso da configuração</p>
        <div className="space-y-2">
          {steps.map(s => (
            <div key={s.num} className="flex items-center gap-3">
              <div className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                s.done ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-500")}>
                {s.done ? "✓" : s.num}
              </div>
              <span className={clsx("text-sm", s.done ? "text-slate-300" : "text-slate-500")}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code */}
      {qr && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-white mb-1">📱 Escaneie o QR Code</h3>
          <p className="text-slate-400 text-sm mb-4">WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code" className="w-56 h-56 rounded-xl border-2 border-emerald-500/30 mx-auto" />
          <p className="text-slate-500 text-xs mt-3 animate-pulse">Aguardando conexão...</p>
        </div>
      )}

      {/* Formulário */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-1">⚙️ Configurações</h2>
        <p className="text-slate-500 text-xs mb-4">
          Use o mesmo servidor WPPConnect do trafegopago — é o mesmo para todos os seus sistemas.
        </p>

        <form onSubmit={save} className="space-y-4">
          {/* Passo 1 e 2 */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <span className="w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center text-[10px]">1</span>
              Servidor WPPConnect
            </p>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">URL do servidor</label>
              <input value={cfg.wppServer} onChange={e => setCfg(c => ({ ...c, wppServer: e.target.value }))}
                placeholder="https://trafegopago-wppconect.ztcjzs.easypanel.host"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
              <p className="text-[11px] text-slate-500 mt-1">É o mesmo servidor WPPConnect que você usa no trafegopago</p>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Secret Key do servidor</label>
              <input type="password" value={cfg.wppSecretKey} onChange={e => setCfg(c => ({ ...c, wppSecretKey: e.target.value }))}
                placeholder="THISISMYSECURETOKEN"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
              <p className="text-[11px] text-slate-500 mt-1">Chave secreta do servidor (variável WPPCONNECT_SECRET_KEY no EasyPanel do wppconnect)</p>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Nome da sessão</label>
              <input value={cfg.wppSession} onChange={e => setCfg(c => ({ ...c, wppSession: e.target.value }))}
                placeholder="controlaai"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
              <p className="text-[11px] text-slate-500 mt-1">Use um nome diferente das sessões do trafegopago (ex: controlaai)</p>
            </div>
          </div>

          {/* Passo 3: Gerar token */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <span className="w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center text-[10px]">2</span>
              Token de sessão
            </p>
            {cfg.hasToken ? (
              <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
                <span className="text-emerald-400 text-sm">✓</span>
                <span className="text-emerald-300 text-xs">Token gerado: {cfg.wppToken}</span>
              </div>
            ) : (
              <p className="text-amber-400 text-xs">⚠ Token não gerado ainda — salve as configurações acima primeiro</p>
            )}
            {genMsg && (
              <p className={clsx("text-xs rounded-lg px-3 py-2 border", genMsg.type === "ok" ? "text-emerald-400 bg-emerald-900/20 border-emerald-800" : "text-red-400 bg-red-900/20 border-red-800")}>
                {genMsg.text}
              </p>
            )}
            <button type="button" disabled={generating || !cfg.wppServer}
              onClick={generateToken}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 text-sm font-medium transition disabled:opacity-40">
              {generating ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
              ) : (
                <>{cfg.hasToken ? "🔄 Regerar Token" : "⚡ Gerar Token"}</>
              )}
            </button>
            <p className="text-[11px] text-slate-500">
              Clique depois de preencher a URL e a secret key. O token é gerado automaticamente.
            </p>
          </div>

          {/* Passo 4 e 5 */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <span className="w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center text-[10px]">3</span>
              IA e URL da plataforma
            </p>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Chave Gemini AI</label>
              <input type="password" value={cfg.geminiApiKey} onChange={e => setCfg(c => ({ ...c, geminiApiKey: e.target.value }))}
                placeholder="AIza..."
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">URL desta plataforma</label>
              <input value={cfg.appBaseUrl} onChange={e => setCfg(c => ({ ...c, appBaseUrl: e.target.value }))}
                placeholder="https://lp-controlaai.ztcjzs.easypanel.host"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
            </div>
            {webhookUrl && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 mb-1">Webhook (configure no WPPConnect — Events → onmessage):</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-emerald-400 flex-1 break-all">{webhookUrl}</code>
                  <button type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded-lg px-2 py-1 shrink-0 transition">
                    📋
                  </button>
                </div>
              </div>
            )}
          </div>

          <button type="submit" disabled={saving}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "💾 Salvar configurações"}
          </button>
        </form>
      </div>

      {/* Passo 6: Conectar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-1">📱 Conectar WhatsApp</h2>
        <p className="text-slate-400 text-sm mb-4">
          Após salvar e gerar o token, clique para escanear o QR Code com o celular que vai ser o número do bot.
        </p>
        <button disabled={connecting || !cfg.hasToken}
          onClick={connect}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl py-3 text-sm transition disabled:opacity-40 flex items-center justify-center gap-2">
          {connecting ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Aguardando QR Code...</>
          ) : (
            "📱 Conectar WhatsApp"
          )}
        </button>
        {!cfg.hasToken && (
          <p className="text-amber-400 text-xs text-center mt-2">⚠ Gere o token primeiro antes de conectar</p>
        )}
      </div>
    </div>
  );
}
