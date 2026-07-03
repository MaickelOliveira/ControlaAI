"use client";
import { useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";

type Config = {
  wppServer: string;
  wppToken: string;
  wppSession: string;
  geminiApiKey: string;
  appBaseUrl: string;
  connectionStatus: string;
};

export default function ConfiguracoesPage() {
  const [cfg, setCfg] = useState<Config>({
    wppServer: "", wppToken: "", wppSession: "controlaai",
    geminiApiKey: "", appBaseUrl: "", connectionStatus: "UNKNOWN",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/admin/config");
    if (res.ok) {
      const data = await res.json();
      setCfg(data);
      if (data.appBaseUrl) {
        setWebhookUrl(`${data.appBaseUrl.replace(/\/$/, "")}/api/webhook/wppconnect`);
      }
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Poll status quando conectando
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/admin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status" }) });
      const data = await res.json();
      if (data.status === "CONNECTED") {
        setCfg(c => ({ ...c, connectionStatus: "CONNECTED" }));
        setQr(null);
        setPolling(false);
        setConnecting(false);
      } else {
        // Tenta pegar QR atualizado
        const qrRes = await fetch("/api/admin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "qr" }) });
        const qrData = await qrRes.json();
        if (qrData.qr) setQr(qrData.qr);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [polling]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    if (cfg.appBaseUrl) setWebhookUrl(`${cfg.appBaseUrl.replace(/\/$/, "")}/api/webhook/wppconnect`);
  }

  async function handleConnect() {
    setConnecting(true);
    setQr(null);
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (data.qr) {
      setQr(data.qr);
      setPolling(true);
    } else if (!res.ok) {
      alert(data.error || "Erro ao conectar");
      setConnecting(false);
    }
  }

  const statusColor = {
    CONNECTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
    DISCONNECTED: "bg-red-100 text-red-700 border-red-200",
    UNKNOWN: "bg-gray-100 text-gray-600 border-gray-200",
  }[cfg.connectionStatus] ?? "bg-gray-100 text-gray-600 border-gray-200";

  const statusIcon = { CONNECTED: "🟢", DISCONNECTED: "🔴", UNKNOWN: "⚪" }[cfg.connectionStatus] ?? "⚪";
  const statusLabel = { CONNECTED: "Conectado", DISCONNECTED: "Desconectado", UNKNOWN: "Verificando..." }[cfg.connectionStatus] ?? "Desconhecido";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">⚙️ Configurações</h1>

      {/* Status da conexão */}
      <div className={clsx("rounded-2xl border p-5 flex items-center justify-between", statusColor)}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{statusIcon}</span>
          <div>
            <p className="font-semibold">WhatsApp Bot</p>
            <p className="text-sm opacity-80">{statusLabel}</p>
          </div>
        </div>
        <button
          onClick={() => loadConfig()}
          className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-white/50 transition"
        >
          Atualizar
        </button>
      </div>

      {/* QR Code */}
      {qr && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <h3 className="font-bold text-gray-800 mb-2">📱 Escaneie o QR Code</h3>
          <p className="text-sm text-gray-500 mb-4">
            Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
          </p>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR Code WhatsApp" className="w-64 h-64 rounded-xl border-4 border-emerald-200" />
          </div>
          <p className="text-xs text-gray-400 mt-3 animate-pulse">Aguardando conexão...</p>
        </div>
      )}

      {/* Formulário de configuração */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-bold text-gray-800 mb-5">🔌 Configurações do WPPConnect</h2>
        <form onSubmit={handleSave} className="space-y-4">

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
            <p className="font-semibold mb-1">📋 Como funciona:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Configure o servidor WPPConnect abaixo e salve</li>
              <li>Clique em <strong>"Conectar WhatsApp"</strong> para gerar o QR Code</li>
              <li>Escaneie o QR Code com o celular que vai ser o bot</li>
              <li>Pronto! Os clientes mandam mensagem para esse número e a IA registra tudo</li>
            </ol>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL do Servidor WPPConnect</label>
            <input value={cfg.wppServer} onChange={e => setCfg(c => ({ ...c, wppServer: e.target.value }))}
              placeholder="https://wpp.seuservidor.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
            <p className="text-xs text-gray-400 mt-1">URL do servidor WPPConnect que você já usa no trafegopago</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Token do WPPConnect</label>
            <input value={cfg.wppToken} onChange={e => setCfg(c => ({ ...c, wppToken: e.target.value }))}
              placeholder="seu-token-aqui" type="password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da sessão</label>
            <input value={cfg.wppSession} onChange={e => setCfg(c => ({ ...c, wppSession: e.target.value }))}
              placeholder="controlaai"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
            <p className="text-xs text-gray-400 mt-1">Nome único da sessão no WPPConnect (ex: controlaai)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chave Gemini AI</label>
            <input value={cfg.geminiApiKey} onChange={e => setCfg(c => ({ ...c, geminiApiKey: e.target.value }))}
              placeholder="AIza..." type="password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
            <p className="text-xs text-gray-400 mt-1">Chave da API do Google Gemini para processamento de mensagens</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL da plataforma (para webhook)</label>
            <input value={cfg.appBaseUrl} onChange={e => setCfg(c => ({ ...c, appBaseUrl: e.target.value }))}
              placeholder="https://controlaai.seudominio.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
            <p className="text-xs text-gray-400 mt-1">URL pública da sua instalação do ControlaAI</p>
          </div>

          {webhookUrl && (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-1">URL do Webhook (configure no WPPConnect):</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-emerald-700 flex-1 break-all">{webhookUrl}</code>
                <button type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  className="text-xs px-2 py-1 bg-white border rounded-lg hover:bg-gray-100 transition shrink-0">
                  📋 Copiar
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-50">
              {saving ? "Salvando..." : saved ? "✓ Salvo!" : "💾 Salvar configurações"}
            </button>
            <button
              type="button"
              disabled={connecting || !cfg.wppServer || !cfg.wppToken}
              onClick={handleConnect}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl py-3 transition disabled:opacity-40"
            >
              {connecting ? "⏳ Aguardando QR..." : "📱 Conectar WhatsApp"}
            </button>
          </div>
        </form>
      </div>

      {/* Instruções de uso */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-bold text-gray-800 mb-4">📖 Comandos disponíveis para os clientes</h2>
        <div className="space-y-3 text-sm">
          {[
            { emoji: "💸", cmd: '"Gastei 50 no mercado"', desc: "Registra despesa em Alimentação" },
            { emoji: "💰", cmd: '"Recebi 3000 de salário"', desc: "Registra receita em Salário" },
            { emoji: "📊", cmd: '"Meu saldo"', desc: "Exibe resumo financeiro do mês" },
            { emoji: "📋", cmd: '"Criar tarefa: ligar pro cliente até amanhã"', desc: "Cria tarefa com prazo" },
            { emoji: "✅", cmd: '"Concluir 1"', desc: "Marca tarefa número 1 como concluída" },
            { emoji: "🔔", cmd: '"Me lembra de pagar aluguel todo dia 5"', desc: "Lembrete mensal recorrente" },
            { emoji: "🏢", cmd: '"Modo empresa"', desc: "Alterna para modo empresarial" },
            { emoji: "👤", cmd: '"Modo pessoal"', desc: "Volta para modo pessoal" },
          ].map(item => (
            <div key={item.cmd} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="text-lg shrink-0">{item.emoji}</span>
              <div>
                <code className="text-xs text-emerald-700 font-semibold">{item.cmd}</code>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
