"use client";
import { useEffect, useState } from "react";
import PasswordField from "@/components/es/PasswordField";

type UserData = {
  name: string; email: string; plan: string; wppPhone?: string; wppPhones: string[];
  wppPhoneNames: Record<string, string>;
  wppPhoneRelations: Record<string, string>;
  wppPhoneAccess: Record<string, "personal" | "business" | "both">;
  maxWppPhones: number;
};
type PwForm = { current: string; next: string; confirm: string };
type EditForm = { name: string; relation: string; access: "personal" | "business" | "both" };

const ACCESS_LABEL: Record<string, string> = { personal: "👤 Solo personal", business: "🏢 Solo empresa", both: "🔓 Ambos los modos" };

export default function ClienteConfigPageEs() {
  const [user, setUser] = useState<UserData | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [unlinkingPhone, setUnlinkingPhone] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", relation: "", access: "both" });
  const [savingName, setSavingName] = useState(false);
  const [botNumber, setBotNumber] = useState<string>("");
  const [botConnected, setBotConnected] = useState<boolean | null>(null);
  const [pwForm, setPwForm] = useState<PwForm>({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const unlimitedPhones = (user?.maxWppPhones ?? 0) >= 1_000_000;

  function normalizeUser(d: { user: Partial<UserData> }): UserData {
    return {
      ...(d.user as UserData),
      wppPhones: d.user.wppPhones ?? [],
      wppPhoneNames: d.user.wppPhoneNames ?? {},
      wppPhoneRelations: d.user.wppPhoneRelations ?? {},
      wppPhoneAccess: d.user.wppPhoneAccess ?? {},
      maxWppPhones: d.user.maxWppPhones ?? 1,
    };
  }

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => { if (d.user) setUser(normalizeUser(d)); });
    fetch("/api/bot-info").then(r => r.json()).then(d => { if (d.wppBotNumber) setBotNumber(d.wppBotNumber); setBotConnected(!!d.connected); });
    fetch("/api/google/status").then(r => r.json()).then(d => setGoogleStatus(d)).catch(() => {});
  }, []);

  async function generateCode() {
    setLinking(true);
    setLinkError(null);
    const r = await fetch("/api/dashboard/wpp-link", { method: "POST" });
    const d = await r.json();
    if (r.ok) setCode(d.code);
    else setLinkError(d.error || "Error al generar código");
    setLinking(false);
  }

  async function refresh() {
    const d = await fetch("/api/dashboard").then(r => r.json());
    if (d.user) setUser(normalizeUser(d));
    setCode(null);
  }

  async function unlink(phone: string) {
    setUnlinkingPhone(phone);
    await fetch("/api/dashboard/wpp-link", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
    setUser(u => u ? { ...u, wppPhones: u.wppPhones.filter(p => p !== phone) } : u);
    setUnlinkingPhone(null);
  }

  function startEdit(phone: string) {
    setEditingPhone(phone);
    setEditForm({
      name: user?.wppPhoneNames[phone] ?? "",
      relation: user?.wppPhoneRelations[phone] ?? "",
      access: user?.wppPhoneAccess[phone] ?? "both",
    });
  }

  async function saveEdit(phone: string) {
    const name = editForm.name.trim();
    if (!name) return;
    setSavingName(true);
    const r = await fetch("/api/dashboard/wpp-link", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, name, relation: editForm.relation.trim(), access: editForm.access }),
    });
    const d = await r.json();
    if (r.ok) setUser(u => u ? { ...u, wppPhoneNames: d.wppPhoneNames, wppPhoneRelations: d.wppPhoneRelations, wppPhoneAccess: d.wppPhoneAccess } : u);
    setSavingName(false);
    setEditingPhone(null);
  }

  async function disconnectGoogle() {
    setGoogleLoading(true);
    await fetch("/api/google/disconnect", { method: "POST" });
    setGoogleStatus({ connected: false });
    setGoogleLoading(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ ok: false, text: "Las contraseñas no coinciden" }); return; }
    setPwLoading(true);
    const r = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }) });
    const d = await r.json();
    if (r.ok) { setPwMsg({ ok: true, text: "¡Contraseña cambiada con éxito!" }); setPwForm({ current: "", next: "", confirm: "" }); }
    else setPwMsg({ ok: false, text: d.error || "Error al cambiar la contraseña" });
    setPwLoading(false);
  }

  const commands = [
    { icon: "💸", title: "Registrar gasto", ex: "\"Gasté 45 en el supermercado\"" },
    { icon: "💰", title: "Registrar ingreso", ex: "\"Recibí 3000 de salario\"" },
    { icon: "📊", title: "Ver saldo", ex: "\"Mi saldo\"" },
    { icon: "📋", title: "Crear tarea", ex: "\"Crear tarea: llamar a Juan antes del viernes\"" },
    { icon: "🎯", title: "Crear meta", ex: "\"Meta: ahorrar 5000 para un viaje\"" },
    { icon: "✏️", title: "Editar movimiento", ex: "\"Corrige el gasto de comida a 80\"" },
    { icon: "🗑️", title: "Eliminar movimiento", ex: "\"Borra el gasto del supermercado\"" },
    { icon: "⛽", title: "Gasto del auto", ex: "\"Cargué 80 de combustible en mi auto\"" },
    { icon: "🔔", title: "Crear recordatorio", ex: "\"Recuérdame el viernes a las 9h pagar la cuenta\"" },
    { icon: "🏢", title: "Cambiar modo", ex: "\"Modo empresa\" o \"Modo personal\"" },
    { icon: "❓", title: "Pedir ayuda", ex: "\"¿Cómo hago para crear una tarea?\"" },
    { icon: "📋", title: "Ver resumen", ex: "\"Resumen\" o \"Mis últimos gastos\"" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">⚙️ Configuración</h1>
        <p className="text-slate-400 text-sm mt-0.5">Configura tu acceso al bot de WhatsApp y gestiona tu cuenta</p>
      </div>

      {/* Linha 1: WhatsApp + Conta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* WhatsApp — 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-base">
              <span className="text-xl">📱</span> Vincular WhatsApp al Bot
            </h2>
            {botConnected !== null && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                botConnected ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${botConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {botConnected ? "Bot conectado" : "Bot desconectado"}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mb-5">
            Vincula tu número para usar el asistente IA por WhatsApp. El sistema te identifica automáticamente.
          </p>

          {/* Números vinculados */}
          {user && user.wppPhones.length > 0 ? (
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-600">Números vinculados</p>
                <span className="text-xs font-semibold text-emerald-600">{user.wppPhones.length} vinculado(s) · ilimitados</span>
              </div>
              <p className="text-[11px] text-slate-400 -mt-1 mb-1">
                Dale un nombre, relación (ej: esposa, hijo) y el modo al que cada persona puede acceder — el bot ya sabe quién es quién y limita lo que cada una ve.
              </p>
              {user.wppPhones.map(phone => (
                <div key={phone} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 text-sm shrink-0">✓</div>
                      <div className="min-w-0">
                        <p className="text-sm font-mono text-amber-700">+{phone}</p>
                        {editingPhone !== phone && (user.wppPhoneNames[phone] || user.wppPhoneRelations[phone]) && (
                          <p className="text-xs text-amber-600 font-semibold truncate">
                            {user.wppPhoneNames[phone] || "Sin nombre"}{user.wppPhoneRelations[phone] ? ` · ${user.wppPhoneRelations[phone]}` : ""}
                          </p>
                        )}
                        {editingPhone !== phone && (
                          <p className="text-[10px] text-slate-500 mt-0.5">{ACCESS_LABEL[user.wppPhoneAccess[phone] || "both"]}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => unlink(phone)}
                      disabled={unlinkingPhone === phone}
                      className="text-xs border border-red-200 text-red-500 hover:bg-red-50 rounded-lg px-2.5 py-1 transition disabled:opacity-50 shrink-0">
                      {unlinkingPhone === phone ? "..." : "Desvincular"}
                    </button>
                  </div>
                  {editingPhone === phone ? (
                    <div className="space-y-2 mt-2">
                      <input
                        autoFocus
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Nombre de la persona"
                        maxLength={40}
                        className="w-full text-xs border border-amber-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-500 transition" />
                      <input
                        value={editForm.relation}
                        onChange={e => setEditForm(f => ({ ...f, relation: e.target.value }))}
                        placeholder="Relación (ej: esposa, hijo, socio)"
                        maxLength={30}
                        className="w-full text-xs border border-amber-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-500 transition" />
                      <select
                        value={editForm.access}
                        onChange={e => setEditForm(f => ({ ...f, access: e.target.value as EditForm["access"] }))}
                        className="w-full text-xs border border-amber-300 rounded-lg px-2.5 py-1.5 outline-none bg-white">
                        <option value="personal">👤 Solo personal</option>
                        <option value="business">🏢 Solo empresa</option>
                        <option value="both">🔓 Ambos los modos</option>
                      </select>
                      <div className="flex items-center gap-2">
                        <button onClick={() => saveEdit(phone)} disabled={savingName || !editForm.name.trim()}
                          className="text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-2.5 py-1.5 transition disabled:opacity-50">
                          {savingName ? "..." : "Guardar"}
                        </button>
                        <button onClick={() => setEditingPhone(null)}
                          className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1.5 transition">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(phone)}
                      className="text-[11px] text-amber-700 hover:underline mt-1.5">
                      {user.wppPhoneNames[phone] ? "✏️ Editar" : "+ Agregar nombre, relación y acceso"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-lg shrink-0">⚠</div>
              <div>
                <p className="text-sm font-semibold text-amber-700">WhatsApp no vinculado</p>
                <p className="text-xs text-amber-600 mt-0.5">Vincula tu número para empezar a usar el bot.</p>
              </div>
            </div>
          )}

          {/* Erro de limite */}
          {linkError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-xs text-red-600">{linkError}</div>
          )}

          {!code ? (
            <button
              onClick={generateCode}
              disabled={linking || (user ? !unlimitedPhones && user.wppPhones.length >= user.maxWppPhones : false)}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl py-3 text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
              {linking ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generando...</>
              ) : user && !unlimitedPhones && user.wppPhones.length >= user.maxWppPhones ? (
                `🔒 Límite alcanzado (${user.maxWppPhones} número${user.maxWppPhones > 1 ? "s" : ""})`
              ) : (
                `📲 ${user && user.wppPhones.length > 0 ? "Vincular otro número" : "Vincular mi WhatsApp"}`
              )}
            </button>
          ) : (
            <div className="space-y-4">
              {/* Código + copiar */}
              <div className="bg-slate-900 rounded-2xl p-5 text-center">
                <p className="text-xs text-slate-400 mb-3 uppercase tracking-widest font-medium">Tu código de vinculación</p>
                <p className="text-5xl font-bold tracking-[0.25em] text-white font-mono mb-3">{code}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(code ?? ""); }}
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg px-4 py-1.5 transition font-medium">
                  📋 Copiar código
                </button>
                <p className="text-xs text-slate-500 mt-3">⏱ Válido por 10 minutos</p>
              </div>

              {/* Instrução */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-800 mb-2">Cómo vincular:</p>
                <ol className="space-y-1.5 text-xs text-amber-700">
                  <li className="flex gap-2"><span className="font-bold shrink-0">1.</span> Haz clic en el botón verde abajo para abrir WhatsApp</li>
                  <li className="flex gap-2"><span className="font-bold shrink-0">2.</span> El código <strong className="font-mono">{code}</strong> ya estará escrito — solo haz clic en enviar</li>
                  <li className="flex gap-2"><span className="font-bold shrink-0">3.</span> ¡El bot confirma y ya puedes usarlo!</li>
                </ol>
              </div>

              {/* Botão WhatsApp */}
              <a
                href={botNumber
                  ? `whatsapp://send?phone=${botNumber}&text=${encodeURIComponent(code ?? "")}`
                  : `whatsapp://`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 w-full bg-[#25D366] hover:bg-[#1ebe5d] active:bg-[#17a84e] text-white font-semibold rounded-xl py-4 text-sm transition shadow-md">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {botNumber ? "Abrir WhatsApp y enviar código" : "Abrir WhatsApp"}
              </a>

              {!botNumber && (
                <p className="text-center text-xs text-slate-500">
                  Busca la conversación con el bot, pega el código <strong className="font-mono">{code}</strong> y envíalo.
                </p>
              )}

              <div className="flex gap-2">
                <button onClick={refresh}
                  className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl py-2.5 text-sm transition">
                  ✓ Ya envié, verificar
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
              <span>👤</span> Tu Cuenta
            </h2>

            {/* Avatar */}
            <div className="flex flex-col items-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-2xl font-bold shadow-sm mb-3">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
            </div>

            <div className="space-y-0 border border-slate-100 rounded-xl overflow-hidden flex-1">
              <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-xs text-slate-500">Plan</span>
                <span className="text-xs font-semibold text-slate-800">{user.plan === "business" ? "🏢 Empresa" : "👤 Personal"}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-xs text-slate-500">WhatsApp</span>
                <span className="text-xs font-semibold text-slate-800">
                  {user.wppPhones.length > 0
                    ? <span className="text-amber-600">✓ {user.wppPhones.length} número{user.wppPhones.length > 1 ? "s" : ""} · ilimitados</span>
                    : <span className="text-amber-600">⚠ No vinculado</span>}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Linha 2: Comandos do Bot */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2 text-base">
          <span>💬</span> Comandos del Bot
        </h2>
        <p className="text-xs text-slate-400 mb-5">Envía estos mensajes al WhatsApp del bot para usar cada función</p>
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
      {/* Integrações */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2 text-base">
          <span>🤝</span> Integraciones
        </h2>
        <p className="text-xs text-slate-400 mb-5">Conecta servicios externos para ampliar las funciones del bot</p>

        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm text-xl shrink-0">
              🗓️
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Google Calendar / Meet</p>
              <p className="text-xs text-slate-400 mt-0.5">Crea reuniones en Google Meet directamente por WhatsApp</p>
              {googleStatus?.connected && googleStatus.email && (
                <p className="text-xs text-amber-600 mt-1 font-medium">✓ {googleStatus.email}</p>
              )}
            </div>
          </div>
          <div className="shrink-0">
            {googleStatus === null ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            ) : googleStatus.connected ? (
              <button
                onClick={disconnectGoogle}
                disabled={googleLoading}
                className="text-xs border border-red-200 text-red-500 hover:bg-red-50 rounded-lg px-3 py-1.5 transition disabled:opacity-50">
                {googleLoading ? "..." : "Desconectar"}
              </button>
            ) : (
              <a
                href="/api/google/connect"
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-1.5 transition">
                Conectar Google
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Alterar senha */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2 text-base">
          <span>🔑</span> Cambiar Contraseña
        </h2>
        <p className="text-xs text-slate-400 mb-5">Mantén tu cuenta segura con una contraseña fuerte</p>
        <form onSubmit={changePassword} className="max-w-sm space-y-3">
          <PasswordField value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required autoComplete="current-password" placeholder="Contraseña actual" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 transition" />
          <PasswordField minLength={10} value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} required autoComplete="new-password" placeholder="Nueva contraseña (mín. 10 caracteres)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 transition" />
          <PasswordField value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required autoComplete="new-password" placeholder="Confirmar nueva contraseña" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 transition" />
          {pwMsg && (
            <p className={`text-xs px-3 py-2 rounded-lg ${pwMsg.ok ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>{pwMsg.text}</p>
          )}
          <button type="submit" disabled={pwLoading} className="bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition disabled:opacity-50">
            {pwLoading ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
