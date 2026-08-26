"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PasswordField from "@/components/PasswordField";

export default function FirstAccessPageEs() {
  const [setupId, setSetupId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [step, setStep] = useState<"confirm" | "password" | "done">("confirm");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    const timer = window.setTimeout(() => setSetupId(token), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function sendCode() {
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/first-access-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupId }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "No fue posible validar el link"); return; }
      setRequestId(data.requestId); setMaskedEmail(data.maskedEmail); setStep("password");
    } catch { setError("Error de conexión. Intenta de nuevo."); } finally { setLoading(false); }
  }

  async function createPassword(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/complete-first-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupId, requestId, code, newPassword: password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "No fue posible crear tu contraseña"); return; }
      setStep("done");
    } catch { setError("Error de conexión. Intenta de nuevo."); } finally { setLoading(false); }
  }

  const field = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400";
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-slate-950 to-slate-900 p-4"><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
    <div className="mb-7 text-center"><Image src="/brand/zelo-wordmark.png" alt="Zelo" width={160} height={73} className="mx-auto mb-3 h-auto w-40" priority /><h1 className="text-xl font-bold text-slate-950">Crea tu contraseña</h1><p className="mt-1 text-sm text-slate-500">Primer acceso seguro a tu cuenta.</p></div>
    {step === "confirm" && <div className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Tu acceso fue habilitado.</strong><br />Para confirmar que la cuenta es tuya, te enviaremos un código por separado al correo usado en la compra.</div>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button type="button" onClick={sendCode} disabled={loading || !setupId} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Enviando..." : "Enviar código de confirmación"}</button></div>}
    {step === "password" && <form onSubmit={createPassword} className="space-y-4"><p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Código enviado a <strong>{maskedEmail}</strong>. No compartas este código.</p><div><label className="mb-1 block text-sm font-medium text-slate-700">Código de 6 números</label><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required className={`${field} text-center text-xl font-bold tracking-[0.35em]`} /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Elige tu contraseña</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required className={field} /><p className="mt-1 text-xs text-slate-400">Usa al menos 10 caracteres.</p></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Confirmar contraseña</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required className={field} /></div>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Creando..." : "Crear mi contraseña"}</button></form>}
    {step === "done" && <div className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div><h2 className="text-lg font-bold">Contraseña creada con éxito</h2><p className="mt-2 text-sm text-slate-500">Tu cuenta está lista. Ingresa con el correo de la compra y tu nueva contraseña.</p><Link href="/es/login" className="mt-6 block rounded-xl bg-amber-600 py-3 font-semibold text-white">Entrar a Zelo</Link></div>}
    {step !== "done" && <p className="mt-6 text-center text-xs text-slate-400">Este link queda disponible hasta que completes la creación de la contraseña, después es invalidado.</p>}
  </section></main>;
}
