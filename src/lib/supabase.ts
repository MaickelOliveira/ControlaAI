import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente único do Supabase, com a service role key — só roda no
 *  servidor (rotas de API e lib/*), nunca é exposto ao navegador. Sem as
 *  envs configuradas, falha alto e cedo em vez de tentar conectar em lugar
 *  nenhum silenciosamente. */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados — defina essas variáveis de ambiente antes de iniciar o servidor.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
