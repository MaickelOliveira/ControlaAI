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
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🤖</span>
            <div>
              <p className="text-white font-bold text-sm leading-none">ControlaAI</p>
              <p className="text-emerald-400 text-xs mt-0.5">Admin Panel</p>
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
