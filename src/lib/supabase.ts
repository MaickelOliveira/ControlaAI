import {COMPANY_TABLES,scopeCompanyRequest,type CompanyScope} from "./company-scope-policy";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente único do Supabase, com a service role key — só roda no
 *  servidor (rotas de API e lib/*), nunca é exposto ao navegador. Sem as
 *  envs configuradas, falha alto e cedo em vez de tentar conectar em lugar
 *  nenhum silenciosamente. */
let client: SupabaseClient | null = null;
const companyScopeKey=Symbol.for("zelo.companyDatabaseScope");
type ScopeResolver=()=>Promise<CompanyScope|{trusted:true}|undefined>;
const scopeRegistry=globalThis as typeof globalThis & {[companyScopeKey]?:ScopeResolver};
/** Register only from the Node server instrumentation, never from a client component. */
export function configureCompanyDatabaseScope(resolver:ScopeResolver):void {scopeRegistry[companyScopeKey]=resolver;}
export async function resolveCompanyDatabaseScope():Promise<CompanyScope|undefined> {
  if(process.env.MULTI_COMPANY_ENABLED!=="true")return undefined;
  const resolver=scopeRegistry[companyScopeKey];if(!resolver)throw Error("COMPANY_DATABASE_SCOPE_UNAVAILABLE");
  const scope=await resolver();if(!scope)throw Error("COMPANY_DATABASE_SCOPE_UNAVAILABLE");
  return "trusted" in scope?undefined:scope;
}

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
  client = createClient(normalizeProjectUrl(rawUrl), key, {
    auth: { persistSession: false },
    global:{fetch:async(input,init)=>{
      const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
      const table=url.pathname.split("/").at(-1)!;
      if(process.env.MULTI_COMPANY_ENABLED!=="true"||!url.pathname.startsWith("/rest/v1/")||!COMPANY_TABLES.has(table))return fetch(input,init);
      const resolveCompanyScope=scopeRegistry[companyScopeKey];
      if(!resolveCompanyScope)throw Error("COMPANY_DATABASE_SCOPE_UNAVAILABLE");
      const scope=await resolveCompanyScope();
      if(!scope)throw Error("COMPANY_DATABASE_SCOPE_UNAVAILABLE");
      if("trusted" in scope)return fetch(input,init);
      const request=scopeCompanyRequest(url,init??{},scope);
      return fetch(request.url,request.init);
    }},
  });
  return client;
}
