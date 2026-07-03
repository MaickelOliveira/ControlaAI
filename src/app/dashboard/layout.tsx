"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

const BASE_NAV = [
  { href: "/dashboard", label: "Início", icon: "⊞" },
  { href: "/dashboard/financas", label: "Finanças", icon: "◈" },
  { href: "/dashboard/tarefas", label: "Tarefas", icon: "☑" },
  { href: "/dashboard/metas", label: "Metas", icon: "◎" },
  { href: "/dashboard/veiculos", label: "Veículos", icon: "⬡" },
];
const BUSINESS_NAV = [
  { href: "/dashboard/funcionarios", label: "Funcionários", icon: "👥" },
];
const PERSONAL_NAV = [
  { href: "/dashboard/supermercado", label: "Supermercado", icon: "🛒" },
];
const CONFIG_NAV = [
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
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm">
        {/* Logo */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
              <span className="text-white text-base font-bold">C</span>
            </div>
            <div>
              <p className="text-slate-900 font-bold text-sm leading-none">ControlaAI</p>
              <p className="text-slate-400 text-xs mt-0.5">Gestão inteligente</p>
            </div>
          </div>
        </div>

        {/* User info + Mode toggle */}
        {user && (
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-800 text-xs font-semibold truncate">{user.name}</p>
                <p className="text-slate-400 text-[10px]">{user.status === "trial" ? `Trial · ${Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000))} dias` : "Plano Ativo"}</p>
              </div>
            </div>
            {/* Mode toggle */}
            <button onClick={toggleMode} disabled={modeChanging}
              className={clsx(
                "w-full rounded-xl p-2.5 flex items-center gap-2.5 transition border text-left",
                isPersonal
                  ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                  : "bg-blue-50 border-blue-200 hover:bg-blue-100"
              )}>
              <span className="text-base">{isPersonal ? "👤" : "🏢"}</span>
              <div className="flex-1 min-w-0">
                <p className={clsx("text-xs font-semibold", isPersonal ? "text-emerald-700" : "text-blue-700")}>
                  {isPersonal ? "Modo Pessoal" : "Modo Empresa"}
                </p>
                <p className="text-[10px] text-slate-400">{modeChanging ? "Alterando..." : "Clique para trocar"}</p>
              </div>
              <span className="text-slate-400 text-xs">⇄</span>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {[
            ...BASE_NAV,
            ...(user?.activeMode === "business" ? BUSINESS_NAV : PERSONAL_NAV),
            ...CONFIG_NAV,
          ].map(item => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition",
                  isActive
                    ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                )}>
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-slate-100">
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition">
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
