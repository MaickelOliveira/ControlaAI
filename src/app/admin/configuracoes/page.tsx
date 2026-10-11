"use client";
import PageTitle from "@/components/PageTitle";
import { useState } from "react";

export default function AdminConfigPage() {
  const [form, setForm] = useState({ email: "", currentPassword: "", newPassword: "", confirmPassword: "" });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) { setMsg("Senhas não conferem"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Erro ao salvar"); return; }
      setMsg("Senha alterada com sucesso!");
      setForm({ email: "", currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setMsg("Erro de conexão");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <PageTitle icon="settings">Configurações</PageTitle>
        <p className="text-subtle text-sm">Credenciais de acesso admin</p>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold text-ink mb-4">🔐 Alterar Senha Admin</h2>
        <form onSubmit={saveAdmin} className="space-y-3">
          {[
            { key: "email", label: "Email", type: "email", placeholder: "admin@controlaai.app" },
            { key: "currentPassword", label: "Senha atual", type: "password", placeholder: "••••••" },
            { key: "newPassword", label: "Nova senha", type: "password", placeholder: "••••••" },
            { key: "confirmPassword", label: "Confirmar nova senha", type: "password", placeholder: "••••••" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-subtle mb-1">{f.label}</label>
              <input type={f.type} value={(form as Record<string,string>)[f.key]}
                onChange={e => setForm(fr => ({ ...fr, [f.key]: e.target.value }))}
                required minLength={f.key === "newPassword" || f.key === "confirmPassword" ? 12 : undefined}
                placeholder={f.placeholder}
                className="w-full bg-surface-muted border border-line text-ink rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 transition" />
            </div>
          ))}
          {msg && <p className="text-amber-ink text-sm">{msg}</p>}
          <button type="submit" disabled={saving} className="w-full bg-amber-600 hover:bg-amber-500 text-ink font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
}
