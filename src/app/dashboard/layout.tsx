"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

const Icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  car: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3v-4.5l2.5-5.5h11L19 12.5V17h-2M5 17a2 2 0 104 0m6 0a2 2 0 104 0M5 17h8" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  cart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h12M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zm7 0a.5.5 0 11-1 0 .5.5 0 011 0z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  person: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  switch: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-3.5 h-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

const BASE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Icons.home },
  { href: "/dashboard/financas", label: "Finanças", icon: Icons.chart },
  { href: "/dashboard/tarefas", label: "Tarefas", icon: Icons.tasks },
  { href: "/dashboard/metas", label: "Metas", icon: Icons.target },
  { href: "/dashboard/veiculos", label: "Veículos", icon: Icons.car },
  { href: "/dashboard/lembretes", label: "Lembretes", icon: Icons.bell },
];
const BUSINESS_NAV = [
  { href: "/dashboard/funcionarios", label: "Funcionários", icon: Icons.users },
];
const PERSONAL_NAV = [
  { href: "/dashboard/supermercado", label: "Supermercado", icon: Icons.cart },
];
const CONFIG_NAV = [
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Icons.settings },
];

type User = { name: string; plan: string; status: string; activeMode: string; trialEndsAt: string };

function SidebarContent({
  user,
  pathname,
  modeChanging,
  isPersonal,
  toggleMode,
  logout,
  onNavClick,
}: {
  user: User | null;
  pathname: string;
  modeChanging: boolean;
  isPersonal: boolean;
  toggleMode: () => void;
  logout: () => void;
  onNavClick: () => void;
}) {
  const navItems = [
    ...BASE_NAV,
    ...(user?.activeMode === "business" ? BUSINESS_NAV : PERSONAL_NAV),
    ...CONFIG_NAV,
  ];

  return (
    <>
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
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 text-xs font-semibold truncate">{user.name}</p>
              <p className="text-slate-400 text-[10px]">
                {user.status === "trial"
                  ? `Trial · ${Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000))} dias`
                  : "Plano Ativo"}
              </p>
            </div>
          </div>
          <button onClick={toggleMode} disabled={modeChanging}
            className="w-full rounded-xl p-2.5 flex items-center gap-2.5 transition border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left">
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm shrink-0">
              {isPersonal ? Icons.person : Icons.building}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700">
                {isPersonal ? "Modo Pessoal" : "Modo Empresa"}
              </p>
              <p className="text-[10px] text-slate-400">{modeChanging ? "Alterando..." : "Clique para trocar"}</p>
            </div>
            <div className="text-slate-400 shrink-0">{Icons.switch}</div>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={onNavClick}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition",
                isActive
                  ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}>
              <span className="w-5 flex items-center justify-center shrink-0">{item.icon}</span>
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
          <span className="w-5 flex items-center justify-center">{Icons.logout}</span>
          Sair
        </button>
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [modeChanging, setModeChanging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => d.user && setUser(d.user)).catch(() => {});
  }, []);

  // fechar sidebar ao trocar de rota no mobile
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

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
  const sidebarProps = { user, pathname, modeChanging, isPersonal, toggleMode, logout, onNavClick: () => setSidebarOpen(false) };

  return (
    <div className="flex h-screen bg-[#F1F5F9]">
      {/* Sidebar — desktop (lg+) */}
      <div className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0 shadow-sm">
        <SidebarContent {...sidebarProps} />
      </div>

      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          {/* Drawer */}
          <div className="relative w-72 max-w-[85vw] h-full bg-white flex flex-col shadow-xl">
            <SidebarContent {...sidebarProps} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — mobile only */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition">
            {Icons.menu}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <span className="font-bold text-slate-900 text-sm">ControlaAI</span>
          </div>
          {user && (
            <span className="ml-auto text-xs text-slate-500 truncate max-w-[120px]">
              {isPersonal ? "👤 Pessoal" : "🏢 Empresa"}
            </span>
          )}
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <main className="p-4 sm:p-6 max-w-6xl mx-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
