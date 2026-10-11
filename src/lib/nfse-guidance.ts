export const FISCAL_CERTIFICATE_GUIDANCE = [
 { title: "MEI · portal ou aplicativo oficial", text: "Pode emitir NFS-e de serviço sem certificado digital, usando sua conta gov.br ou cadastro com senha no emissor nacional." },
 { title: "Emissão automática pela Zelo · inclusive MEI", text: "Precisa de certificado digital: a API oficial exige assinatura digital. Para a integração da Zelo, use o certificado A1 da própria empresa. Cadastrar serviços e preparar rascunhos não exige certificado. A emissão pela Zelo ainda aguarda homologação e não está disponível." },
 { title: "Outras empresas · emissão fora da Zelo", text: "A exigência depende do emissor e das regras aplicáveis à empresa. Confira no emissor nacional ou municipal utilizado. A dispensa do MEI no portal não deve ser aplicada automaticamente a outros casos." },
] as const;
export const FISCAL_CERTIFICATE_SOURCE = "https://www.gov.br/nfse/pt-br/nt-2023-001-obrigatoriedade-da-nfs-e-nacional-para-o-mei.pdf";
export function isFiscalCertificateQuestion(message: string): boolean {
 const text = message.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
 return /\bcertificado(?: digital)?\b/.test(text)
  && /\b(?:mei|nota fiscal|nfs[ -]?e|emitir)\b/.test(text)
  && (/\b(?:preciso|precisa|necessario|obrigatorio|exigido|quem|como|posso|quanto|sem)\b/.test(text) || text.includes("?"))
  && !/\b(?:gastei|paguei|comprei|recebi|registre|anote|lance)\b/.test(text);
}
