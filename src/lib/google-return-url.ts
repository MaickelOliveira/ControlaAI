const ZELO_PUBLIC_ORIGIN = "https://zelogestaointeligente.com.br";

export type GoogleReturnLocale = "pt-BR" | "pt-PT" | "es";

/**
 * O callback pode ser recebido pelo endereço interno do servidor, mas o
 * navegador do cliente sempre deve voltar para o domínio público do Zelo.
 */
export function getGoogleSettingsReturnUrl(locale: GoogleReturnLocale = "pt-BR"): URL {
  const settingsPath = locale === "es"
    ? "/es/dashboard/configuracoes"
    : locale === "pt-PT"
      ? "/pt/dashboard/configuracoes"
      : "/dashboard/configuracoes";

  return new URL(settingsPath, ZELO_PUBLIC_ORIGIN);
}
