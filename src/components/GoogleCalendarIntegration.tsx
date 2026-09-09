"use client";

import { useCallback, useEffect, useState } from "react";

type Locale = "pt-BR" | "pt-PT" | "es";
type CalendarOption = { id: string; name: string; primary: boolean; backgroundColor?: string };

const COPY = {
  "pt-BR": {
    description: "Sincronize compromissos e crie reuniões no Google Meet diretamente pelo Zelo",
    privacy: "Ao conectar, você autoriza o Zelo a criar, editar e excluir eventos conforme seus comandos.",
    choose: "Agenda usada pelo Zelo",
    loading: "Carregando suas agendas...",
    reconnect: "Reconecte o Google para liberar a escolha da agenda.",
    saved: "Agenda selecionada com sucesso.",
    saveError: "Não foi possível selecionar esta agenda.",
    connect: "Conectar Google", reconnectButton: "Reconectar Google", disconnect: "Desconectar", privacyLink: "Política de Privacidade",
  },
  "pt-PT": {
    description: "Sincronize compromissos e crie reuniões no Google Meet diretamente pelo Zelo",
    privacy: "Ao ligar, autoriza o Zelo a criar, editar e eliminar eventos conforme os seus comandos.",
    choose: "Agenda utilizada pelo Zelo",
    loading: "A carregar as suas agendas...",
    reconnect: "Volte a ligar o Google para permitir a escolha da agenda.",
    saved: "Agenda selecionada com sucesso.",
    saveError: "Não foi possível selecionar esta agenda.",
    connect: "Ligar Google", reconnectButton: "Voltar a ligar Google", disconnect: "Desligar", privacyLink: "Política de Privacidade",
  },
  es: {
    description: "Sincroniza tus citas y crea reuniones de Google Meet directamente desde Zelo",
    privacy: "Al conectar, autorizas a Zelo a crear, editar y eliminar eventos según tus instrucciones.",
    choose: "Calendario que usará Zelo",
    loading: "Cargando tus calendarios...",
    reconnect: "Vuelve a conectar Google para habilitar la selección del calendario.",
    saved: "Calendario seleccionado correctamente.",
    saveError: "No se pudo seleccionar este calendario.",
    connect: "Conectar Google", reconnectButton: "Volver a conectar Google", disconnect: "Desconectar", privacyLink: "Política de Privacidad",
  },
} as const;

export default function GoogleCalendarIntegration({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const [status, setStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [selectedId, setSelectedId] = useState("primary");
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCalendars = useCallback(async () => {
    setLoadingCalendars(true);
    try {
      const response = await fetch("/api/google/calendars");
      const data = await response.json();
      if (!response.ok) {
        setReauthRequired(Boolean(data.reauthRequired));
        return;
      }
      setCalendars(data.calendars || []);
      setSelectedId(data.selectedCalendarId || data.calendars?.find((item: CalendarOption) => item.primary)?.id || "primary");
      setReauthRequired(false);
    } finally {
      setLoadingCalendars(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/google/status").then(r => r.json()).then(data => {
      setStatus(data);
      if (data.connected) void loadCalendars();
    }).catch(() => setStatus({ connected: false }));
  }, [loadCalendars]);

  async function chooseCalendar(calendarId: string) {
    setSelectedId(calendarId);
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/google/calendars", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId }),
    });
    if (response.ok) setMessage({ ok: true, text: copy.saved });
    else setMessage({ ok: false, text: copy.saveError });
    setSaving(false);
  }

  async function disconnect() {
    setSaving(true);
    await fetch("/api/google/disconnect", { method: "POST" });
    setStatus({ connected: false });
    setCalendars([]);
    setSaving(false);
  }

  const localeQuery = locale === "pt-BR" ? "pt-BR" : locale;
  const privacyHref = locale === "es" ? "/es/privacidad" : locale === "pt-PT" ? "/pt/privacidade" : "/privacidade";

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm text-xl shrink-0">🗓️</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">Google Calendar / Meet</p>
          <p className="text-xs text-slate-400 mt-0.5">{copy.description}</p>
          <p className="mt-1 max-w-xl text-[11px] leading-4 text-slate-400">
            {copy.privacy} <a href={privacyHref} className="font-semibold text-blue-600 underline">{copy.privacyLink}</a>.
          </p>
          {status?.connected && status.email && <p className="text-xs text-amber-600 mt-1 font-medium">✓ {status.email}</p>}

          {status?.connected && (
            <div className="mt-3 max-w-md">
              {loadingCalendars ? <p className="text-xs text-slate-500">{copy.loading}</p> : reauthRequired ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700">{copy.reconnect}</p>
                  <a href={`/api/google/connect?locale=${encodeURIComponent(localeQuery)}`} className="inline-flex text-xs font-semibold text-blue-600 underline">{copy.reconnectButton}</a>
                </div>
              ) : calendars.length > 0 ? (
                <label className="block text-xs font-semibold text-slate-600">
                  {copy.choose}
                  <select
                    value={selectedId}
                    onChange={event => void chooseCalendar(event.target.value)}
                    disabled={saving}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 disabled:opacity-60"
                  >
                    {calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.primary ? " (principal)" : ""}</option>)}
                  </select>
                </label>
              ) : null}
              {message && <p className={`mt-1.5 text-[11px] ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {status === null ? <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" /> : status.connected ? (
          <button onClick={disconnect} disabled={saving} className="text-xs border border-red-200 text-red-500 hover:bg-red-50 rounded-lg px-3 py-1.5 transition disabled:opacity-50">{saving ? "..." : copy.disconnect}</button>
        ) : (
          <a href={`/api/google/connect?locale=${encodeURIComponent(localeQuery)}`} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-1.5 transition">{copy.connect}</a>
        )}
      </div>
    </div>
  );
}
