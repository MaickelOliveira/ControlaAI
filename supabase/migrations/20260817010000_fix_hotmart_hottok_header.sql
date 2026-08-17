-- O webhook Hotmart 2.0 envia o Hottok no header X-HOTMART-HOTTOK.
-- Corrige integrações criadas pelo preset antigo, que procurava no JSON.
update public.billing_webhooks
set
  secret_header = 'X-HOTMART-HOTTOK',
  secret_body_field = null
where lower(label) = 'hotmart'
  and secret_body_field = 'hottok'
  and secret_header is null;
