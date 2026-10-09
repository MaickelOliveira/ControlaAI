import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "Zelo · Teste isolado da Polp",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body><main className="mx-auto max-w-6xl p-6 md:p-10">{children}</main></body></html>;
}
