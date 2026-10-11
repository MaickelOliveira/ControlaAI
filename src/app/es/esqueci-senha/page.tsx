"use client";
import ThemeToggle from "@/components/ThemeToggle";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PasswordField from "@/components/PasswordField";

export default function ForgotPasswordPageEs() {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState(""); const [requestId, setRequestId] = useState("");
  const [code, setCode] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("rid") || "";
    if (!/^[0-9a-f-]{36}$/i.test(rid)) return;
    const timer = window.setTimeout(() => {
      setRequestId(rid);
      setEmail(params.get("email") || "");
      setMessage("Ingresa el código que recibiste por correo y crea tu contraseña.");
      setStep("code");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) { setError(response.status === 429 ? "Demasiados intentos. Espera unos minutos." : "No fue posible enviar el código."); return; }
      setRequestId(data.requestId); setMessage("Si el correo está registrado, enviaremos un código de recuperación."); setStep("code");
    } catch { setError("Error de conexión. Intenta de nuevo."); } finally { setLoading(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, code, newPassword: password }) });
      if (!response.ok) { setError(response.status === 429 ? "Demasiados intentos. Solicita un nuevo código." : "El código no es válido o ya venció."); return; }
      setStep("done");
    } catch { setError("Error de conexión. Intenta de nuevo."); } finally { setLoading(false); }
  }

  const field = "w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400";
  return <main className="zelo-app flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-slate-950 to-slate-900 p-4">
      <div className="fixed right-4 top-4 z-20"><ThemeToggle es/></div><section className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl">
    <div className="mb-7 text-center"><Image src="/brand/zelo-wordmark.png" alt="Zelo" width={160} height={73} className="mx-auto mb-3 h-auto w-40" priority /><h1 className="text-xl font-bold text-ink">Recuperar contraseña</h1><p className="mt-1 text-sm text-muted">Recibe un código seguro en tu correo.</p></div>
    {step === "email" && <form onSubmit={requestCode} className="space-y-4"><div><label className="mb-1 block text-sm font-medium text-ink">Correo de tu cuenta</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="tu@correo.com" className={field} /></div>{error && <p className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red-ink">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Enviando..." : "Enviar código"}</button></form>}
    {step === "code" && <form onSubmit={changePassword} className="space-y-4"><p className="rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber-ink">{message}</p><div><label className="mb-1 block text-sm font-medium text-ink">Código de 6 números</label><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required className={`${field} text-center text-xl font-bold tracking-[0.35em]`} /></div><div><label className="mb-1 block text-sm font-medium text-ink">Nueva contraseña</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required className={field} /><p className="mt-1 text-xs text-subtle">Usa al menos 10 caracteres.</p></div><div><label className="mb-1 block text-sm font-medium text-ink">Confirmar nueva contraseña</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required className={field} /></div>{error && <p className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red-ink">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Cambiando..." : "Crear nueva contraseña"}</button><button type="button" onClick={() => { setStep("email"); setError(""); }} className="w-full text-sm font-semibold text-amber-ink hover:underline">Enviar otro código</button></form>}
    {step === "done" && <div className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-soft text-2xl text-emerald-ink">✓</div><h2 className="text-lg font-bold">Contraseña cambiada</h2><p className="mt-2 text-sm text-muted">Ahora ya puedes ingresar con tu nueva contraseña.</p><Link href="/es/login" className="mt-6 block rounded-xl bg-amber-600 py-3 font-semibold text-white">Ir al inicio de sesión</Link></div>}
    {step !== "done" && <p className="mt-6 text-center text-sm"><Link href="/es/login" className="font-semibold text-amber-ink hover:underline">← Volver al inicio de sesión</Link></p>}
  </section></main>;
}
