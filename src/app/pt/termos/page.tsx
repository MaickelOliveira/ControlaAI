import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Termos de Utilização — Zelo Gestão Inteligente",
  description: "Termos aplicáveis à utilização do Zelo Gestão Inteligente.",
};

export default function TermsPagePt() {
  return <LegalDocument locale="pt-PT" kind="terms" />;
}
