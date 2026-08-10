import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente único do Supabase, com a service role key — só roda no
 *  servidor (rotas de API e lib/*), nunca é exposto ao navegador. Sem as
 *  envs configuradas, falha alto e cedo em vez de tentar conectar em lugar
 *  nenhum silenciosamente. */
let client: SupabaseClient | null = null;

/** createClient() já monta .../rest/v1, .../auth/v1 etc a partir da URL
 *  base do projeto — se a env vier com "/rest/v1" colado (comum copiar da
 *  tela errada do painel do Supabase), duplicaria o caminho e todo request
 *  falharia. Normaliza pra sempre sobrar só a URL base do projeto. */
function normalizeProjectUrl(url: string): string {
  return url.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados — defina essas variáveis de ambiente antes de iniciar o servidor.");
  }
  client = createClient(normalizeProjectUrl(rawUrl), key, { auth: { persistSession: false } });
  return client;
}
