"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", plan: "personal", company: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao cadastrar"); return; }
      router.push("/dashboard");
    } catch { setError("Erro de conexão"); }
    finally { setLoading(false); }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 to-emerald-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🤖</div>
          <h1 className="text-2xl font-bold text-gray-900">Criar conta</h1>
          <p className="text-gray-500 text-sm">14 dias grátis, sem cartão</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: "Nome completo", key: "name", type: "text", placeholder: "João Silva" },
            { label: "Email", key: "email", type: "email", placeholder: "joao@email.com" },
            { label: "Senha", key: "password", type: "password", placeholder: "Mínimo 6 caracteres" },
            { label: "WhatsApp (com DDD)", key: "phone", type: "tel", placeholder: "44999999999" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input
                type={f.type} value={(form as Record<string,string>)[f.key]}
                onChange={set(f.key)} required
                placeholder={f.placeholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de uso</label>
            <select value={form.plan} onChange={set("plan")}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="personal">👤 Pessoal — finanças e tarefas individuais</option>
              <option value="business">🏢 Empresarial — gestão da empresa e equipe</option>
            </select>
          </div>

          {form.plan === "business" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
              <input
                type="text" value={form.company} onChange={set("company")}
                placeholder="Minha Empresa Ltda"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          )}

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-50">
            {loading ? "Criando conta..." : "Criar conta grátis 🚀"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Já tem conta? <Link href="/login" className="text-emerald-600 font-semibold hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
