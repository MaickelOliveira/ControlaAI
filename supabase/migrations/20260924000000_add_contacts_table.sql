-- Contatos pessoais: equivalente a "clientes", só que para o modo pessoal —
-- família, amigos e prestadores do dia a dia que o usuário quer poder citar
-- pelo nome (lembretes, avisos) sem redigitar o telefone toda vez.
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  relation text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists contacts_user_idx on contacts(user_id);
