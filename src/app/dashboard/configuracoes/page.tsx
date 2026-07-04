"use client";
import { useEffect, useState } from "react";

export default function ClienteConfigPage() {
  const [user, setUser] = useState<{ name: string; email: string; plan: string; wppPhone?: string } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [botNumber, setBotNumber] = useState<string>("");

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => { if (d.user) setUser(d.user); });
    fetch("/api/bot-info").then(r => r.json()).then(d => { if (d.wppBotNumber) setBotNumber(d.wppBotNumber); });
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

  const commands = [
    { icon: "💸", title: "Registrar despesa", ex: "\"Gastei 45 no mercado\"" },
    { icon: "💰", title: "Registrar receita", ex: "\"Recebi 3000 de salário\"" },
    { icon: "📊", title: "Ver saldo", ex: "\"Meu saldo\"" },
    { icon: "📋", title: "Criar tarefa", ex: "\"Criar tarefa: ligar pro João até sexta\"" },
    { icon: "🎯", title: "Criar meta", ex: "\"Meta: guardar 5000 para viagem\"" },
    { icon: "✏️", title: "Editar lançamento", ex: "\"Corrija o gasto do ifood para 80\"" },
    { icon: "🗑️", title: "Excluir lançamento", ex: "\"Apaga o gasto do mercado\"" },
    { icon: "⛽", title: "Gasto no carro", ex: "\"Abasteci 80 reais no Gol\"" },
    { icon: "🔔", title: "Criar lembrete", ex: "\"Me lembra sexta às 9h de pagar conta\"" },
    { icon: "🏢", title: "Trocar modo", ex: "\"Modo empresa\" ou \"Modo pessoal\"" },
    { icon: "❓", title: "Pedir ajuda", ex: "\"Como faço para criar uma tarefa?\"" },
    { icon: "📋", title: "Ver extrato", ex: "\"Extrato\" ou \"Meus últimos gastos\"" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">⚙️ Configurações</h1>
        <p className="text-slate-400 text-sm mt-0.5">Configure seu acesso ao bot WhatsApp e gerencie sua conta</p>
      </div>

      {/* Linha 1: WhatsApp + Conta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* WhatsApp — 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2 text-base">
            <span className="text-xl">📱</span> Vincular WhatsApp ao Bot
          </h2>
          <p className="text-sm text-slate-400 mb-5">
            Vincule seu número para usar o assistente IA pelo WhatsApp. O sistema identifica você automaticamente.
          </p>

          {user?.wppPhone ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg shrink-0">✓</div>
                <div>
                  <p className="text-sm font-semibold text-emerald-700">WhatsApp vinculado</p>
                  <p className="text-xs text-emerald-600 font-mono mt-0.5">{user.wppPhone}</p>
                </div>
              </div>
              <button onClick={generateCode} disabled={linking}
                className="text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-100 rounded-lg px-3 py-1.5 transition">
                Revincular com outro número
              </button>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-lg shrink-0">⚠</div>
              <div>
                <p className="text-sm font-semibold text-amber-700">WhatsApp não vinculado</p>
                <p className="text-xs text-amber-600 mt-0.5">Vincule seu número para começar a usar o bot.</p>
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
                <p className="text-xs text-slate-500 mb-2">Seu código de vinculação:</p>
                <p className="text-5xl font-bold tracking-widest text-slate-900 font-mono">{code}</p>
                <p className="text-xs text-slate-400 mt-3">⏱ Válido por 10 minutos</p>
              </div>

              {botNumber ? (
                <a
                  href={`https://wa.me/${botNumber}?text=${encodeURIComponent(code ?? "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold rounded-xl py-3.5 text-sm transition shadow-sm">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Abrir WhatsApp e enviar código
                </a>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                  <p className="font-semibold mb-2">Como fazer:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs">
                    <li>Abra o WhatsApp no celular que vai usar</li>
                    <li>Mande uma mensagem com apenas o código: <strong className="font-mono">{code}</strong></li>
                    <li>O bot vai confirmar a vinculação automaticamente</li>
                  </ol>
                </div>
              )}

              {botNumber && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-600">
                  Ao clicar, o WhatsApp abrirá com o código <strong className="font-mono">{code}</strong> já digitado — é só enviar!
                </div>
              )}

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

        {/* Sua Conta — 1/3 */}
        {user && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
            <h2 className="font-semibold text-slate-800 mb-5 flex items-center gap-2 text-base">
              <span>👤</span> Sua Conta
            </h2>

            {/* Avatar */}
            <div className="flex flex-col items-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold shadow-sm mb-3">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
            </div>

            <div className="space-y-0 border border-slate-100 rounded-xl overflow-hidden flex-1">
              <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-xs text-slate-500">Plano</span>
                <span className="text-xs font-semibold text-slate-800">{user.plan === "business" ? "🏢 Empresarial" : "👤 Pessoal"}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-xs text-slate-500">WhatsApp</span>
                <span className="text-xs font-semibold text-slate-800">
                  {user.wppPhone
                    ? <span className="text-emerald-600">✓ Vinculado</span>
                    : <span className="text-amber-600">⚠ Não vinculado</span>}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Linha 2: Comandos do Bot */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2 text-base">
          <span>💬</span> Comandos do Bot
        </h2>
        <p className="text-xs text-slate-400 mb-5">Envie estas mensagens para o WhatsApp do bot para usar cada função</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {commands.map(item => (
            <div key={item.title} className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition">
              <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">{item.title}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5 break-words">{item.ex}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
