import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Política de Privacidad — Zelo Gestión Inteligente",
  description: "Cómo Zelo recopila, utiliza, almacena y protege datos personales y datos autorizados de Google Calendar.",
};

export default function PrivacyPageEs() {
  return <LegalDocument locale="es" kind="privacy" />;
}
