"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@controlaai.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Credenciais inválidas"); return; }
      router.push("/admin");
    } catch { setError("Erro de conexão"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Image src="/brand/zelo-icon.png" alt="Zelo" width={32} height={32} className="w-8 h-8" priority />
          </div>
          <h1 className="text-xl font-bold text-white">Zelo Admin</h1>
          <p className="text-slate-400 text-sm mt-1">Painel de Administração</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
            </div>
            {error && <p className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl py-2.5 transition disabled:opacity-50 text-sm">
              {loading ? "Entrando..." : "Acessar painel"}
            </button>
          </form>
          <p className="text-xs text-slate-600 text-center mt-4">
            Acesso padrão: admin@controlaai.app / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
