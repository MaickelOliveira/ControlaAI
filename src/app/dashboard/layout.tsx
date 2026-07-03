"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

const navItems = [
  { href: "/dashboard", label: "Visão Geral", icon: "📊" },
  { href: "/dashboard/financas", label: "Finanças", icon: "💰" },
  { href: "/dashboard/tarefas", label: "Tarefas", icon: "📋" },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: "⚙️" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; plan: string; activeMode: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => d.user && setUser(d.user))
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={clsx(
        "fixed inset-y-0 left-0 z-50 w-64 bg-emerald-900 text-white flex flex-col transition-transform duration-200",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="p-6 border-b border-emerald-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h1 className="font-bold text-lg leading-none">ControlaAI</h1>
              <p className="text-emerald-300 text-xs mt-0.5">Gestão via WhatsApp</p>
            </div>
          </div>
          {user && (
            <div className="mt-4 bg-emerald-800 rounded-xl p-3">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-emerald-300 text-xs">
                {user.plan === "business" ? "🏢 Empresarial" : "👤 Pessoal"}
                {" · "}
                {user.activeMode === "business" ? "Modo Empresa" : "Modo Pessoal"}
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition",
                pathname === item.href
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-100 hover:bg-emerald-800"
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-emerald-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-emerald-200 hover:bg-emerald-800 transition"
          >
            🚪 Sair
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
            ☰
          </button>
          <span className="font-bold text-emerald-800">🤖 ControlaAI</span>
          <div />
        </header>

        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
