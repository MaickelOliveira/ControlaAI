import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Política de Privacidade — Zelo Gestão Inteligente",
  description: "Como o Zelo coleta, utiliza, armazena e protege dados pessoais e dados autorizados do Google Calendar.",
};

export default function PrivacyPage() {
  return <LegalDocument locale="pt-BR" kind="privacy" />;
}
