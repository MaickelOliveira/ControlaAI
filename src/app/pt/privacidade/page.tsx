import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Política de Privacidade — Zelo Gestão Inteligente",
  description: "Como o Zelo recolhe, utiliza, armazena e protege dados pessoais e dados autorizados do Google Calendar.",
};

export default function PrivacyPagePt() {
  return <LegalDocument locale="pt-PT" kind="privacy" />;
}
