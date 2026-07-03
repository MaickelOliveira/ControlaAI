"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

const navItems = [
  { href: "/admin", label: "Visão Geral", icon: "📊" },
  { href: "/admin/clientes", label: "Clientes", icon: "👥" },
  { href: "/admin/whatsapp", label: "WhatsApp Bot", icon: "📱" },
  { href: "/admin/configuracoes", label: "Configurações", icon: "⚙️" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar admin */}
      <div className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-xl">🤖</span>
            <div>
              <p className="text-white font-bold text-sm leading-none">ControlaAI</p>
              <p className="text-emerald-400 text-xs mt-0.5">Painel do Dono</p>
            </div>
          </div>
          {/* Badge de modo */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 text-amber-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-300">Modo Administrador</p>
              <p className="text-[10px] text-amber-500/70">Acesso total à plataforma</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
                pathname === item.href
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-white hover:bg-slate-800 transition">
            🚪 Sair
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-slate-950 p-6">
        {children}
      </main>
    </div>
  );
}
