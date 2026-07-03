"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type DashData = {
  user: { name: string; plan: string; status: string; activeMode: string; trialEndsAt: string };
  personal: { balance: { income: number; expense: number; balance: number }; dailyTotals: Array<{ date: string; income: number; expense: number }>; expenseCategories: Record<string, number> };
  business: { balance: { income: number; expense: number; balance: number }; dailyTotals: Array<{ date: string; income: number; expense: number }>; expenseCategories: Record<string, number> };
  tasks: { pendingCount: number; overdueCount: number; recent: Array<{ id: string; title: string; priority: string; dueDate?: string }> };
  recentTransactions: Array<{ id: string; type: string; amount: number; category: string; description: string; date: string; mode: string }>;
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={clsx("rounded-2xl p-5 text-white", color)}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">🤖</div>
        <p>Carregando...</p>
      </div>
    </div>
  );

  if (!data) return <div className="text-red-500">Erro ao carregar dados</div>;

  const { user, personal, business, tasks, recentTransactions } = data;
  const month = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const trialDays = Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Olá, {user.name.split(" ")[0]}! 👋</h1>
          <p className="text-gray-500 text-sm mt-1">Resumo de {month}</p>
        </div>
        {user.status === "trial" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-700">
            ⏳ {trialDays} dias de trial
          </div>
        )}
      </div>

      {/* KPIs Pessoal */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">👤 Pessoal</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Receitas" value={fmt(personal.balance.income)} color="bg-emerald-600" />
          <KpiCard label="Despesas" value={fmt(personal.balance.expense)} color="bg-red-500" />
          <KpiCard label="Saldo" value={fmt(personal.balance.balance)} color={personal.balance.balance >= 0 ? "bg-blue-600" : "bg-orange-500"} />
          <div className="rounded-2xl p-5 bg-purple-600 text-white">
            <p className="text-sm opacity-80">Tarefas</p>
            <p className="text-2xl font-bold mt-1">{tasks.pendingCount}</p>
            {tasks.overdueCount > 0 && <p className="text-xs opacity-70 mt-1">⚠️ {tasks.overdueCount} atrasadas</p>}
          </div>
        </div>
      </div>

      {/* KPIs Empresa (se tiver dados) */}
      {(business.balance.income > 0 || business.balance.expense > 0) && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">🏢 Empresa</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard label="Receitas" value={fmt(business.balance.income)} color="bg-emerald-700" />
            <KpiCard label="Despesas" value={fmt(business.balance.expense)} color="bg-red-600" />
            <KpiCard label="Saldo" value={fmt(business.balance.balance)} color={business.balance.balance >= 0 ? "bg-blue-700" : "bg-orange-600"} />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Transações recentes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">💳 Transações Recentes</h3>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">💬</div>
              <p className="text-sm">Nenhum registro ainda</p>
              <p className="text-xs mt-1">Envie uma mensagem para o bot começar!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map(t => (
                <div key={t.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{t.type === "income" ? "💰" : "💸"}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{t.description}</p>
                      <p className="text-xs text-gray-400">{t.category} • {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                  <span className={clsx("text-sm font-semibold", t.type === "income" ? "text-emerald-600" : "text-red-500")}>
                    {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tarefas pendentes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">📋 Tarefas Pendentes</h3>
          {tasks.recent.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">✨</div>
              <p className="text-sm">Nenhuma tarefa pendente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.recent.map(t => {
                const prIcon = t.priority === "high" ? "⚡" : t.priority === "medium" ? "🟡" : "⚪";
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <span>{prIcon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-gray-400">📅 {new Date(t.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Como usar */}
      {recentTransactions.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
          <h3 className="font-bold text-emerald-800 mb-4">🚀 Como começar a usar</h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            {[
              { icon: "💸", title: "Registrar gasto", ex: '"Gastei 50 no mercado"' },
              { icon: "📋", title: "Criar tarefa", ex: '"Criar tarefa: ligar pro cliente"' },
              { icon: "🔔", title: "Criar lembrete", ex: '"Me lembra de pagar conta sexta"' },
            ].map(item => (
              <div key={item.title} className="bg-white rounded-xl p-4">
                <div className="text-2xl mb-2">{item.icon}</div>
                <p className="font-semibold text-gray-800">{item.title}</p>
                <p className="text-gray-500 text-xs mt-1">{item.ex}</p>
              </div>
            ))}
          </div>
          <p className="text-emerald-700 text-sm mt-4">
            📱 Envie qualquer uma dessas mensagens para o WhatsApp do bot e a IA processa automaticamente!
          </p>
        </div>
      )}
    </div>
  );
}
