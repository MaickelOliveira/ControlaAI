"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

const navItems = [
  { href: "/admin", label: "Visão Geral", icon: "📊" },
  { href: "/admin/clientes", label: "Clientes", icon: "👥" },
  { href: "/admin/whatsapp", label: "WhatsApp Bot", icon: "📱" },
  { href: "/admin/configuracoes", label: "Configurações", icon: "⚙️" },
];

function SidebarContent({ pathname, logout, onNavClick }: { pathname: string; logout: () => void; onNavClick: () => void }) {
  return (
    <>
      <div className="p-5 border-b border-slate-100">
        <div className="mb-4 text-center">
          <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="mx-auto h-auto w-full max-w-[150px]" priority />
          <p className="text-slate-400 text-base mt-1.5">Painel do Dono</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-700">Modo Administrador</p>
            <p className="text-[10px] text-amber-500">Acesso total à plataforma</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <Link key={item.href} href={item.href} onClick={onNavClick}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition",
              pathname === item.href
                ? "bg-amber-50 text-amber-700 font-semibold border border-amber-200"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}>
            <span className="text-base">{item.icon}</span>
            {item.label}
            {pathname === item.href && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition">
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

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="flex h-screen bg-[#F1F5F9]">
      {/* Sidebar — desktop */}
      <div className="hidden lg:flex w-60 bg-white border-r border-slate-200 flex-col shrink-0 shadow-sm">
        <SidebarContent pathname={pathname} logout={logout} onNavClick={() => setSidebarOpen(false)} />
      </div>

      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full bg-white flex flex-col shadow-xl">
            <SidebarContent pathname={pathname} logout={logout} onNavClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — mobile only */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="h-9 w-auto" />
            <span className="font-semibold text-slate-500 text-xs">Admin</span>
          </div>
        </div>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
