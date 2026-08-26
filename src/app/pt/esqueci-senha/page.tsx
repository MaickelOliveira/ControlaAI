"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PasswordField from "@/components/PasswordField";

export default function ForgotPasswordPagePt() {
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
      setMessage("Escreve o código recebido por e-mail e cria a tua senha.");
      setStep("code");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Não foi possível enviar o código"); return; }
      setRequestId(data.requestId); setMessage(data.message); setStep("code");
    } catch { setError("Erro de ligação. Tenta novamente."); } finally { setLoading(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("As senhas não são iguais"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, code, newPassword: password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Não foi possível alterar a senha"); return; }
      setStep("done");
    } catch { setError("Erro de ligação. Tenta novamente."); } finally { setLoading(false); }
  }

  const field = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400";
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-slate-950 to-slate-900 p-4"><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
    <div className="mb-7 text-center"><Image src="/brand/zelo-wordmark.png" alt="Zelo" width={160} height={73} className="mx-auto mb-3 h-auto w-40" priority /><h1 className="text-xl font-bold text-slate-950">Recuperar senha</h1><p className="mt-1 text-sm text-slate-500">Recebe um código seguro no teu e-mail.</p></div>
    {step === "email" && <form onSubmit={requestCode} className="space-y-4"><div><label className="mb-1 block text-sm font-medium text-slate-700">E-mail da tua conta</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="teu@email.com" className={field} /></div>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "A enviar..." : "Enviar código"}</button></form>}
    {step === "code" && <form onSubmit={changePassword} className="space-y-4"><p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p><div><label className="mb-1 block text-sm font-medium text-slate-700">Código de 6 números</label><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required className={`${field} text-center text-xl font-bold tracking-[0.35em]`} /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Nova senha</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required className={field} /><p className="mt-1 text-xs text-slate-400">Usa pelo menos 10 caracteres.</p></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Confirmar nova senha</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required className={field} /></div>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "A alterar..." : "Criar nova senha"}</button><button type="button" onClick={() => { setStep("email"); setError(""); }} className="w-full text-sm font-semibold text-amber-700 hover:underline">Enviar outro código</button></form>}
    {step === "done" && <div className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div><h2 className="text-lg font-bold">Senha alterada</h2><p className="mt-2 text-sm text-slate-500">Já podes entrar com a nova senha.</p><Link href="/pt/login" className="mt-6 block rounded-xl bg-amber-600 py-3 font-semibold text-white">Ir para o login</Link></div>}
    {step !== "done" && <p className="mt-6 text-center text-sm"><Link href="/pt/login" className="font-semibold text-amber-700 hover:underline">← Voltar para o login</Link></p>}
  </section></main>;
}
