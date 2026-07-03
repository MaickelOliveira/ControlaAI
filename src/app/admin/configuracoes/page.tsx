"use client";
import { useState } from "react";

export default function AdminConfigPage() {
  const [form, setForm] = useState({ email: "", currentPassword: "", newPassword: "", confirmPassword: "" });
  const [msg, setMsg] = useState("");

  async function saveAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) { setMsg("Senhas não conferem"); return; }
    // TODO: endpoint para alterar credenciais admin
    setMsg("Configurações salvas! (em breve)");
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Configurações</h1>
        <p className="text-slate-400 text-sm">Credenciais de acesso admin</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-4">🔐 Alterar Senha Admin</h2>
        <form onSubmit={saveAdmin} className="space-y-3">
          {[
            { key: "email", label: "Email", type: "email", placeholder: "admin@controlaai.app" },
            { key: "currentPassword", label: "Senha atual", type: "password", placeholder: "••••••" },
            { key: "newPassword", label: "Nova senha", type: "password", placeholder: "••••••" },
            { key: "confirmPassword", label: "Confirmar nova senha", type: "password", placeholder: "••••••" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
              <input type={f.type} value={(form as Record<string,string>)[f.key]}
                onChange={e => setForm(fr => ({ ...fr, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition" />
            </div>
          ))}
          {msg && <p className="text-emerald-400 text-sm">{msg}</p>}
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl py-2.5 text-sm transition">
            Salvar
          </button>
        </form>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-2">ℹ️ Acesso Padrão</h2>
        <p className="text-slate-400 text-sm">Enquanto não alterar, use:</p>
        <div className="mt-2 bg-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300">
          <p>Email: admin@controlaai.app</p>
          <p>Senha: admin123</p>
        </div>
        <p className="text-amber-400 text-xs mt-2">⚠️ Altere antes de ir para produção!</p>
      </div>
    </div>
  );
}
