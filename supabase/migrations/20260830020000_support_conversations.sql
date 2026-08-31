-- Chat de suporte in-app (widget dentro do painel logado), canal separado
-- do Inbox do WhatsApp (tabela "conversations", por telefone) — aqui a
-- chave é o usuário logado da plataforma, não um telefone.
create table if not exists support_conversations (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null default '{"messages":[],"lastActivity":0,"status":"none"}'
);
