"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PasswordField from "@/components/PasswordField";

const benefits = [
  ["Conversa, no llenes planillas", "Registra gastos, tareas y eventos directo por WhatsApp."],
  ["Personal y empresarial en un solo lugar", "Separa tu rutina y tu empresa sin perder la visión general."],
  ["Tus datos siempre organizados", "Panel claro, historial completo y acceso protegido."],
];

export default function LoginPageEs() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "No fue posible iniciar sesión"); return; }
      router.push("/dashboard");
    } catch { setError("No fue posible conectar. Intenta de nuevo."); }
    finally { setLoading(false); }
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b16] text-white">
      <div className="pointer-events-none absolute -left-40 top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-amber-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-64 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-orange-600/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-14 px-5 py-8 lg:grid-cols-[1.05fr_.95fr] lg:px-12">
        <section className="hidden lg:block">
          <Link href="/es" aria-label="Volver a la página de inicio" className="inline-flex rounded-2xl bg-white/95 px-5 py-3 shadow-2xl shadow-black/20">
            <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={160} height={73} className="h-auto w-36" priority />
          </Link>
          <p className="mt-10 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            Gestión inteligente por WhatsApp
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-black leading-[1.06] tracking-[-0.045em] text-white">
            Menos confusión.<br /><span className="text-amber-400">Más control.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">Todo lo que importa en tu rutina personal y empresarial, organizado por Zelo.</p>
          <div className="mt-10 space-y-5">
            {benefits.map(([title, description], index) => (
              <div key={title} className="flex max-w-xl gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-sm font-black text-amber-300">0{index + 1}</span>
                <div><h2 className="font-bold text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{description}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden"><Link href="/es" className="rounded-2xl bg-white px-5 py-3"><Image src="/brand/zelo-wordmark.png" alt="Zelo" width={150} height={68} className="h-auto w-32" priority /></Link></div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white p-6 text-slate-950 shadow-2xl shadow-black/40 sm:p-9">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Área del cliente</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">Bienvenido de nuevo</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Ingresa para acceder a tu panel y seguir organizando tu rutina.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Correo electrónico</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className={inputClass} placeholder="tu@correo.com" /></div>
              <div>
                <div className="mb-2 flex items-center justify-between"><label htmlFor="password" className="text-sm font-semibold text-slate-700">Contraseña</label><Link href="/es/esqueci-senha" className="text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline">Olvidé mi contraseña</Link></div>
                <PasswordField id="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" className={inputClass} placeholder="Ingresa tu contraseña" />
              </div>
              {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-slate-950 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:bg-amber-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-wait disabled:opacity-60">{loading ? "Ingresando..." : "Entrar a Zelo"}</button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6 text-center"><p className="text-xs leading-5 text-slate-500">¿Todavía no tienes acceso? Elige un plan en la página oficial. El registro se libera automáticamente después del pago.</p><Link href="/es/#planos" className="mt-3 inline-flex text-sm font-bold text-amber-700 hover:underline">Ver planes de Zelo →</Link></div>
          </div>
          <p className="mt-5 text-center text-xs text-slate-500">Acceso protegido · Tus datos tratados con seguridad</p>
          <p className="mt-3 text-center text-xs text-slate-400">
            <Link href="/login" className="hover:text-slate-600 hover:underline">Português (Brasil)</Link>
            {" · "}
            <Link href="/pt/login" className="hover:text-slate-600 hover:underline">Português (Portugal)</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
