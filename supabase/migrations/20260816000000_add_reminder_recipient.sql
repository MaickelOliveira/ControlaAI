-- Lembretes até aqui só disparavam de volta pra quem criou (phone sempre =
-- número do próprio dono). Feature "Assessor notifica por você": permitir
-- apontar o lembrete pra um cliente, funcionário ou outro número qualquer.
-- "phone" continua sendo o número real de envio; essas duas colunas novas
-- são só metadado de exibição/roteamento (quem é o destinatário e de onde
-- veio esse destinatário).
alter table public.reminders add column if not exists recipient_type text not null default 'self';
alter table public.reminders add column if not exists recipient_name text;
