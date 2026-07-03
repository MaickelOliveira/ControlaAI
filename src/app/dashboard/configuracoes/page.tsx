"use client";
import { useEffect, useState } from "react";

export default function ClienteConfigPage() {
  const [user, setUser] = useState<{ name: string; email: string; plan: string; wppPhone?: string } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => { if (d.user) setUser(d.user); });
  }, []);

  async function generateCode() {
    setLinking(true);
    const r = await fetch("/api/dashboard/wpp-link", { method: "POST" });
    const d = await r.json();
    if (r.ok) setCode(d.code);
    setLinking(false);
  }

  async function refresh() {
    const d = await fetch("/api/dashboard").then(r => r.json());
    if (d.user) setUser(d.user);
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">⚙️ Configurações</h1>
        <p className="text-slate-400 text-sm mt-0.5">Configure seu acesso ao bot WhatsApp</p>
      </div>

      {/* Vincular WhatsApp */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span className="text-xl">📱</span> Vincular WhatsApp ao Bot
        </h2>
        <p className="text-sm text-slate-400 mb-5">
          Vincule seu número para usar o assistente IA pelo WhatsApp. O sistema identifica você automaticamente.
        </p>

        {user?.wppPhone ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-emerald-600 text-lg">✓</span>
              <div>
                <p className="text-sm font-semibold text-emerald-700">WhatsApp vinculado</p>
                <p className="text-xs text-emerald-600 font-mono">{user.wppPhone}</p>
              </div>
            </div>
            <button onClick={generateCode} disabled={linking}
              className="text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-100 rounded-lg px-3 py-1.5 transition">
              Revincular com outro número
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-3">
            <span className="text-amber-600 text-lg">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-700">WhatsApp não vinculado</p>
              <p className="text-xs text-amber-600">Vincule para usar o bot!</p>
            </div>
          </div>
        )}

        {!code ? (
          <button onClick={generateCode} disabled={linking}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-3 text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
            {linking ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
            ) : "📲 Vincular meu WhatsApp"}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-6 text-center">
              <p className="text-xs text-slate-500 mb-2">Envie este código para o bot no WhatsApp:</p>
              <p className="text-5xl font-bold tracking-widest text-slate-900 font-mono">{code}</p>
              <p className="text-xs text-slate-400 mt-3">⏱ Válido por 10 minutos</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
              <p className="font-semibold mb-1">Como fazer:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Abra o WhatsApp no celular que vai usar</li>
                <li>Mande a mensagem com apenas o código: <strong>{code}</strong></li>
                <li>O bot vai confirmar a vinculação automaticamente</li>
              </ol>
            </div>
            <div className="flex gap-2">
              <button onClick={refresh}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl py-2.5 text-sm transition">
                ✓ Já enviei, verificar
              </button>
              <button onClick={() => setCode(null)}
                className="text-slate-400 hover:text-slate-600 rounded-xl px-4 py-2.5 text-sm transition">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Como usar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><span>💬</span> Comandos do Bot</h2>
        <div className="space-y-2">
          {[
            { icon: "💸", title: "Registrar despesa", ex: "\"Gastei 45 no mercado\"" },
            { icon: "💰", title: "Registrar receita", ex: "\"Recebi 3000 de salário\"" },
            { icon: "📊", title: "Ver saldo", ex: "\"Meu saldo\"" },
            { icon: "📋", title: "Criar tarefa", ex: "\"Criar tarefa: ligar pro João até sexta\"" },
            { icon: "🎯", title: "Criar meta", ex: "\"Meta: guardar 5000 para viagem\"" },
            { icon: "⛽", title: "Gasto no carro", ex: "\"Abasteci 80 reais no Gol\"" },
            { icon: "🏢", title: "Trocar modo", ex: "\"Modo empresa\" ou \"Modo pessoal\"" },
          ].map(item => (
            <div key={item.title} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <span className="text-base shrink-0">{item.icon}</span>
              <div>
                <p className="text-xs font-semibold text-slate-700">{item.title}</p>
                <p className="text-xs text-slate-400 font-mono">{item.ex}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {user && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><span>👤</span> Sua Conta</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-50"><span className="text-slate-400">Nome</span><span className="font-medium text-slate-800">{user.name}</span></div>
            <div className="flex justify-between py-2 border-b border-slate-50"><span className="text-slate-400">Email</span><span className="font-medium text-slate-800">{user.email}</span></div>
            <div className="flex justify-between py-2"><span className="text-slate-400">Plano</span><span className="font-medium text-slate-800">{user.plan === "business" ? "🏢 Empresarial" : "👤 Pessoal"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
