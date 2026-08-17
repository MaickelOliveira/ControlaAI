-- Guarda a última requisição recebida em /api/webhook/billing/[id], mesmo
-- quando a integração está desativada ou a autenticação falha — sem isso não
-- dá pra saber se a Hotmart/Kiwify chegou a mandar o webhook, se o token
-- bateu, ou se simplesmente ninguém tinha ligado a integração ainda.
alter table public.billing_webhooks add column if not exists last_attempt jsonb;
