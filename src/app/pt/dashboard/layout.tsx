"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import UiIcon from "@/components/UiIcon";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

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
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="1" y1="10" x2="23" y2="10" strokeLinecap="round" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4.5 h-4.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h13a1 1 0 011 1v3M3 7v10a2 2 0 002 2h14a2 2 0 002-2v-6a1 1 0 00-1-1h-4a2 2 0 100 4h5" />
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
  { href: "/pt/dashboard", label: "Dashboard", icon: Icons.home },
  { href: "/pt/dashboard/financas", label: "Finanças", icon: Icons.chart },
  { href: "/pt/dashboard/contas", label: "Contas", icon: Icons.wallet },
  { href: "/pt/dashboard/tarefas", label: "Tarefas", icon: Icons.tasks },
  { href: "/pt/dashboard/metas", label: "Metas", icon: Icons.target },
  { href: "/pt/dashboard/veiculos", label: "Veículos", icon: Icons.car },
  { href: "/pt/dashboard/lembretes", label: "Lembretes", icon: Icons.bell },
  { href: "/pt/dashboard/drive", label: "Drive", icon: Icons.folder },
  { href: "/pt/dashboard/agenda", label: "Agenda", icon: Icons.calendar },
];
const BUSINESS_NAV = [
  { href: "/pt/dashboard/funcionarios", label: "Funcionários", icon: Icons.users },
  { href: "/pt/dashboard/clientes", label: "Clientes", icon: Icons.card },
];
const PERSONAL_NAV = [
  { href: "/pt/dashboard/supermercado", label: "Supermercado", icon: Icons.cart },
  { href: "/pt/dashboard/contatos", label: "Contactos", icon: Icons.users },
];
const CONFIG_NAV = [
  { href: "/pt/dashboard/configuracoes", label: "Configurações", icon: Icons.settings },
];

type User = { name: string; plan: string; status: string; activeMode: string; trialEndsAt: string };

function SidebarContent({
  user,
  pathname,
  logout,
  onNavClick,
}: {
  user: User | null;
  pathname: string;
  logout: () => void;
  onNavClick: () => void;
}) {
  const [now] = useState(() => Date.now());
  const navItems = [
    ...BASE_NAV,
    ...(user?.activeMode === "business" ? BUSINESS_NAV : PERSONAL_NAV),
    ...CONFIG_NAV,
  ];

  return (
    <>
      {/* Logo */}
      <div className="z-sidebar-brand">
        <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="z-wordmark z-wordmark-dark" priority />
        <Image src="/brand/zelo-wordmark-light.png" alt="" width={640} height={293} className="z-wordmark z-wordmark-light" />
        <p className="text-subtle text-[10px] mt-2">Gestão inteligente</p>
      </div>

      {/* Navigation */}
      <nav className="z-nav flex-1 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} onClick={onNavClick}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition",
                isActive
                  ? "bg-amber-soft text-amber-ink font-semibold border border-line"
                  : "text-muted hover:text-ink hover:bg-surface-muted"
              )}>
              <span className="w-5 flex items-center justify-center shrink-0">{item.icon}</span>
              {item.label}
              {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </Link>
          );
        })}
      </nav>

      {/* User info + Mode toggle */}
      {user && (
        <div className="z-sidebar-profile">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-surface-muted flex items-center justify-center text-sm font-bold text-muted">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-ink text-xs font-semibold truncate">{user.name}</p>
              <p className="text-subtle text-[10px]">
                {user.status === "trial"
                  ? `Trial · ${Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - now) / 86400000))} dias`
                  : "Plano Ativo"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="p-3 border-t border-line space-y-1">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-subtle hover:text-ink hover:bg-surface-muted transition">
          <span className="w-5 flex items-center justify-center">{Icons.logout}</span>
          Sair
        </button>
        <p className="px-3 text-[10px] text-subtle">
          <Link href="/dashboard" className="hover:text-muted hover:underline">Português (Brasil)</Link>
          {" · "}
          <Link href="/es/dashboard" className="hover:text-muted hover:underline">Español</Link>
        </p>
      </div>
    </>
  );
}

export default function DashboardLayoutPt({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchDashboardMe().then(d => d.user && setUser(d.user)).catch(() => {});
  }, []);

  // Fecha a sidebar ao trocar de rota (mobile) — ajusta o estado durante o
  // render em vez de um efeito, seguindo o padrão recomendado pelo React
  // pra "resetar estado quando uma prop muda".
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setSidebarOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/pt/login");
  }

  const isPersonal = user?.activeMode !== "business";
  const sidebarProps = { user, pathname, logout, onNavClick: () => setSidebarOpen(false) };

  return (
    <div className="zelo-app z-shell">
      {/* Sidebar — desktop (lg+) */}
      <div className="z-sidebar hidden lg:flex flex-col shrink-0">
        <SidebarContent {...sidebarProps} />
      </div>

      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          {/* Drawer */}
          <div className="relative w-72 max-w-[85vw] h-full bg-surface flex flex-col shadow-xl">
            <SidebarContent {...sidebarProps} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="z-workspace">
        {/* Top bar — mobile only */}
        <div className="z-mobile-topbar lg:hidden flex items-center gap-3 px-4 py-3 border-b border-line shrink-0">
          <button aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-muted hover:bg-surface-muted transition">
            {Icons.menu}
          </button>
          <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="z-wordmark z-wordmark-dark" /><Image src="/brand/zelo-wordmark-light.png" alt="" width={640} height={293} className="z-wordmark z-wordmark-light"/>
          {user && (
            <span className="z-mobile-mode-badge" data-mode={isPersonal ? "personal" : "business"}>
              <UiIcon name={isPersonal ? "person" : "business"}/>
              {isPersonal ? "Pessoal" : "Empresa"}
            </span>
          )}
        </div>

        {/* Page content */}
        {pathname!=="/pt/dashboard"&&<WorkspaceHeader name={user?.name} mode={user?.activeMode}/>}
        <div className="flex-1 overflow-auto">
          <main className="z-main">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
