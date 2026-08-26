"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PasswordField from "@/components/PasswordField";

const benefits = [
  ["Fala comigo, não preenchas folhas de cálculo", "Regista despesas, tarefas e compromissos diretamente pelo WhatsApp."],
  ["Pessoal e empresarial no mesmo lugar", "Separa a tua rotina e a tua empresa sem perderes a visão do todo."],
  ["Os teus dados sempre organizados", "Painel claro, histórico completo e acesso protegido."],
];

export default function LoginPagePt() {
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
      if (!response.ok) { setError(data.error || "Não foi possível entrar"); return; }
      // Marca a conta como "pt-PT" ao entrar por esta versão do login —
      // assim o bot e os e-mails passam a falar em português europeu sem
      // precisar de um ecrã extra. Best-effort: não bloqueia o login se falhar.
      await fetch("/api/account/locale", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: "pt-PT" }) }).catch(() => {});
      router.push("/dashboard");
    } catch { setError("Não foi possível ligar. Tenta novamente."); }
    finally { setLoading(false); }
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b16] text-white">
      <div className="pointer-events-none absolute -left-40 top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-amber-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-64 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-orange-600/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-14 px-5 py-8 lg:grid-cols-[1.05fr_.95fr] lg:px-12">
        <section className="hidden lg:block">
          <Link href="/pt" aria-label="Voltar à página inicial" className="inline-flex rounded-2xl bg-white/95 px-5 py-3 shadow-2xl shadow-black/20">
            <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={160} height={73} className="h-auto w-36" priority />
          </Link>
          <p className="mt-10 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            Gestão inteligente pelo WhatsApp
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-black leading-[1.06] tracking-[-0.045em] text-white">
            Menos confusão.<br /><span className="text-amber-400">Mais controlo.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">Tudo o que importa na tua rotina pessoal e empresarial, organizado pelo Zelo.</p>
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
          <div className="mb-6 flex justify-center lg:hidden"><Link href="/pt" className="rounded-2xl bg-white px-5 py-3"><Image src="/brand/zelo-wordmark.png" alt="Zelo" width={150} height={68} className="h-auto w-32" priority /></Link></div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white p-6 text-slate-950 shadow-2xl shadow-black/40 sm:p-9">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Área do cliente</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">Bem-vindo de volta</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Entra para aceder ao teu painel e continuar a organizar a tua rotina.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">E-mail</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className={inputClass} placeholder="teu@email.com" /></div>
              <div>
                <div className="mb-2 flex items-center justify-between"><label htmlFor="password" className="text-sm font-semibold text-slate-700">Senha</label><Link href="/pt/esqueci-senha" className="text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline">Esqueci-me da senha</Link></div>
                <PasswordField id="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" className={inputClass} placeholder="Escreve a tua senha" />
              </div>
              {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-slate-950 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:bg-amber-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-wait disabled:opacity-60">{loading ? "A entrar..." : "Entrar no Zelo"}</button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6 text-center"><p className="text-xs leading-5 text-slate-500">Ainda não tens acesso? Escolhe um plano na página oficial. O registo é liberado automaticamente após o pagamento.</p><Link href="/pt/#planos" className="mt-3 inline-flex text-sm font-bold text-amber-700 hover:underline">Ver planos do Zelo →</Link></div>
          </div>
          <p className="mt-5 text-center text-xs text-slate-500">Acesso protegido · Os teus dados tratados com segurança</p>
          <p className="mt-3 text-center text-xs text-slate-400">
            <Link href="/login" className="hover:text-slate-600 hover:underline">Português (Brasil)</Link>
            {" · "}
            <Link href="/es/login" className="hover:text-slate-600 hover:underline">Español</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
