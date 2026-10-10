"use client";
import { useState } from "react";

export default function Login() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return <section className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-widest text-green-700">Zelo · ambiente separado</p>
    <h1 className="mt-3 text-2xl font-bold">Teste da Polp</h1>
    <p className="my-4 text-sm text-slate-600">Acesso privado ao sandbox. Somente dados fictícios; nenhuma conexão com o banco de dados dos clientes.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setPending(true); setError("");
      const code = new FormData(event.currentTarget).get("code");
      try {
        const response = await fetch("/api/session", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({code})});
        if (response.ok) window.location.reload();
        else setError(response.status === 429 ? "Aguarde um minuto antes de tentar novamente." : "Código inválido ou ambiente ainda não configurado.");
      } catch { setError("Não foi possível conectar. Tente novamente."); }
      finally { setPending(false); }
    }}>
      <label htmlFor="code" className="text-sm font-semibold">Código de acesso do ambiente de teste</label>
      <input id="code" name="code" type="password" required autoComplete="off" maxLength={128} className="my-3 w-full rounded-lg border border-slate-300 p-3" />
      <button disabled={pending} className="w-full rounded-lg bg-green-700 p-3 font-semibold text-white disabled:opacity-50">{pending ? "Entrando..." : "Entrar no teste"}</button>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </form>
  </section>;
}
