import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Términos de Uso — Zelo Gestión Inteligente",
  description: "Términos aplicables al uso de Zelo Gestión Inteligente.",
};

export default function TermsPageEs() {
  return <LegalDocument locale="es" kind="terms" />;
}
