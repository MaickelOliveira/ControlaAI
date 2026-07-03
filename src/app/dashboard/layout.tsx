"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

const navItems = [
  { href: "/dashboard", label: "Início", icon: "⊞" },
  { href: "/dashboard/financas", label: "Finanças", icon: "◈" },
  { href: "/dashboard/tarefas", label: "Tarefas", icon: "☑" },
  { href: "/dashboard/metas", label: "Metas", icon: "◎" },
  { href: "/dashboard/veiculos", label: "Veículos", icon: "⬡" },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: "⚙" },
];

type User = { name: string; plan: string; status: string; activeMode: string; trialEndsAt: string };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [modeChanging, setModeChanging] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => d.user && setUser(d.user)).catch(() => {});
  }, []);

  async function toggleMode() {
    if (!user || modeChanging) return;
    setModeChanging(true);
    const newMode = user.activeMode === "personal" ? "business" : "personal";
    await fetch("/api/admin/user-mode", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: newMode }) });
    setUser(u => u ? { ...u, activeMode: newMode } : u);
    setModeChanging(false);
    window.location.reload();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const isPersonal = user?.activeMode !== "business";

  return (
    <div className="flex h-screen bg-[#F1F5F9]">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 flex flex-col shrink-0 shadow-xl">
        {/* Logo */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
              <span className="text-white text-base font-bold">C</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">ControlaAI</p>
              <p className="text-slate-400 text-xs mt-0.5">Gestão inteligente</p>
            </div>
          </div>
        </div>

        {/* User info + Mode toggle */}
        {user && (
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-sm font-bold text-slate-200">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user.name}</p>
                <p className="text-slate-500 text-[10px]">{user.status === "trial" ? `Trial · ${Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000))} dias` : "Plano Ativo"}</p>
              </div>
            </div>
            {/* Mode toggle */}
            <button onClick={toggleMode} disabled={modeChanging}
              className={clsx(
                "w-full rounded-xl p-2.5 flex items-center gap-2.5 transition border text-left",
                isPersonal
                  ? "bg-emerald-950/40 border-emerald-800/60 hover:bg-emerald-950/60"
                  : "bg-blue-950/40 border-blue-800/60 hover:bg-blue-950/60"
              )}>
              <span className="text-base">{isPersonal ? "👤" : "🏢"}</span>
              <div className="flex-1 min-w-0">
                <p className={clsx("text-xs font-semibold", isPersonal ? "text-emerald-400" : "text-blue-400")}>
                  {isPersonal ? "Modo Pessoal" : "Modo Empresa"}
                </p>
                <p className="text-[10px] text-slate-500">{modeChanging ? "Alterando..." : "Clique para trocar"}</p>
              </div>
              <span className="text-slate-600 text-xs">⇄</span>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition",
                  isActive
                    ? "bg-white/10 text-white font-semibold"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}>
                <span className="text-base w-5 text-center opacity-80">{item.icon}</span>
                {item.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-slate-800">
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-white hover:bg-white/5 transition">
            <span className="w-5 text-center">←</span>
            Sair
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <main className="p-6 max-w-6xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
