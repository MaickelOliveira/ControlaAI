"use client";
import { useEffect, useState } from "react";

export default function ClienteConfigPage() {
  const [wppPhone, setWppPhone] = useState("");
  const [currentPhone, setCurrentPhone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; plan: string; activeMode: string } | null>(null);

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => {
      if (d.user) {
        setUser(d.user);
        if (d.user.wppPhone) { setCurrentPhone(d.user.wppPhone); setWppPhone(d.user.wppPhone); }
      }
    });
  }, []);

  async function savePhone(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/admin/user-mode", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wppPhone }) });
    setCurrentPhone(wppPhone || null);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">⚙️ Configurações</h1>
        <p className="text-slate-400 text-sm mt-0.5">Configure seu acesso ao bot WhatsApp</p>
      </div>

      {/* WhatsApp do cliente */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span className="text-xl">📱</span>
          Meu WhatsApp no Bot
        </h2>
        <p className="text-sm text-slate-400 mb-5">
          Informe o número de WhatsApp que você vai usar para enviar mensagens ao assistente IA e registrar suas finanças e tarefas.
        </p>

        {currentPhone ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center gap-3">
            <span className="text-emerald-600 text-lg">✓</span>
            <div>
              <p className="text-sm font-semibold text-emerald-700">Número cadastrado</p>
              <p className="text-xs text-emerald-600">{currentPhone}</p>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-3">
            <span className="text-amber-600 text-lg">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-700">Número não cadastrado</p>
              <p className="text-xs text-amber-600">Cadastre seu número para usar o bot!</p>
            </div>
          </div>
        )}

        <form onSubmit={savePhone} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Número com DDD (somente dígitos)
            </label>
            <input
              value={wppPhone}
              onChange={e => setWppPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="Ex: 44999999999 (com DDD)"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Coloque com DDD, sem espaços ou traços. Ex: 44999991234
            </p>
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
            {saving ? "Salvando..." : saved ? "✓ Salvo com sucesso!" : "💾 Salvar número"}
          </button>
        </form>
      </div>

      {/* Como usar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <span>💬</span>
          Como enviar mensagens para o Bot
        </h2>
        <div className="space-y-3">
          {[
            { icon: "💸", title: "Registrar despesa", ex: "\"Gastei 45 no mercado\"" },
            { icon: "💰", title: "Registrar receita", ex: "\"Recebi 3000 de salário\"" },
            { icon: "📊", title: "Ver saldo", ex: "\"Meu saldo\" ou \"Resumo do mês\"" },
            { icon: "📋", title: "Criar tarefa", ex: "\"Criar tarefa: ligar pro João até sexta\"" },
            { icon: "✅", title: "Concluir tarefa", ex: "\"Concluir 1\" (número da tarefa)\"" },
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

      {/* Dados da conta */}
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
