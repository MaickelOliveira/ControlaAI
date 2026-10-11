"use client";
import ThemeToggle from "@/components/ThemeToggle";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PasswordField from "@/components/PasswordField";

export default function FirstAccessPage() {
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
      if (!response.ok) { setError(data.error || "Não foi possível validar o link"); return; }
      setRequestId(data.requestId); setMaskedEmail(data.maskedEmail); setStep("password");
    } catch { setError("Erro de conexão. Tente novamente."); } finally { setLoading(false); }
  }

  async function createPassword(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("As senhas não são iguais"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/complete-first-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupId, requestId, code, newPassword: password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Não foi possível criar sua senha"); return; }
      setStep("done");
    } catch { setError("Erro de conexão. Tente novamente."); } finally { setLoading(false); }
  }

  const field = "w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400";
  return <main className="zelo-app flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-slate-950 to-slate-900 p-4">
      <div className="fixed right-4 top-4 z-20"><ThemeToggle/></div><section className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl">
    <div className="mb-7 text-center"><Image src="/brand/zelo-wordmark.png" alt="Zelo" width={160} height={73} className="mx-auto mb-3 h-auto w-40" priority /><h1 className="text-xl font-bold text-ink">Crie sua senha</h1><p className="mt-1 text-sm text-muted">Primeiro acesso seguro à sua conta.</p></div>
    {step === "confirm" && <div className="space-y-4"><div className="rounded-xl border border-line bg-amber-soft p-4 text-sm leading-6 text-amber-ink"><strong>Seu acesso foi liberado.</strong><br />Para confirmar que a conta é sua, enviaremos um código separado ao e-mail usado na compra.</div>{error && <p className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red-ink">{error}</p>}<button type="button" onClick={sendCode} disabled={loading || !setupId} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Enviando..." : "Enviar código de confirmação"}</button></div>}
    {step === "password" && <form onSubmit={createPassword} className="space-y-4"><p className="rounded-xl bg-emerald-soft px-4 py-3 text-sm text-emerald-ink">Código enviado para <strong>{maskedEmail}</strong>. Não compartilhe esse código.</p><div><label className="mb-1 block text-sm font-medium text-ink">Código de 6 números</label><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required className={`${field} text-center text-xl font-bold tracking-[0.35em]`} /></div><div><label className="mb-1 block text-sm font-medium text-ink">Escolha sua senha</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required className={field} /><p className="mt-1 text-xs text-subtle">Use pelo menos 10 caracteres.</p></div><div><label className="mb-1 block text-sm font-medium text-ink">Confirmar senha</label><PasswordField minLength={10} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required className={field} /></div>{error && <p className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red-ink">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Criando..." : "Criar minha senha"}</button></form>}
    {step === "done" && <div className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-soft text-2xl text-emerald-ink">✓</div><h2 className="text-lg font-bold">Senha criada com sucesso</h2><p className="mt-2 text-sm text-muted">Sua conta está pronta. Entre usando o e-mail da compra e sua nova senha.</p><Link href="/login" className="mt-6 block rounded-xl bg-amber-600 py-3 font-semibold text-white">Entrar no Zelo</Link></div>}
    {step !== "done" && <p className="mt-6 text-center text-xs text-subtle">Este link fica disponível até você concluir a criação da senha e depois é invalidado.</p>}
  </section></main>;
}
