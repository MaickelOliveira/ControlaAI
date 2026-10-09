import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "Zelo · Prévia privada do Open Finance Brasil",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
