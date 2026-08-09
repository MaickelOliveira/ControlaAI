"use client";
import { useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";

type Provider = "evolution" | "waba";

type Cfg = {
  provider: Provider;
  evolution: { server: string; adminKey: string; instanceName: string; hasApiKey: boolean };
  waba: { phoneNumberId: string; accessToken: string; verifyToken: string };
  geminiApiKey: string; hasGemini: boolean;
  appBaseUrl: string; wppBotNumber: string; connectionStatus: string;
  googleClientId: string; googleClientSecret: string; hasGoogleOAuth: boolean;
};

const EMPTY_CFG: Cfg = {
  provider: "evolution",
  evolution: { server: "", adminKey: "", instanceName: "zelo", hasApiKey: false },
  waba: { phoneNumberId: "", accessToken: "", verifyToken: "" },
  geminiApiKey: "", hasGemini: false,
  appBaseUrl: "", wppBotNumber: "", connectionStatus: "UNKNOWN",
  googleClientId: "", googleClientSecret: "", hasGoogleOAuth: false,
};

export default function AdminWhatsappPage() {
  const [cfg, setCfg] = useState<Cfg>(EMPTY_CFG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connMsg, setConnMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [testingWaba, setTestingWaba] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testTemplate, setTestTemplate] = useState<"lembrete_pessoal" | "lembrete_compromisso" | "cobranca_recorrente">("lembrete_pessoal");
  const [testingTemplate, setTestingTemplate] = useState(false);
  const [testTemplateMsg, setTestTemplateMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
    await load();
  }

  async function connectEvolution() {
    setConnecting(true); setQr(null); setConnMsg(null);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect" }) });
    const d = await r.json();
    if (!r.ok) { setConnMsg({ type: "err", text: d.error || "Erro ao conectar" }); setConnecting(false); return; }
    if (d.qr) setQr(d.qr);
    setPolling(true);
  }

  async function testWaba() {
    setTestingWaba(true); setConnMsg(null);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status" }) });
    const d = await r.json();
    setCfg(c => ({ ...c, connectionStatus: d.status }));
    setConnMsg(d.status === "CONNECTED" ? { type: "ok", text: "✓ Conexão com a API Oficial validada!" } : { type: "err", text: "Não foi possível validar — confira Phone Number ID e Access Token." });
    setTestingWaba(false);
  }

  async function testTemplateSend() {
    setTestingTemplate(true); setTestTemplateMsg(null);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "testTemplate", template: testTemplate, phone: testPhone }) });
    const d = await r.json();
    setTestTemplateMsg(d.ok ? { type: "ok", text: "✓ Enviado! Confira o WhatsApp do número informado." } : { type: "err", text: d.error || "Falha ao enviar" });
    setTestingTemplate(false);
  }

  async function detectNumber() {
    setDetecting(true);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "detect_number" }) });
    const d = await r.json();
    if (d.wppBotNumber) setCfg(c => ({ ...c, wppBotNumber: d.wppBotNumber }));
    setDetecting(false);
  }

  const statusInfo = {
    CONNECTED:    { label: "WhatsApp conectado", dot: "bg-emerald-400 animate-pulse", bar: "bg-emerald-950/30 border-emerald-900/50", text: "text-emerald-400" },
    DISCONNECTED: { label: "Bot Desconectado", dot: "bg-red-400", bar: "bg-red-950/30 border-red-900/50", text: "text-red-400" },
    UNKNOWN:      { label: "Verificando...", dot: "bg-slate-500", bar: "bg-slate-100 border-slate-200", text: "text-slate-400" },
  }[cfg.connectionStatus] ?? { label: "?", dot: "bg-slate-500", bar: "bg-slate-100 border-slate-200", text: "text-slate-400" };

  const webhookPath = cfg.provider === "waba" ? "/api/webhook/waba" : "/api/webhook/evolution";
  const webhookUrl = cfg.appBaseUrl ? `${cfg.appBaseUrl.replace(/\/$/, "")}${webhookPath}` : "";

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📱 WhatsApp Bot</h1>
        <p className="text-slate-400 text-sm">Configure o número central que recebe as mensagens dos clientes</p>
      </div>

      {/* Status */}
      <div className={clsx("border rounded-2xl p-4 flex items-center justify-between", statusInfo.bar)}>
        <div className="flex items-center gap-3">
          <div className={clsx("w-2.5 h-2.5 rounded-full", statusInfo.dot)} />
          <div>
            <p className={clsx("font-medium text-sm", statusInfo.text)}>{statusInfo.label}</p>
            <p className="text-slate-400 text-xs">Provedor ativo: {cfg.provider === "waba" ? "API Oficial (Meta)" : "Evolution API"}</p>
          </div>
        </div>
        <button onClick={load} className="text-xs text-slate-400 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 transition">
          Atualizar
        </button>
      </div>

      {/* Seletor de provedor */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Provedor de conexão</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setCfg(c => ({ ...c, provider: "evolution" }))}
            className={clsx("rounded-xl px-4 py-3 text-sm font-medium border transition text-left",
              cfg.provider === "evolution" ? "bg-amber-600 border-amber-600 text-slate-900" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300")}>
            🧬 Evolution API
            <p className={clsx("text-[11px] font-normal mt-0.5", cfg.provider === "evolution" ? "text-slate-800" : "text-slate-400")}>Auto-hospedado, QR Code</p>
          </button>
          <button type="button" onClick={() => setCfg(c => ({ ...c, provider: "waba" }))}
            className={clsx("rounded-xl px-4 py-3 text-sm font-medium border transition text-left",
              cfg.provider === "waba" ? "bg-amber-600 border-amber-600 text-slate-900" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300")}>
            🏢 API Oficial (Meta)
            <p className={clsx("text-[11px] font-normal mt-0.5", cfg.provider === "waba" ? "text-slate-800" : "text-slate-400")}>Evita bloqueios, exige aprovação Meta</p>
          </button>
        </div>
      </div>

      {/* QR Code (só Evolution) */}
      {qr && cfg.provider === "evolution" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-slate-900 mb-1">📱 Escaneie o QR Code</h3>
          <p className="text-slate-400 text-sm mb-4">WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code" className="w-56 h-56 rounded-xl border-2 border-amber-500/30 mx-auto" />
          <p className="text-slate-400 text-xs mt-3 animate-pulse">Aguardando conexão...</p>
        </div>
      )}

      <form onSubmit={save} className="space-y-4">
        {cfg.provider === "evolution" ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-slate-900 mb-1">⚙️ Evolution API</h2>
            <p className="text-slate-400 text-xs mb-2">Use o mesmo servidor Evolution que você já roda no trafegopago.</p>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">URL do servidor</label>
              <input value={cfg.evolution.server} onChange={e => setCfg(c => ({ ...c, evolution: { ...c.evolution, server: e.target.value } }))}
                placeholder="https://sua-evolution-api.exemplo.com"
                className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Admin Key (AUTHENTICATION_API_KEY)</label>
              <input type="password" value={cfg.evolution.adminKey} onChange={e => setCfg(c => ({ ...c, evolution: { ...c.evolution, adminKey: e.target.value } }))}
                placeholder="••••••••"
                className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Nome da instância</label>
              <input value={cfg.evolution.instanceName} onChange={e => setCfg(c => ({ ...c, evolution: { ...c.evolution, instanceName: e.target.value } }))}
                placeholder="zelo"
                className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
              <p className="text-[11px] text-slate-400 mt-1">Use um nome diferente das instâncias do trafegopago (ex: zelo)</p>
            </div>
            {cfg.evolution.hasApiKey && (
              <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-800 rounded-lg px-3 py-2">
                <span className="text-amber-400 text-sm">✓</span>
                <span className="text-amber-300 text-xs">Instância já conectada anteriormente</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-slate-900 mb-1">🏢 API Oficial do WhatsApp (Meta Cloud API)</h2>
            <p className="text-slate-400 text-xs mb-2">Requer um app configurado no Meta Business — evita bloqueios de número, mas exige aprovação.</p>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Phone Number ID</label>
              <input value={cfg.waba.phoneNumberId} onChange={e => setCfg(c => ({ ...c, waba: { ...c.waba, phoneNumberId: e.target.value } }))}
                placeholder="1234567890"
                className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition font-mono" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Access Token (permanente)</label>
              <input type="password" value={cfg.waba.accessToken} onChange={e => setCfg(c => ({ ...c, waba: { ...c.waba, accessToken: e.target.value } }))}
                placeholder="EAAxxxxx..."
                className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Verify Token</label>
              <input value={cfg.waba.verifyToken} onChange={e => setCfg(c => ({ ...c, waba: { ...c.waba, verifyToken: e.target.value } }))}
                placeholder="zelo-webhook-verify"
                className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
              <p className="text-[11px] text-slate-400 mt-1">Escolha um valor qualquer e use o mesmo ao cadastrar o webhook no Meta Business</p>
            </div>
            {connMsg && (
              <p className={clsx("text-xs rounded-lg px-3 py-2 border", connMsg.type === "ok" ? "text-amber-400 bg-amber-900/20 border-amber-800" : "text-red-400 bg-red-900/20 border-red-800")}>
                {connMsg.text}
              </p>
            )}
            <button type="button" disabled={testingWaba || !cfg.waba.phoneNumberId}
              onClick={testWaba}
              className="w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-amber-600 text-slate-900 rounded-xl py-2.5 text-sm font-medium transition disabled:opacity-40">
              {testingWaba ? "Testando..." : "🔌 Testar conexão"}
            </button>

            <div className="border-t border-slate-200 pt-3 mt-1">
              <p className="text-[11px] text-slate-400 mb-2">Disparar um template real de teste (lembrete_pessoal, lembrete_compromisso, cobranca_recorrente) pra um número, pra confirmar que está disparando.</p>
              <div className="flex gap-2 mb-2">
                <select value={testTemplate} onChange={e => setTestTemplate(e.target.value as typeof testTemplate)}
                  className="bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 transition">
                  <option value="lembrete_pessoal">lembrete_pessoal</option>
                  <option value="lembrete_compromisso">lembrete_compromisso</option>
                  <option value="cobranca_recorrente">cobranca_recorrente</option>
                </select>
                <input value={testPhone} onChange={e => setTestPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="5544999999999"
                  className="flex-1 bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition font-mono" />
              </div>
              {testTemplateMsg && (
                <p className={clsx("text-xs rounded-lg px-3 py-2 border mb-2", testTemplateMsg.type === "ok" ? "text-amber-400 bg-amber-900/20 border-amber-800" : "text-red-400 bg-red-900/20 border-red-800")}>
                  {testTemplateMsg.text}
                </p>
              )}
              <button type="button" disabled={testingTemplate || !testPhone}
                onClick={testTemplateSend}
                className="w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-amber-600 text-slate-900 rounded-xl py-2.5 text-sm font-medium transition disabled:opacity-40">
                {testingTemplate ? "Enviando..." : "🧪 Enviar template de teste"}
              </button>
            </div>
          </div>
        )}

        {webhookUrl && (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-3">
            <p className="text-[11px] text-slate-400 mb-1">
              {cfg.provider === "waba" ? "Webhook (cadastre no Meta Business — assine o campo \"messages\"):" : "Webhook (configurado automaticamente ao conectar):"}
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-amber-600 flex-1 break-all">{webhookUrl}</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="text-xs text-slate-400 hover:text-slate-900 border border-slate-300 rounded-lg px-2 py-1 shrink-0 transition">
                📋
              </button>
            </div>
          </div>
        )}

        {/* IA e URL da plataforma */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 mb-1">🧠 IA e URL da plataforma</h2>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Chave Gemini AI</label>
            <input type="password" value={cfg.geminiApiKey} onChange={e => setCfg(c => ({ ...c, geminiApiKey: e.target.value }))}
              placeholder="AIza..."
              className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">URL desta plataforma</label>
            <input value={cfg.appBaseUrl} onChange={e => setCfg(c => ({ ...c, appBaseUrl: e.target.value }))}
              placeholder="https://lp-controlaai.ztcjzs.easypanel.host"
              className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Número do bot WhatsApp (com DDI, sem + ou espaços)</label>
            <div className="flex gap-2">
              <input value={cfg.wppBotNumber} onChange={e => setCfg(c => ({ ...c, wppBotNumber: e.target.value.replace(/\D/g, "") }))}
                placeholder="5544999999999"
                className="flex-1 bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition font-mono" />
              {cfg.provider === "evolution" && (
                <button type="button" onClick={detectNumber} disabled={detecting}
                  className="text-xs text-slate-500 hover:text-slate-900 border border-slate-200 rounded-xl px-3 shrink-0 transition disabled:opacity-40">
                  {detecting ? "..." : "🔍 Detectar"}
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Exibido para os clientes vincularem o WhatsApp</p>
          </div>
        </div>

        {/* Google OAuth */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            Google OAuth — para criação de Google Meet
            {cfg.hasGoogleOAuth && <span className="ml-auto text-amber-500 text-[10px] font-semibold">✓ Configurado</span>}
          </p>
          <p className="text-[11px] text-slate-400">
            Crie um app OAuth no <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Google Cloud Console</a>.
            Ative a API Google Calendar. Adicione a URI de redirecionamento:
          </p>
          {cfg.appBaseUrl && (
            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
              <code className="text-xs text-amber-600 flex-1 break-all">{cfg.appBaseUrl.replace(/\/$/, "")}/api/auth/google/callback</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(`${cfg.appBaseUrl.replace(/\/$/, "")}/api/auth/google/callback`)}
                className="text-xs text-slate-400 hover:text-slate-900 border border-slate-300 rounded-lg px-2 py-1 shrink-0 transition">📋</button>
            </div>
          )}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Client ID</label>
            <input value={cfg.googleClientId} onChange={e => setCfg(c => ({ ...c, googleClientId: e.target.value }))}
              placeholder="999999999-abc123.apps.googleusercontent.com"
              className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition font-mono" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Client Secret</label>
            <input type="password" value={cfg.googleClientSecret} onChange={e => setCfg(c => ({ ...c, googleClientSecret: e.target.value }))}
              placeholder="GOCSPX-..."
              className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-slate-200 hover:bg-amber-600 text-slate-900 font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : "💾 Salvar configurações"}
        </button>
      </form>

      {/* Conectar (só Evolution — WABA não tem QR, usa o botão "Testar conexão" acima) */}
      {cfg.provider === "evolution" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="font-semibold text-slate-900 mb-1">📱 Conectar WhatsApp</h2>
          <p className="text-slate-400 text-sm mb-4">
            Após salvar servidor e admin key, clique para criar/reiniciar a instância e escanear o QR Code.
          </p>
          {connMsg && (
            <p className={clsx("text-xs rounded-lg px-3 py-2 border mb-3", connMsg.type === "ok" ? "text-amber-400 bg-amber-900/20 border-amber-800" : "text-red-400 bg-red-900/20 border-red-800")}>
              {connMsg.text}
            </p>
          )}
          <button disabled={connecting || !cfg.evolution.server}
            onClick={connectEvolution}
            className="w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold rounded-xl py-3 text-sm transition disabled:opacity-40 flex items-center justify-center gap-2">
            {connecting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Aguardando QR Code...</>
            ) : (
              "📱 Conectar WhatsApp"
            )}
          </button>
          {!cfg.evolution.server && (
            <p className="text-amber-500 text-xs text-center mt-2">⚠ Preencha e salve o servidor Evolution primeiro</p>
          )}
        </div>
      )}
    </div>
  );
}
