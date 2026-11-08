import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Política de Privacidade — Zelo Gestão Inteligente",
  description: "Saiba como a Zelo usa seus dados pessoais, bancários e do Google Calendar, como desconectar um banco e como solicitar a exclusão de dados.",
};

export default function PrivacyPage() {
  return <LegalDocument locale="pt-BR" kind="privacy" />;
}
