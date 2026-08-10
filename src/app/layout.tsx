import type { Metadata } from "next";
import { Inter } from "next/font/google";
import MetaTracking from "@/components/MetaTracking";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://controlaai.app"),
  title: "Zelo — Organize sua rotina pelo WhatsApp",
  description: "Finanças, agenda, tarefas e documentos organizados por IA no WhatsApp. Escolha seu plano com 7 dias de garantia.",
  icons: { icon: "/brand/zelo-icon.png" },
  openGraph: {
    title: "Zelo — Organize sua rotina pelo WhatsApp",
    description: "Finanças, agenda, tarefas e documentos organizados por IA, com 7 dias de garantia.",
    type: "website",
    locale: "pt_BR",
    siteName: "Zelo",
    images: [{ url: "/og-zelo.png", width: 1536, height: 1024, alt: "Zelo — organização inteligente pelo WhatsApp" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zelo — Organize sua rotina pelo WhatsApp",
    description: "Finanças, agenda, tarefas e documentos organizados por IA, com 7 dias de garantia.",
    images: ["/og-zelo.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {children}
        <MetaTracking />
      </body>
    </html>
  );
}
