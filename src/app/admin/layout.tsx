"use client";
import { useState } from "react";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

const navItems = [
  { href: "/admin", label: "Visão Geral", icon: <UiIcon name="home" className="h-4 w-4"/> },
  { href: "/admin/clientes", label: "Clientes", icon: <UiIcon name="users" className="h-4 w-4"/> },
  { href: "/admin/faturamento", label: "Faturamento", icon: <UiIcon name="finance" className="h-4 w-4"/> },
  { href: "/admin/faturamento/webhooks", label: "Webhooks de Venda", icon: <UiIcon name="repeat" className="h-4 w-4"/> },
  { href: "/admin/whatsapp", label: "WhatsApp Bot", icon: <UiIcon name="client" className="h-4 w-4"/> },
  { href: "/admin/inbox", label: "Inbox", icon: <UiIcon name="client" className="h-4 w-4"/> },
  { href: "/admin/configuracoes", label: "Configurações", icon: <UiIcon name="settings" className="h-4 w-4"/> },
];

function SidebarContent({ pathname, logout, onNavClick }: { pathname: string; logout: () => void; onNavClick: () => void }) {
  return (
    <>
      <div className="p-5 border-b border-line">
        <div className="mb-4 text-center">
          <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="z-wordmark z-wordmark-dark" priority /><Image src="/brand/zelo-wordmark-light.png" alt="" width={640} height={293} className="z-wordmark z-wordmark-light"/>
          <p className="text-subtle text-base mt-1.5">Painel do Dono</p>
        </div>
        <div className="rounded-xl border border-line bg-amber-soft px-3 py-2.5 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-ink">Modo Administrador</p>
            <p className="text-[10px] text-amber-500">Acesso total à plataforma</p>
          </div>
        </div>
      </div>

      <nav className="z-nav flex-1 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={onNavClick}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition",
              pathname === item.href
                ? "bg-amber-soft text-amber-ink font-semibold border border-line"
                : "text-muted hover:text-ink hover:bg-surface-muted"
            )}>
            <span className="text-base">{item.icon}</span>
            {item.label}
            {pathname === item.href && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-line">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-subtle hover:text-ink hover:bg-surface-muted transition">
          🚪 Sair
        </button>
      </div>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fecha a sidebar ao trocar de rota (mobile) — ajusta o estado durante o
  // render em vez de um efeito, seguindo o padrão recomendado pelo React
  // pra "resetar estado quando uma prop muda" (evita o round-trip extra de
  // render → efeito → novo render).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setSidebarOpen(false);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="zelo-app z-shell">
      {/* Sidebar — desktop */}
      <div className="z-sidebar hidden lg:flex flex-col shrink-0">
        <SidebarContent pathname={pathname} logout={logout} onNavClick={() => setSidebarOpen(false)} />
      </div>

      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full bg-surface flex flex-col shadow-xl">
            <SidebarContent pathname={pathname} logout={logout} onNavClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="z-workspace">
        {/* Top bar — mobile only */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-surface border-b border-line shrink-0">
          <button onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-muted hover:bg-surface-muted transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="z-wordmark z-wordmark-dark" /><Image src="/brand/zelo-wordmark-light.png" alt="" width={640} height={293} className="z-wordmark z-wordmark-light"/>
            <span className="font-semibold text-muted text-xs">Admin</span>
          </div>
        </div>

        <WorkspaceHeader admin/>
        <main className="z-main flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
