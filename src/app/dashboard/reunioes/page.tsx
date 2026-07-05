"use client";
import { useEffect, useState } from "react";

type MeetAttendee = { name: string; phone?: string; email?: string };
type Meet = {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  meetLink: string;
  attendees: MeetAttendee[];
  ataGenerated: boolean;
  ataContent?: string;
  status: "scheduled" | "ended" | "cancelled";
  source: "whatsapp" | "web";
  createdAt: string;
};

function formatDT(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ReunioesPage() {
  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", startDate: "", startTime: "", duration: "60", attendees: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedAta, setExpandedAta] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/google/status").then(r => r.json()).then(d => setGoogleConnected(d.connected)).catch(() => {});
    fetch("/api/meets").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setMeets(d.sort((a: Meet, b: Meet) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()));
    }).finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const upcoming = meets.filter(m => m.status === "scheduled" && new Date(m.endAt) >= now);
  const past = meets.filter(m => m.status !== "scheduled" || new Date(m.endAt) < now);

  async function createMeet(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    const attendees = form.attendees
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const emailMatch = line.match(/[\w.+-]+@[\w-]+\.\w+/);
        const phoneMatch = line.match(/[\d\s()+\-]{8,}/);
        const name = line.replace(emailMatch?.[0] ?? "", "").replace(phoneMatch?.[0] ?? "", "").replace(/[,;:]/g, "").trim() || "Convidado";
        return { name, email: emailMatch?.[0], phone: phoneMatch?.[0]?.replace(/\D/g, "") };
      });

    const r = await fetch("/api/meets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, description: form.description, startDate: form.startDate, startTime: form.startTime, duration: Number(form.duration), attendees }),
    });
    const d = await r.json();
    if (r.ok) {
      setMeets(prev => [d, ...prev]);
      setShowModal(false);
      setForm({ title: "", description: "", startDate: "", startTime: "", duration: "60", attendees: "" });
    } else {
      setSaveError(d.error || "Erro ao criar reunião");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🎥 Reuniões</h1>
          <p className="text-slate-400 text-sm mt-0.5">Gerencie seus Google Meet e acompanhe atas geradas pelo IA</p>
        </div>
        {googleConnected ? (
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition flex items-center gap-2 shrink-0">
            <span className="text-base">+</span> Nova Reunião
          </button>
        ) : (
          <a href="/dashboard/configuracoes" className="text-xs border border-blue-200 text-blue-600 rounded-xl px-4 py-2.5 transition hover:bg-blue-50 shrink-0">
            Conectar Google
          </a>
        )}
      </div>

      {!googleConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl shrink-0">🔗</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Google não conectado</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Acesse <a href="/dashboard/configuracoes" className="underline">Configurações → Integrações</a> para conectar sua conta Google e criar reuniões no Meet.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : meets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">🎥</p>
          <p className="font-semibold text-slate-700">Nenhuma reunião criada</p>
          <p className="text-xs text-slate-400 mt-1">
            {googleConnected
              ? 'Clique em "+ Nova Reunião" ou envie uma mensagem para o bot: "criar meet amanhã às 14h"'
              : 'Conecte sua conta Google para criar reuniões no Meet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Próximas */}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Próximas reuniões</h2>
              <div className="space-y-3">
                {upcoming.map(meet => (
                  <MeetCard key={meet.id} meet={meet} expandedAta={expandedAta} setExpandedAta={setExpandedAta} />
                ))}
              </div>
            </section>
          )}
          {/* Passadas */}
          {past.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Reuniões passadas</h2>
              <div className="space-y-3">
                {past.map(meet => (
                  <MeetCard key={meet.id} meet={meet} expandedAta={expandedAta} setExpandedAta={setExpandedAta} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Modal nova reunião */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span>🎥</span> Nova Reunião
            </h3>
            <form onSubmit={createMeet} className="space-y-3">
              <input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Título da reunião"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition"
              />
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição (opcional)"
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Data</label>
                  <input
                    required
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Horário (SP)</label>
                  <input
                    required
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Duração (minutos)</label>
                <select
                  value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition bg-white">
                  <option value="30">30 min</option>
                  <option value="60">1 hora</option>
                  <option value="90">1h30</option>
                  <option value="120">2 horas</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Participantes (um por linha — nome + phone ou email)</label>
                <textarea
                  value={form.attendees}
                  onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))}
                  placeholder={"João Silva 11999990000\nMaria maria@email.com"}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition resize-none font-mono"
                />
              </div>
              {saveError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
                  {saving ? "Criando..." : "Criar Reunião"}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="text-slate-500 hover:text-slate-700 rounded-xl px-4 py-2.5 text-sm transition">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetCard({ meet, expandedAta, setExpandedAta }: {
  meet: Meet;
  expandedAta: string | null;
  setExpandedAta: (id: string | null) => void;
}) {
  const isPast = new Date(meet.endAt) < new Date() || meet.status !== "scheduled";

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${isPast ? "border-slate-100" : "border-blue-100"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${isPast ? "bg-slate-100" : "bg-blue-100"}`}>
            🎥
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{meet.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {formatDT(meet.startAt)} → {formatTime(meet.endAt)}
            </p>
            {meet.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{meet.description}</p>
            )}
            {meet.attendees.length > 0 && (
              <p className="text-xs text-slate-400 mt-1.5">
                👥 {meet.attendees.map(a => a.name).join(", ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <a
            href={meet.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition ${isPast ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
            {isPast ? "Ver Meet" : "Entrar"}
          </a>
          {meet.ataGenerated && (
            <button
              onClick={() => setExpandedAta(expandedAta === meet.id ? null : meet.id)}
              className="text-xs text-emerald-600 hover:underline">
              {expandedAta === meet.id ? "Ocultar ata" : "Ver ata"}
            </button>
          )}
        </div>
      </div>

      {meet.ataGenerated && expandedAta === meet.id && meet.ataContent && (
        <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-800 mb-2">📋 Ata gerada pelo IA</p>
          <p className="text-xs text-emerald-700 whitespace-pre-line">{meet.ataContent}</p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          meet.status === "scheduled" && !isPast ? "bg-blue-100 text-blue-700" :
          meet.status === "ended" || isPast ? "bg-slate-100 text-slate-600" :
          "bg-red-100 text-red-600"
        }`}>
          {meet.status === "scheduled" && !isPast ? "Agendada" : meet.status === "cancelled" ? "Cancelada" : "Encerrada"}
        </span>
        <span className="text-[10px] text-slate-400">via {meet.source === "whatsapp" ? "WhatsApp" : "Dashboard"}</span>
        {meet.ataGenerated && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Ata ✓</span>}
      </div>
    </div>
  );
}
