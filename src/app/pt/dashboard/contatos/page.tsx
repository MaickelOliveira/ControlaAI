"use client";
import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type Contact = { id: string; name: string; phone?: string; email?: string; relation?: string; notes?: string; status: string };

export default function ContatosPagePt() {
  const [mode, setMode] = useState<string>("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", relation: "", notes: "" });
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  function load() {
    fetch("/api/admin/contacts").then(r => r.json()).then(d => {
      setContacts(d.contacts || []);
      setLoading(false);
    });
  }

  useEffect(() => {
    fetchDashboardMe().then(d => { setMode(d.user?.activeMode || "personal"); });
    load();
  }, []);

  const visibleContacts = contacts.filter(c => filter === "all" || c.status === filter);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await fetch("/api/admin/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...form }) });
    } else {
      await fetch("/api/admin/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setShowForm(false); setEditing(null); setForm({ name: "", phone: "", email: "", relation: "", notes: "" }); load();
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "", relation: c.relation || "", notes: c.notes || "" });
    setShowForm(true);
  }

  async function toggleStatus(c: Contact) {
    await fetch("/api/admin/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, status: c.status === "active" ? "inactive" : "active" }) });
    load();
  }

  if (mode === "business") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">👤</p>
          <p className="font-semibold text-ink">Disponível no Modo Pessoal</p>
          <p className="text-sm text-subtle mt-1">Muda para o modo pessoal na barra lateral para gerir contactos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="z-page">
      <div className="z-page-heading flex items-center justify-between">
        <div>
          <PageTitle icon="users">Contactos</PageTitle>
          <p className="text-subtle text-sm mt-0.5">👤 Pessoal</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: "", phone: "", email: "", relation: "", notes: "" }); setShowForm(true); }}
          className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition">
          + Contacto
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-5 text-ink shadow-sm">
          <p className="text-xs text-blue-ink uppercase tracking-wide">Ativos</p>
          <p className="text-2xl font-bold mt-1">{contacts.filter(c => c.status === "active").length}</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-5 text-ink shadow-sm">
          <p className="text-xs text-subtle uppercase tracking-wide">Inativos</p>
          <p className="text-2xl font-bold mt-1">{contacts.filter(c => c.status === "inactive").length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(["active","inactive","all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx("px-3 py-1.5 rounded-xl text-xs font-semibold transition border",
              filter === f ? "bg-slate-800 text-white border-slate-800" : "bg-surface border-line text-muted hover:bg-surface-muted")}>
            {f === "active" ? "Ativos" : f === "inactive" ? "Inativos" : "Todos"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? <p className="text-subtle text-sm">A carregar...</p> :
        visibleContacts.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">📇</p>
            <p className="font-semibold text-ink">Nenhum contacto guardado</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-surface-muted border-b border-line">
                <tr>
                  {["Contacto", "Vínculo", "Telefone/E-mail", "Estado", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleContacts.map(c => (
                  <tr key={c.id} className="hover:bg-surface-muted transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-soft flex items-center justify-center text-sm font-bold text-blue-ink shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-medium text-ink text-sm">{c.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted">{c.relation || "—"}</td>
                    <td className="px-5 py-4 text-xs text-subtle">{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-5 py-4">
                      <span className={clsx("text-xs px-2.5 py-1 rounded-full font-medium border",
                        c.status === "active" ? "bg-amber-soft text-amber-ink border-line" : "bg-surface-muted text-muted border-line")}>
                        {c.status === "active" ? "● Ativo" : "○ Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="text-xs text-blue-ink hover:underline">Editar</button>
                        <button onClick={() => toggleStatus(c)} className="text-xs text-subtle hover:underline">
                          {c.status === "active" ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-ink mb-4">{editing ? "✏️ Editar Contacto" : "📇 Novo Contacto"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                placeholder="Nome completo" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={form.relation} onChange={e => setForm(f => ({ ...f, relation: e.target.value }))}
                placeholder="Vínculo (ex: esposa, médico, amigo)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Telefone (opcional)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email (opcional)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notas" rows={2} className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition">
                  {editing ? "Guardar" : "Registar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
