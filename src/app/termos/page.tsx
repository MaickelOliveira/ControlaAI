import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Termos de Uso — Zelo Gestão Inteligente",
  description: "Termos aplicáveis ao uso do Zelo Gestão Inteligente.",
};

export default function TermsPage() {
  return <LegalDocument locale="pt-BR" kind="terms" />;
}
